from django.conf import settings
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from console.models import Permission
from core.exceptions import ApiError, Conflict, PermissionRequired, error_response
from core.permissions import require

from . import audit, signin
from .models import Approval, AuditLog, AuthSession, Role, RolePermission, User
from .serializers import (
    ApprovalRequestSerializer, ChangePasswordSerializer, PermissionSerializer, RoleSerializer, SetPasswordSerializer,
    SetPinSerializer, UserSerializer, login_id_taken, me_payload,
)


# ---- Sign-in ------------------------------------------------------------------

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def token(request):
    """
    {username, password, cf_turnstile_token?, otp_code?, otp_trust?}
    200 {access, refresh, user, otp_trust?} · 202 {otp_required, email_hint} · 401/403 {code, detail}
    """
    data = request.data
    try:
        user, session, refresh, trust = signin.sign_in(
            request, str(data.get('username', '')), str(data.get('password', '')),
            captcha=data.get('cf_turnstile_token'), otp_code=data.get('otp_code'), otp_trust=data.get('otp_trust'))
    except signin.OtpRequired as otp:
        return Response({'otp_required': True, 'email_hint': otp.email_hint,
                         'detail': f'We emailed a sign-in code to {otp.email_hint}.'}, status=status.HTTP_202_ACCEPTED)
    except ApiError as exc:
        return error_response(exc)  # keeps the failed-attempt count
    audit.record(request, 'user.sign_in', 'user', user.id, actor=user)
    from core.authentication import load_current_tenant
    body = {'access': signin.access_token(user, session), 'refresh': refresh,
            'user': me_payload(user, load_current_tenant())}
    if trust:
        body['otp_trust'] = trust
    return Response(body)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def token_refresh(request):
    try:
        user, session, refresh = signin.refresh(request, str(request.data.get('refresh', '')))
    except ApiError as exc:
        return error_response(exc)
    return Response({'access': signin.access_token(user, session), 'refresh': refresh})


@api_view(['POST'])
def logout(request):
    AuthSession.objects.filter(id=request.session_id).update(revoked_at=timezone.now())
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
def me(request):
    return Response(me_payload(request.user, request.tenant))


@api_view(['POST'])
def change_password(request):
    body = ChangePasswordSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    user = request.user
    if not user.check_password(body.validated_data['current_password']):
        raise ApiError('The current password is wrong.', code='invalid_password')
    if body.validated_data['current_password'] == body.validated_data['new_password']:
        raise ApiError('Choose a password different from the current one.', code='same_password')
    user.set_password(body.validated_data['new_password'])
    user.must_change_password = False
    user.password_changed_at = timezone.now()
    user.save(update_fields=['password_hash', 'must_change_password', 'password_changed_at'])
    # Other devices sign in again
    AuthSession.objects.filter(user=user, revoked_at__isnull=True).exclude(id=request.session_id).update(revoked_at=timezone.now())
    audit.record(request, 'user.change_password', 'user', user.id)
    return Response({'must_change_password': False})


# ---- Users & roles ------------------------------------------------------------

def _users():
    return User.objects.select_related('role').prefetch_related('permission_overrides', 'outlet_links')


def _active_admins_excluding(user):
    return User.objects.filter(role__key='administrator', is_active=True).exclude(id=user.id).count()


class UserList(generics.ListCreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [require('users.manage')]

    def get_queryset(self):
        qs = _users()
        role = self.request.query_params.get('role')
        return qs.filter(role__key=role) if role else qs

    def perform_create(self, serializer):
        user = serializer.save()
        audit.record(self.request, 'user.create', 'user', user.id,
                     after={'login_id': user.username, 'role': user.role.key})


class UserDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer
    permission_classes = [require('users.manage')]
    http_method_names = ['get', 'patch', 'delete']

    def get_queryset(self):
        return _users()

    def perform_update(self, serializer):
        user = serializer.instance
        before = {'role': user.role.key, 'login_id': user.username}
        new_role = serializer.validated_data.get('role')
        if new_role and user.role.key == 'administrator' and new_role.key != 'administrator' \
                and _active_admins_excluding(user) == 0:
            raise Conflict('This is the last Administrator. Make someone else Administrator first.', code='last_administrator')
        user = serializer.save()
        audit.record(self.request, 'user.update', 'user', user.id, before=before,
                     after={'role': user.role.key, 'login_id': user.username})

    def perform_destroy(self, user):
        # Only accounts that never signed in; others are deactivated so their history stays
        if user.last_login_at or AuditLog.objects.filter(actor=user).exists():
            raise Conflict('This user has signed in before. Deactivate them instead, so their history is kept.',
                           code='user_has_history')
        if user.id == self.request.user.id:
            raise Conflict("You can't delete yourself.", code='self_delete')
        audit.record(self.request, 'user.delete', 'user', user.id, before={'login_id': user.username})
        user.delete()


class UserSetActive(APIView):
    permission_classes = [require('users.manage')]

    def post(self, request, pk):
        user = generics.get_object_or_404(_users(), pk=pk)
        active = bool(request.data.get('is_active'))
        if not active:
            if user.id == request.user.id:
                raise Conflict("You can't deactivate yourself.", code='self_deactivate')
            if user.role.key == 'administrator' and _active_admins_excluding(user) == 0:
                raise Conflict("The last Administrator can't be deactivated.", code='last_administrator')
            AuthSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now())
        user.is_active = active
        user.save(update_fields=['is_active'])
        audit.record(request, 'user.activate' if active else 'user.deactivate', 'user', user.id)
        return Response(UserSerializer(user, context={'request': request}).data)


class UserSetPassword(APIView):
    """An Administrator sets someone's password; they change it at next sign-in."""
    permission_classes = [require('users.manage')]

    def post(self, request, pk):
        user = generics.get_object_or_404(_users(), pk=pk)
        if not user.role.can_login:
            raise ApiError(f"{user.role.name}s don't sign in, so they have no password.", code='login_not_allowed')
        body = SetPasswordSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user.set_password(body.validated_data['password'])
        user.must_change_password = True
        user.failed_logins = 0
        user.locked_until = None
        user.save()
        AuthSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now())
        audit.record(request, 'user.set_password', 'user', user.id)
        return Response({'must_change_password': True})


class UserSetPin(APIView):
    """Approval PIN: users set their own; Administrators can set anyone's."""

    def post(self, request, pk):
        if pk != request.user.id and not request.user.has_perm('users.manage'):
            raise PermissionRequired('users.manage')
        user = generics.get_object_or_404(_users(), pk=pk)
        body = SetPinSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user.set_pin(body.validated_data['pin'])
        user.save(update_fields=['pin_hash'])
        audit.record(request, 'user.set_pin', 'user', user.id)
        return Response({'has_pin': True})


@api_view(['GET'])
def login_id_available(request):
    import re
    from console.serializers import LOGIN_ID_RE
    login_id = request.query_params.get('login_id', '').strip()
    valid = bool(re.match(LOGIN_ID_RE, login_id))
    return Response({'login_id': login_id, 'valid': valid, 'available': valid and not login_id_taken(login_id)})


class RoleList(generics.ListAPIView):
    serializer_class = RoleSerializer
    pagination_class = None

    def get_queryset(self):
        return Role.objects.prefetch_related(Prefetch('permissions', queryset=RolePermission.objects.all()))


class PermissionList(generics.ListAPIView):
    serializer_class = PermissionSerializer
    pagination_class = None
    queryset = Permission.objects.all()


class AuditLogList(generics.ListAPIView):
    permission_classes = [require('users.manage')]

    def get_queryset(self):
        qs = AuditLog.objects.select_related('actor')
        for param, field in (('entity_type', 'entity_type'), ('entity_id', 'entity_id'), ('actor', 'actor_id')):
            value = self.request.query_params.get(param)
            if value:
                qs = qs.filter(**{field: value})
        return qs

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response([{
            'id': a.id, 'action': a.action, 'entity_type': a.entity_type, 'entity_id': a.entity_id,
            'actor': a.actor and {'id': a.actor.id, 'name': a.actor.full_name},
            'approval_id': a.approval_id, 'before': a.before_data, 'after': a.after_data, 'created_at': a.created_at,
        } for a in page])


# ---- Manager approval -----------------------------------------------------------

@api_view(['POST'])
def approvals(request):
    """
    A Manager or Administrator approves a restricted action on this device.
    Returns a single-use approval_id valid for 5 minutes.
    """
    body = ApprovalRequestSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    d = body.validated_data
    permission = Permission.objects.filter(key=d['permission'], approvable=True).first()
    if permission is None:
        raise ApiError("This action can't be approved by a manager.", code='not_approvable')

    approver = _users().filter(username__iexact=d['approver_username'], is_active=True).first()
    secret_ok = approver is not None and (approver.check_pin(d['approver_secret']) if d['secret_type'] == 'pin'
                                          else approver.check_password(d['approver_secret']))
    if not secret_ok:
        raise ApiError(f"Wrong login ID or {'PIN' if d['secret_type'] == 'pin' else 'password'}.",
                       code='invalid_credentials', status_code=401)
    if not approver.has_perm(permission.key) or approver.role.key not in ('administrator', 'manager'):
        raise ApiError(f'{approver.full_name} cannot approve this. A Manager or Administrator must approve.',
                       code='cannot_approve', status_code=403)

    approval = Approval.objects.create(
        permission=permission, approver=approver, requested_by=request.user, order_id=d.get('order_id'),
        outlet_id=d.get('outlet_id'), context=d.get('context') or {},
        expires_at=timezone.now() + settings.APPROVAL_LIFETIME)
    audit.record(request, 'approval.grant', 'approval', approval.id,
                 after={'permission': permission.key, 'approver': approver.username, 'context': approval.context},
                 approval=approval)
    return Response({
        'approval_id': approval.id,
        'permission': permission.key,
        'order_id': approval.order_id,
        'approver': {'id': approver.id, 'name': approver.full_name},
        'requested_by': {'id': request.user.id, 'name': request.user.full_name},
        'expires_at': approval.expires_at,
        'self': approver.id == request.user.id,
    }, status=status.HTTP_201_CREATED)


def use_approval(request, approval_id, permission_key, order_id=None):
    """
    For the endpoints that need an approval (discounts, Credit Pay, voids, refunds):
    returns None when the user has the permission, the Approval when a valid one is
    given, and raises PermissionRequired otherwise. The approval is used up.
    """
    if request.user.has_perm(permission_key):
        return None
    approval = (Approval.objects.select_for_update()
                .filter(id=approval_id, permission_id=permission_key, used_at__isnull=True,
                        expires_at__gt=timezone.now()).first()) if approval_id else None
    if approval is None or (order_id and approval.order_id and approval.order_id != order_id):
        approvable = Permission.objects.filter(key=permission_key, approvable=True).exists()
        raise PermissionRequired(permission_key, approvable=approvable,
                                 detail='This needs a manager approval.' if approvable else None)
    approval.used_at = timezone.now()
    approval.save(update_fields=['used_at'])
    return approval
