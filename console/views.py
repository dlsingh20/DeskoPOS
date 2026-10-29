import pyotp
from django.conf import settings
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from core import tenancy, tokens
from core.authentication import PlatformTokenAuthentication
from core.exceptions import ApiError
from core.permissions import IsPlatformUser, PlatformRole

from . import provisioning
from .models import Country, Plan, PlatformAuditLog, PlatformUser, Tenant
from .serializers import (
    LOGIN_ID_RE, ChangeOwnPasswordSerializer, CountrySerializer, PlanSerializer, PlatformAuditSerializer, ResetAdminPasswordSerializer,
    StatusChangeSerializer, StatusHistorySerializer, TenantCreateSerializer, TenantSerializer,
)


LOCAL_ADDRESSES = ('127.0.0.1', '::1')


def client_ip(request):
    return request.META.get('REMOTE_ADDR')


class PlatformView:
    authentication_classes = [PlatformTokenAuthentication]
    permission_classes = [IsPlatformUser, PlatformRole]


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def platform_login(request):
    """Email + password (+ authenticator code when PLATFORM_REQUIRE_TOTP). Same error for every failure."""
    tenancy.act_as_platform()
    email = str(request.data.get('email', '')).strip()
    user = PlatformUser.objects.filter(email__iexact=email, is_active=True).first()
    skip_totp = (not settings.PLATFORM_REQUIRE_TOTP
                 or (settings.PLATFORM_SKIP_TOTP_LOCAL and client_ip(request) in LOCAL_ADDRESSES))
    ok = (user is not None and user.check_password(str(request.data.get('password', '')))
          and (skip_totp or pyotp.TOTP(user.mfa_secret).verify(str(request.data.get('totp', '')), valid_window=1)))
    if not ok:
        raise ApiError('Wrong email, password or authenticator code.', code='invalid_credentials', status_code=401)
    user.last_login_at = timezone.now()
    user.save(update_fields=['last_login_at'])
    PlatformAuditLog.objects.create(platform_user=user, action='platform.login', ip_address=client_ip(request))
    access = tokens.issue({'sub': user.id, 'role': user.role}, tokens.PLATFORM_AUDIENCE, settings.PLATFORM_TOKEN_LIFETIME)
    return Response({'access': access, 'user': {'id': user.id, 'email': user.email, 'name': user.full_name, 'role': user.role}})


class ChangeOwnPassword(APIView):
    """The signed-in Super Admin changes their own password. Any role may."""
    authentication_classes = [PlatformTokenAuthentication]
    permission_classes = [IsPlatformUser]

    def post(self, request):
        body = ChangeOwnPasswordSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(body.validated_data['current_password']):
            raise ApiError('The current password is wrong.', code='invalid_password')
        if body.validated_data['current_password'] == body.validated_data['new_password']:
            raise ApiError('Choose a password different from the current one.', code='same_password')
        user.set_password(body.validated_data['new_password'])
        user.save(update_fields=['password_hash'])
        PlatformAuditLog.objects.create(platform_user=user, action='platform.change_password', ip_address=client_ip(request))
        return Response({'ok': True})


class TenantListCreate(PlatformView, generics.ListAPIView):
    serializer_class = TenantSerializer

    def get_queryset(self):
        qs = Tenant.objects.select_related('plan').order_by('id')
        q = self.request.query_params.get('search', '').strip()
        if q:
            qs = qs.filter(id=int(q)) if q.isdigit() else qs.filter(name__icontains=q)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def post(self, request):
        data = TenantCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        d = data.validated_data
        tenant = provisioning.provision_tenant(
            name=d['name'], business_type=d['business_type'], country_code=d['country'].upper(),
            outlet_name=d['outlet_name'], admin_login_id=d['admin_login_id'], admin_password=d['admin_password'],
            admin_email=d.get('admin_email') or None, plan_code=d.get('plan') or None,
            currency_code=(d.get('currency') or '').upper() or None, timezone_name=d.get('timezone') or None,
            language=d.get('language') or 'en', login_prefix=d.get('login_prefix') or None,
            contact={k: d[k] for k in ('contact_name', 'contact_email', 'contact_phone') if d.get(k)},
            created_by=request.user, ip=client_ip(request),
        )
        return Response(TenantSerializer(tenant).data, status=status.HTTP_201_CREATED)


class TenantDetail(PlatformView, generics.RetrieveUpdateAPIView):
    serializer_class = TenantSerializer
    queryset = Tenant.objects.select_related('plan')
    http_method_names = ['get', 'patch']

    def perform_update(self, serializer):
        before = {k: serializer.instance.serializable_value(k) for k in serializer.validated_data}
        tenant = serializer.save()
        PlatformAuditLog.objects.create(platform_user=self.request.user, tenant=tenant, action='tenant.update',
                                        details={'before': before, 'after': {k: str(v) for k, v in serializer.validated_data.items()}},
                                        ip_address=client_ip(self.request))

    def retrieve(self, request, *args, **kwargs):
        tenant = self.get_object()
        data = TenantSerializer(tenant).data
        data['status_history'] = StatusHistorySerializer(tenant.status_history.all(), many=True).data
        data['administrators'] = [
            {'id': u.id, 'login_id': u.username, 'email': u.email, 'is_active': u.is_active,
             'last_login_at': u.last_login_at, 'must_change_password': u.must_change_password}
            for u in User.objects.filter(tenant_id=tenant.id, role__key='administrator').order_by('id')]
        return Response(data)


class TenantStatusAction(PlatformView, APIView):
    """POST /tenants/{id}/activate|suspend|close/"""
    target = None

    def post(self, request, pk):
        tenant = generics.get_object_or_404(Tenant, pk=pk)
        body = StatusChangeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        tenant = provisioning.set_tenant_status(tenant, self.target, reason=body.validated_data.get('reason', ''),
                                                changed_by=request.user, ip=client_ip(request))
        return Response(TenantSerializer(tenant).data)


class ResetAdminPassword(PlatformView, APIView):
    def post(self, request, pk):
        tenant = generics.get_object_or_404(Tenant, pk=pk)
        body = ResetAdminPasswordSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user = provisioning.reset_admin_password(tenant, login_id=body.validated_data['login_id'],
                                                 new_password=body.validated_data['new_password'],
                                                 changed_by=request.user, ip=client_ip(request))
        return Response({'login_id': user.username, 'must_change_password': True})


class LoginIdAvailable(PlatformView, APIView):
    def get(self, request):
        import re
        login_id = request.query_params.get('login_id', '').strip()
        valid = bool(re.match(LOGIN_ID_RE, login_id))
        return Response({'login_id': login_id, 'valid': valid,
                         'available': valid and not provisioning.login_id_taken(login_id)})


class PlanList(PlatformView, generics.ListAPIView):
    serializer_class = PlanSerializer
    queryset = Plan.objects.all()
    pagination_class = None


class CountryList(PlatformView, generics.ListAPIView):
    serializer_class = CountrySerializer
    queryset = Country.objects.all()
    pagination_class = None


class AuditList(PlatformView, generics.ListAPIView):
    serializer_class = PlatformAuditSerializer

    def get_queryset(self):
        qs = PlatformAuditLog.objects.select_related('platform_user', 'tenant')
        tenant = self.request.query_params.get('tenant')
        return qs.filter(tenant_id=tenant) if tenant else qs
