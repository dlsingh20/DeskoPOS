"""/taxes/: the client's tax master (contract: MISSING_APIS.md "Tax master")."""
from decimal import Decimal

from django.db.models import Q
from rest_framework import generics, serializers

from accounts import audit
from core.money import MoneyField
from core.permissions import read_or_require
from outlets.models import Outlet
from outlets.services import outlets_for
from outlets.views import outlet_from_param

from .models import Tax

CHANNELS = ['dine_in', 'takeaway', 'delivery']


def taxes_for_outlet(outlet):
    """Client-wide taxes plus the outlet's own."""
    return Tax.objects.filter(Q(outlet__isnull=True) | Q(outlet=outlet))


class TaxSerializer(serializers.ModelSerializer):
    # null = every restaurant of the client
    restaurant = serializers.PrimaryKeyRelatedField(source='outlet', queryset=Outlet.objects.all(),
                                                    required=False, allow_null=True)
    rate = serializers.DecimalField(max_digits=7, decimal_places=3, required=False, allow_null=True,
                                    min_value=Decimal(0), max_value=Decimal(100))
    amount = MoneyField(required=False, allow_null=True)
    channels = serializers.ListField(child=serializers.ChoiceField(choices=CHANNELS), required=False)

    class Meta:
        model = Tax
        fields = ['id', 'restaurant', 'name', 'code', 'type', 'rate', 'amount', 'fixed_basis', 'channels',
                  'reporting_code', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {'code': {'required': False, 'allow_blank': True},
                        'reporting_code': {'required': False, 'allow_blank': True}}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request is not None and getattr(request.user, 'is_client_user', False):
            self.fields['restaurant'].queryset = outlets_for(request.user)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter the tax name.')
        return value

    def validate(self, attrs):
        current = {f: getattr(self.instance, f) for f in ('outlet', 'type', 'rate', 'amount', 'fixed_basis', 'name', 'code')} \
            if self.instance else {}
        merged = {**current, **attrs}
        kind = merged.get('type')
        errors = {}
        if kind == 'percentage':
            if merged.get('rate') is None:
                errors['rate'] = 'Enter the rate (0 to 100).'
            attrs['amount'] = None
            attrs['fixed_basis'] = None
        elif kind == 'fixed':
            if merged.get('amount') is None:
                errors['amount'] = 'Enter the amount.'
            if merged.get('fixed_basis') not in ('per_unit', 'per_bill'):
                errors['fixed_basis'] = 'Choose per item or per bill.'
            attrs['rate'] = None
        else:
            errors['type'] = 'Choose percentage or fixed.'

        # Names (and codes, when set) must be unique among the taxes a restaurant can use
        outlet = merged.get('outlet')
        scope = Tax.objects.all() if outlet is None else taxes_for_outlet(outlet)
        if self.instance:
            scope = scope.exclude(id=self.instance.id)
        if merged.get('name') and scope.filter(name__iexact=merged['name']).exists():
            errors['name'] = 'Another tax already has this name.'
        code = (merged.get('code') or '').strip()
        if code and scope.filter(code__iexact=code).exists():
            errors['code'] = 'Another tax already has this code.'
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class TaxList(generics.ListCreateAPIView):
    serializer_class = TaxSerializer
    permission_classes = [read_or_require('settings.manage')]

    def get_queryset(self):
        outlet = outlet_from_param(self.request, required=False)
        qs = taxes_for_outlet(outlet) if outlet else Tax.objects.all()
        if self.request.query_params.get('is_active') in ('true', 'false'):
            qs = qs.filter(is_active=self.request.query_params['is_active'] == 'true')
        return qs

    def perform_create(self, serializer):
        tax = serializer.save()
        audit.record(self.request, 'tax.create', 'tax', tax.id, after=TaxSerializer(tax, context=self.get_serializer_context()).data)


class TaxDetail(generics.RetrieveUpdateAPIView):
    """No delete: taxes on old bills must stay readable. PATCH is_active=false instead."""
    serializer_class = TaxSerializer
    permission_classes = [read_or_require('settings.manage')]
    http_method_names = ['get', 'patch', 'put']

    def get_queryset(self):
        return Tax.objects.all()

    def perform_update(self, serializer):
        context = self.get_serializer_context()
        before = TaxSerializer(serializer.instance, context=context).data
        tax = serializer.save()
        audit.record(self.request, 'tax.update', 'tax', tax.id, before=before, after=TaxSerializer(tax, context=context).data)
