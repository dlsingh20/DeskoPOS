"""
Information Request Forms (IRF) for new clients.

Super Admin creates a form and sends the client its secret link (/irf/<token>/). Through the
link the client saves as often as they like and submits once; after that the link is read
only until Super Admin reopens it. Super Admin can also edit any form, submitted or not,
through an edit link that carries a short-lived signed key.
"""
import json
import secrets
from pathlib import Path

from django.conf import settings
from django.core import signing
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import tenancy
from core.exceptions import ApiError

from . import irf_import, irf_pdf, irf_schema
from .models import Country, OnboardingFile, OnboardingForm, PlatformAuditLog
from .serializers import TenantSerializer
from .views import PlatformView

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 15
MAX_DATA_BYTES = 512 * 1024
EDIT_KEY_SALT = 'irf-edit'
EDIT_KEY_HOURS = 8
PAGE = Path(__file__).with_name('irf_page.html')
LOCAL_HOSTS = ('localhost', '127.0.0.1', 'testserver')


def client_ip(request):
    return request.META.get('REMOTE_ADDR')


def options():
    return {'countries': list(Country.objects.order_by('name').values_list('code', 'name'))}


def form_link(request, form):
    """The client's link. IRF_BASE_URL (e.g. https://api.posdesko.com) wins over the request's host."""
    base = settings.IRF_BASE_URL or request.build_absolute_uri('/').rstrip('/')
    if base.startswith('http://') and request.get_host().split(':')[0] not in LOCAL_HOSTS:
        base = 'https://' + base[len('http://'):]  # behind the hosting proxy the request looks like http
    return f'{base}/irf/{form.token}/'


def file_out(file):
    return {'id': file.id, 'field': file.field, 'name': file.name, 'size': file.size,
            'content_type': file.content_type, 'uploaded_at': file.uploaded_at}


def files_of(form):
    return list(form.files.defer('content'))


def file_counts(files):
    counts = {}
    for file in files:
        counts[file.field] = counts.get(file.field, 0) + 1
    return counts


def problems_of(form, files=None):
    return irf_schema.problems(form.data or {}, file_counts(files if files is not None else files_of(form)))


def download(content, filename, content_type):
    response = HttpResponse(content, content_type=content_type)
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['Cache-Control'] = 'no-store'
    return response


def export_name(form, extension):
    return f'IRF-{form.id}-{slugify(form.title) or "client"}.{extension}'


def export_json(form, files):
    return {
        'schema': irf_schema.SCHEMA_ID,
        'form_id': form.id,
        'title': form.title,
        'status': form.status,
        'submitted_at': form.submitted_at.isoformat() if form.submitted_at else None,
        'exported_at': timezone.now().isoformat(),
        'data': form.data,
        'files': [{k: v for k, v in file_out(f).items() if k != 'uploaded_at'} for f in files],
    }


def save_data(form, data, version, saved_by):
    """Clean and store the answers. version must match the stored one, so nobody overwrites newer answers."""
    if version is not None and str(version) != str(form.version):
        raise ApiError('This form was changed somewhere else since you opened it. Reload the page to see '
                       'the latest answers.', code='stale_version', status_code=409)
    if len(json.dumps(data, default=str)) > MAX_DATA_BYTES:
        raise ApiError('The form is too large to save.', code='too_large')
    form.data = irf_schema.clean(data, options())
    form.version += 1
    form.last_saved_by = saved_by
    form.last_saved_at = timezone.now()
    form.save(update_fields=['data', 'version', 'last_saved_by', 'last_saved_at', 'updated_at'])


def add_file(form, field, upload, uploaded_by):
    if field not in irf_schema.file_fields():
        raise ApiError('Unknown file field.', code='invalid_field')
    if upload is None:
        raise ApiError('Choose a file.', code='no_file')
    if upload.size > MAX_FILE_BYTES:
        raise ApiError('Files can be up to 10 MB.', code='file_too_large')
    allowed = irf_schema.file_fields()[field]['accept'].split(',')
    if not any(upload.name.lower().endswith(ext) for ext in allowed):
        raise ApiError(f'Allowed file types: {", ".join(allowed)}', code='file_type')
    if form.files.count() >= MAX_FILES:
        raise ApiError(f'A form can have up to {MAX_FILES} files.', code='too_many_files')
    if not irf_schema.file_fields()[field].get('multiple'):
        form.files.filter(field=field).delete()  # a single-file field (logo) keeps the latest one
    return OnboardingFile.objects.create(
        form=form, field=field, name=Path(upload.name).name[:200], size=upload.size,
        content_type=upload.content_type or 'application/octet-stream', content=upload.read(),
        uploaded_by=uploaded_by)


# ---- The client's page and its API (the token is the only credential) --------------------

def page(request, token):
    """The form page. The same HTML for every token; it loads the form through the API."""
    response = HttpResponse(PAGE.read_text(encoding='utf-8'), content_type='text/html; charset=utf-8')
    response['Referrer-Policy'] = 'no-referrer'  # the link is the key: never pass it on to other sites
    response['X-Robots-Tag'] = 'noindex, nofollow'
    response['X-Frame-Options'] = 'DENY'
    response['Cache-Control'] = 'no-store'
    return response


class PublicFormView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        tenancy.act_as_platform()

    def form(self, token, lock=False):
        qs = OnboardingForm.objects.select_for_update() if lock else OnboardingForm.objects
        form = qs.filter(token=token).first()
        if form is None:
            raise ApiError('This link is not valid. Please ask us for a new one.', code='not_found', status_code=404)
        return form

    def editor(self, request, form):
        """'client', or the Super Admin's email when the request carries a valid edit key for this form."""
        key = request.headers.get('X-IRF-Key') or ''
        if key:
            try:
                signed = signing.loads(key, salt=EDIT_KEY_SALT, max_age=EDIT_KEY_HOURS * 3600)
            except signing.BadSignature:
                raise ApiError('This edit link has expired. Open the form again from the Super Admin console.',
                               code='edit_key_expired', status_code=403)
            if signed.get('form') == form.id:
                return signed.get('email') or 'admin'
        return 'client'

    def require_editable(self, form, editor):
        if form.status == 'submitted' and editor == 'client':
            raise ApiError('This form has been submitted. Contact us if you need to change something.',
                           code='submitted', status_code=409)


class PublicForm(PublicFormView):
    def get(self, request, token):
        form = self.form(token)
        editor = self.editor(request, form)
        files = files_of(form)
        return Response({
            'id': form.id,
            'title': form.title,
            'status': form.status,
            'version': form.version,
            'submitted_at': form.submitted_at,
            'last_saved_at': form.last_saved_at,
            'editor': 'admin' if editor != 'client' else 'client',
            'editable': not (form.status == 'submitted' and editor == 'client'),
            'schema': irf_schema.public_schema(options()),
            'data': form.data,
            'files': [file_out(f) for f in files],
            'limits': {'file_bytes': MAX_FILE_BYTES, 'files': MAX_FILES},
        })

    def put(self, request, token):
        form = self.form(token, lock=True)
        editor = self.editor(request, form)
        self.require_editable(form, editor)
        save_data(form, request.data.get('data'), request.data.get('version'), editor)
        return Response({'version': form.version, 'data': form.data, 'last_saved_at': form.last_saved_at})


class PublicSubmit(PublicFormView):
    def post(self, request, token):
        form = self.form(token, lock=True)
        editor = self.editor(request, form)
        self.require_editable(form, editor)
        if form.status == 'submitted':
            raise ApiError('This form is already submitted.', code='submitted', status_code=409)
        save_data(form, request.data.get('data'), request.data.get('version'), editor)
        found = problems_of(form)
        if found:
            # The answers are saved; the client fixes what's missing and submits again
            return Response({'code': 'incomplete', 'detail': 'Some required answers are missing.',
                             'problems': found, 'version': form.version}, status=400)
        form.status = 'submitted'
        form.submitted_at = timezone.now()
        form.save(update_fields=['status', 'submitted_at', 'updated_at'])
        PlatformAuditLog.objects.create(action='onboarding.submitted', ip_address=client_ip(request),
                                        details={'form': form.id, 'title': form.title, 'by': editor})
        return Response({'status': form.status, 'submitted_at': form.submitted_at, 'version': form.version})


class PublicFiles(PublicFormView):
    def post(self, request, token):
        form = self.form(token, lock=True)
        editor = self.editor(request, form)
        self.require_editable(form, editor)
        file = add_file(form, str(request.data.get('field', '')), request.FILES.get('file'), editor)
        return Response(file_out(file), status=201)


class PublicFile(PublicFormView):
    def get(self, request, token, file_id):
        form = self.form(token)
        file = get_object_or_404(OnboardingFile, form=form, id=file_id)
        return download(bytes(file.content), file.name, file.content_type)

    def delete(self, request, token, file_id):
        form = self.form(token, lock=True)
        editor = self.editor(request, form)
        self.require_editable(form, editor)
        get_object_or_404(OnboardingFile, form=form, id=file_id).delete()
        return Response(status=204)


class PublicPdf(PublicFormView):
    """The client may download a copy of what they filled in."""
    def get(self, request, token):
        form = self.form(token)
        return download(irf_pdf.render(form, files_of(form), options()), export_name(form, 'pdf'), 'application/pdf')


# ---- Super Admin --------------------------------------------------------------------------

class OnboardingFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = OnboardingForm
        fields = ['id', 'title', 'contact_name', 'contact_email', 'contact_phone', 'notes', 'status', 'version',
                  'last_saved_by', 'last_saved_at', 'submitted_at', 'tenant', 'created_at', 'updated_at']
        read_only_fields = ['status', 'version', 'last_saved_by', 'last_saved_at', 'submitted_at', 'tenant',
                            'created_at', 'updated_at']


def admin_detail(request, form):
    files = files_of(form)
    return {
        **OnboardingFormSerializer(form).data,
        'link': form_link(request, form),
        'data': form.data,
        'files': [file_out(f) for f in files],
        'problems': problems_of(form, files),
        'schema': irf_schema.public_schema(options()),
    }


def audit(request, action, form, **details):
    PlatformAuditLog.objects.create(platform_user=request.user, action=action, ip_address=client_ip(request),
                                    details={'form': form.id, 'title': form.title, **details})


class FormListCreate(PlatformView, APIView):
    def get(self, request):
        forms = OnboardingForm.objects.all()
        status_filter = request.query_params.get('status')
        if status_filter:
            forms = forms.filter(status=status_filter)
        return Response({'results': [{**OnboardingFormSerializer(f).data, 'link': form_link(request, f)}
                                     for f in forms[:500]]})

    def post(self, request):
        body = OnboardingFormSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        values = body.validated_data
        # Start the form with what we already know, so the client only checks it
        data = irf_schema.clean({
            'business': {'name': values['title'], 'country': 'IN'},
            'contact': {'name': values.get('contact_name'), 'email': values.get('contact_email'),
                        'phone': values.get('contact_phone')},
            'outlets': [{}],
        }, options())
        form = OnboardingForm.objects.create(**values, token=secrets.token_urlsafe(32), data=data,
                                             created_by=request.user)
        audit(request, 'onboarding.create', form)
        return Response(admin_detail(request, form), status=201)


class FormDetail(PlatformView, APIView):
    def get(self, request, pk):
        return Response(admin_detail(request, get_object_or_404(OnboardingForm, pk=pk)))

    def patch(self, request, pk):
        form = get_object_or_404(OnboardingForm.objects.select_for_update(), pk=pk)
        body = OnboardingFormSerializer(form, data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        body.save()
        return Response(admin_detail(request, form))

    def delete(self, request, pk):
        form = get_object_or_404(OnboardingForm, pk=pk)
        audit(request, 'onboarding.delete', form)
        form.delete()
        return Response(status=204)


class FormReopen(PlatformView, APIView):
    """Let the client change a submitted form again."""
    def post(self, request, pk):
        form = get_object_or_404(OnboardingForm.objects.select_for_update(), pk=pk)
        if form.status != 'draft':
            form.status = 'draft'
            form.save(update_fields=['status', 'updated_at'])
            audit(request, 'onboarding.reopen', form)
        return Response(admin_detail(request, form))


class FormNewLink(PlatformView, APIView):
    """A new secret link; the old one stops working (e.g. it was sent to the wrong person)."""
    def post(self, request, pk):
        form = get_object_or_404(OnboardingForm.objects.select_for_update(), pk=pk)
        form.token = secrets.token_urlsafe(32)
        form.save(update_fields=['token', 'updated_at'])
        audit(request, 'onboarding.new_link', form)
        return Response(admin_detail(request, form))


class FormEditLink(PlatformView, APIView):
    """The form page in edit mode for Super Admin: works on submitted forms, for EDIT_KEY_HOURS."""
    def post(self, request, pk):
        form = get_object_or_404(OnboardingForm, pk=pk)
        key = signing.dumps({'form': form.id, 'email': request.user.email}, salt=EDIT_KEY_SALT)
        audit(request, 'onboarding.edit_link', form)
        return Response({'url': f'{form_link(request, form)}#key={key}', 'hours': EDIT_KEY_HOURS})


class FormExportJson(PlatformView, APIView):
    def get(self, request, pk):
        form = get_object_or_404(OnboardingForm, pk=pk)
        body = json.dumps(export_json(form, files_of(form)), indent=2, ensure_ascii=False, default=str)
        return download(body.encode('utf-8'), export_name(form, 'json'), 'application/json')


class FormExportPdf(PlatformView, APIView):
    def get(self, request, pk):
        form = get_object_or_404(OnboardingForm, pk=pk)
        return download(irf_pdf.render(form, files_of(form), options()), export_name(form, 'pdf'), 'application/pdf')


class FormFile(PlatformView, APIView):
    def get(self, request, pk, file_id):
        file = get_object_or_404(OnboardingFile, form_id=pk, id=file_id)
        return download(bytes(file.content), file.name, file.content_type)


class ImportPreview(PlatformView, APIView):
    """What creating a restaurant from a form (or its JSON export) will do. Writes nothing."""
    def post(self, request):
        return Response(irf_import.plan_import(request.data).summary())


class ImportRun(PlatformView, APIView):
    """Create the restaurant. Answers with the sign-in details, shown this once."""
    def post(self, request):
        tenant, credentials, plan = irf_import.run_import(request.data, created_by=request.user, ip=client_ip(request))
        return Response({'tenant': TenantSerializer(tenant).data, 'credentials': credentials,
                         'summary': plan.summary()}, status=201)
