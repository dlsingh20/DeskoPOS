from django.db import connection
from rest_framework import serializers

from console.models import Permission
from console.serializers import LOGIN_ID_HELP, LOGIN_ID_RE
from outlets.models import Outlet

from .models import Role, User, UserOutlet, UserPermissionOverride

EMAIL_REQUIRED_ROLES = ('administrator', 'manager')  # they get the emailed sign-in code


def login_id_taken(login_id, exclude_user_id=None):
    with connection.cursor() as cursor:
        cursor.execute('SELECT app.login_id_taken(%s)', [login_id])
        taken = cursor.fetchone()[0]
    if taken and exclude_user_id:
        # Still "taken" by this same user? (RLS: only our own client's users are visible)
        return not User.objects.filter(id=exclude_user_id, username__iexact=login_id).exists()
    return taken


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ['id', 'key', 'name', 'can_login', 'is_system', 'permissions']

    def get_permissions(self, role):
        return sorted(rp.permission_id for rp in role.permissions.all())


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['key', 'group_name', 'label', 'approvable', 'admin_only']


def me_payload(user, tenant):
    outlet_ids = list(user.outlet_links.values_list('outlet_id', flat=True))
    outlets = Outlet.objects.filter(is_active=True)
    if outlet_ids:
        outlets = outlets.filter(id__in=outlet_ids)
    return {
        'id': user.id,
        'login_id': user.username,
        'name': user.full_name,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'email': user.email,
        'phone': user.phone,
        'role': {'key': user.role.key, 'name': user.role.name},
        'permissions': sorted(user.permission_keys),
        'must_change_password': user.must_change_password,
        'has_pin': bool(user.pin_hash),
        'language': user.language or tenant['language'],
        'client': {
            'id': tenant['id'], 'name': tenant['name'], 'country': tenant['country_code'],
            'currency': tenant['currency_code'], 'locale': tenant['locale'], 'timezone': tenant['timezone'],
            'features': {**(tenant['plan_features'] or {}), **(tenant['feature_overrides'] or {})},
        },
        'outlets': [{'id': o.id, 'code': o.code, 'name': o.name, 'type': o.type} for o in outlets],
    }


class UserSerializer(serializers.ModelSerializer):
    login_id = serializers.RegexField(LOGIN_ID_RE, source='username', error_messages={'invalid': LOGIN_ID_HELP})
    role = serializers.SlugRelatedField(slug_field='key', queryset=Role.objects.all())
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8)
    # write-only here; to_representation adds the saved values
    permission_overrides = serializers.DictField(child=serializers.BooleanField(), required=False, write_only=True)
    outlet_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)

    class Meta:
        model = User
        fields = ['id', 'login_id', 'first_name', 'last_name', 'email', 'phone', 'role', 'language', 'is_active',
                  'must_change_password', 'last_login_at', 'created_at', 'password', 'permission_overrides', 'outlet_ids']
        read_only_fields = ['id', 'is_active', 'must_change_password', 'last_login_at', 'created_at']

    def to_representation(self, user):
        data = super().to_representation(user)
        data['name'] = user.full_name
        data['permission_overrides'] = {o.permission_id: o.granted for o in user.permission_overrides.all()}
        data['outlet_ids'] = [link.outlet_id for link in user.outlet_links.all()]
        data['can_login'] = user.role.can_login
        return data

    def validate_login_id(self, value):
        if login_id_taken(value, exclude_user_id=self.instance.id if self.instance else None):
            raise serializers.ValidationError('This login ID is already used. Login IDs are unique across all AppDesko clients.')
        return value

    def validate_permission_overrides(self, value):
        known = {p.key: p for p in Permission.objects.filter(key__in=value.keys())}
        unknown = set(value) - set(known)
        if unknown:
            raise serializers.ValidationError(f'Unknown permissions: {", ".join(sorted(unknown))}.')
        if any(known[k].admin_only and granted for k, granted in value.items()):
            raise serializers.ValidationError('Users & roles can only come from the Administrator role.')
        return value

    def validate_outlet_ids(self, value):
        if len(set(value)) != Outlet.objects.filter(id__in=value).count():
            raise serializers.ValidationError('Unknown outlet.')
        return value

    def validate(self, attrs):
        role = attrs.get('role') or (self.instance.role if self.instance else None)
        email = attrs.get('email', self.instance.email if self.instance else None)
        if role and role.key in EMAIL_REQUIRED_ROLES and not email:
            raise serializers.ValidationError({'email': ['Administrators and Managers need an email for the sign-in code.']})
        if not self.instance and role and role.can_login and not attrs.get('password'):
            raise serializers.ValidationError({'password': ['Set a password for a user who signs in.']})
        return attrs

    def _apply_access(self, user, overrides, outlet_ids):
        if overrides is not None:
            UserPermissionOverride.objects.filter(user=user).delete()
            UserPermissionOverride.objects.bulk_create([
                UserPermissionOverride(tenant_id=user.tenant_id, user=user, permission_id=k, granted=v)
                for k, v in overrides.items()])
        if outlet_ids is not None:
            UserOutlet.objects.filter(user=user).delete()
            UserOutlet.objects.bulk_create([UserOutlet(tenant_id=user.tenant_id, user=user, outlet_id=o) for o in outlet_ids])

    def create(self, validated):
        overrides = validated.pop('permission_overrides', None)
        outlet_ids = validated.pop('outlet_ids', None)
        password = validated.pop('password', None)
        user = User(**validated, created_by=self.context['request'].user)
        user.set_password(password if user.role.can_login else None)
        user.must_change_password = user.role.can_login
        user.save()
        self._apply_access(user, overrides, outlet_ids)
        return user

    def update(self, user, validated):
        overrides = validated.pop('permission_overrides', None)
        outlet_ids = validated.pop('outlet_ids', None)
        validated.pop('password', None)  # passwords change through set-password
        for field, value in validated.items():
            setattr(user, field, value)
        if not user.role.can_login:
            user.password_hash = None
        user.save()
        self._apply_access(user, overrides, outlet_ids)
        return user


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)


class SetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(min_length=8)


class SetPinSerializer(serializers.Serializer):
    pin = serializers.RegexField(r'^\d{4,6}$', error_messages={'invalid': 'The PIN is 4 to 6 digits.'})


class ApprovalRequestSerializer(serializers.Serializer):
    permission = serializers.CharField()
    approver_username = serializers.CharField()  # the approver's login ID (name kept from the current API)
    approver_secret = serializers.CharField()
    secret_type = serializers.ChoiceField(choices=['password', 'pin'], default='password')
    order_id = serializers.IntegerField(required=False, allow_null=True)
    outlet_id = serializers.IntegerField(required=False, allow_null=True)
    context = serializers.DictField(required=False, default=dict)
