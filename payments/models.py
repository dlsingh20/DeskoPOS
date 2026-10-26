from django.db import models

from core.models import TenantModel, app_table


class PaymentMethod(TenantModel):
    """Payment methods a client offers, with the client's own labels (Paytm, PhonePe, Amex…)."""
    KINDS = ['cash', 'card', 'wallet', 'bank_transfer', 'room_charge', 'pay_later', 'gift_card', 'loyalty', 'other']

    code = models.SlugField(max_length=30)
    label = models.TextField()
    kind = models.CharField(max_length=15, choices=[(k, k) for k in KINDS])
    needs_reference = models.BooleanField(default=False)
    opens_drawer = models.BooleanField(default=False)
    accepts_tips = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = app_table('payment_methods')
        ordering = ['sort_order', 'id']
        constraints = [models.UniqueConstraint('tenant', 'code', name='payment_methods_tenant_code_uniq')]
