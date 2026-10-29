from rest_framework import serializers

from accounts.models import User
from outlets.models import Outlet

from .models import Country, Plan, PlatformAuditLog, Tenant, TenantStatusHistory

LOGIN_ID_RE = r'^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$'
LOGIN_ID_HELP = '3-60 characters: letters, numbers, dot, dash or underscore.'


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ['id', 'code', 'name', 'max_outlets', 'max_users', 'max_devices', 'features', 'is_active']


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = ['code', 'name', 'default_currency', 'default_locale', 'default_timezone', 'tax_id_label', 'tax_template']


class TenantSerializer(serializers.ModelSerializer):
    country = serializers.CharField(source='country_id', read_only=True)
    currency = serializers.CharField(source='currency_id', read_only=True)
    plan = serializers.SlugRelatedField(slug_field='code', queryset=Plan.objects.all(), required=False, allow_null=True)
    outlets = serializers.SerializerMethodField()
    users = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = ['id', 'name', 'business_type', 'status', 'country', 'currency', 'locale', 'timezone', 'language',
                  'plan', 'feature_overrides', 'login_prefix', 'contact_name', 'contact_email', 'contact_phone',
                  'billing_address', 'tax_reg_number', 'trial_ends_at', 'activated_at', 'suspended_at',
                  'suspended_reason', 'closed_at', 'created_at', 'outlets', 'users']
        read_only_fields = ['id', 'status', 'activated_at', 'suspended_at', 'suspended_reason', 'closed_at', 'created_at']

    # Counted as pos_platform, which can see every client's rows
    def get_outlets(self, tenant):
        return Outlet.objects.filter(tenant_id=tenant.id).count()

    def get_users(self, tenant):
        return User.objects.filter(tenant_id=tenant.id, is_active=True).count()


class TenantCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    business_type = serializers.ChoiceField(choices=Tenant.BUSINESS_TYPES, default='restaurant')
    country = serializers.CharField(max_length=2)
    currency = serializers.CharField(max_length=3, required=False, allow_blank=True)
    timezone = serializers.CharField(required=False, allow_blank=True)
    language = serializers.CharField(required=False, default='en')
    plan = serializers.CharField(required=False, allow_blank=True)
    outlet_name = serializers.CharField(max_length=200)
    login_prefix = serializers.RegexField(r'^[a-z0-9]{2,12}$', required=False, allow_blank=True)
    admin_login_id = serializers.RegexField(LOGIN_ID_RE, error_messages={'invalid': LOGIN_ID_HELP})
    admin_password = serializers.CharField(min_length=8, write_only=True)
    # Required: Administrators sign in with an emailed code
    admin_email = serializers.EmailField()
    contact_name = serializers.CharField(required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    contact_phone = serializers.CharField(required=False, allow_blank=True)

    def validate_login_prefix(self, value):
        if value and Tenant.objects.filter(login_prefix=value).exists():
            raise serializers.ValidationError('Another client already uses this prefix.')
        return value


class StatusChangeSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)


class ResetAdminPasswordSerializer(serializers.Serializer):
    login_id = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True)


class ChangeOwnPasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=12, write_only=True)


class StatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantStatusHistory
        fields = ['from_status', 'to_status', 'reason', 'changed_by', 'changed_at']


class PlatformAuditSerializer(serializers.ModelSerializer):
    platform_user_email = serializers.CharField(source='platform_user.email', default=None, read_only=True)
    tenant_name = serializers.CharField(source='tenant.name', default=None, read_only=True)

    class Meta:
        model = PlatformAuditLog
        fields = ['id', 'platform_user', 'platform_user_email', 'tenant', 'tenant_name', 'action', 'details',
                  'ip_address', 'created_at']
