"""
Money: payment methods, payments, tips, refunds, Credit Pay accounts and the cash
counter shifts they belong to.
"""
from django.db import models

from core.models import MONEY, TenantModel, TimestampedModel, app_table


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


class Shift(TenantModel):
    """One cashier's session at a cash counter, from opening cash to the counted close."""
    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.PROTECT, related_name='shifts')
    counter = models.ForeignKey('outlets.CashCounter', on_delete=models.PROTECT, related_name='shifts')
    counter_name = models.TextField()  # snapshot
    cashier = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='+')
    business_date = models.DateField()
    status = models.CharField(max_length=10, default='open', choices=[(s, s) for s in ('open', 'closed')])
    opening_balance = models.DecimalField(default=0, **MONEY)
    expected_cash = models.DecimalField(null=True, blank=True, **MONEY)  # set at close
    counted_cash = models.DecimalField(null=True, blank=True, **MONEY)
    variance = models.DecimalField(null=True, blank=True, **MONEY)
    carried_from = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    opened_at = models.DateTimeField(auto_now_add=True)
    opened_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='+')
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    notes = models.TextField(blank=True, default='')
    close_notes = models.TextField(blank=True, default='')

    class Meta:
        db_table = app_table('shifts')
        ordering = ['-opened_at', '-id']
        constraints = [
            models.UniqueConstraint('counter', condition=models.Q(status='open'), name='shifts_one_open_per_counter'),
            models.UniqueConstraint('cashier', condition=models.Q(status='open'), name='shifts_one_open_per_cashier'),
        ]


class CashMovement(TenantModel):
    """Cash put into or taken out of the drawer during a shift (expenses, safe drops…)."""
    REASONS = ['petty_expense', 'supplier', 'tip_payout', 'safe_drop', 'float_top_up', 'refund', 'other']

    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name='movements')
    type = models.CharField(max_length=3, choices=[('in', 'in'), ('out', 'out')])
    reason = models.CharField(max_length=15, choices=[(r, r) for r in REASONS])
    amount = models.DecimalField(**MONEY)
    note = models.TextField(blank=True, default='')
    approved_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    created_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('cash_movements')
        ordering = ['id']
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='cash_movements_amount_positive')]


class Payment(TenantModel):
    """Money received for an order. `method` keeps the POS app's name (cash, credit_card, mobile_payment…)."""
    STATUSES = ['pending', 'completed', 'failed', 'partially_refunded', 'refunded', 'voided']

    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.PROTECT, related_name='+')
    order = models.ForeignKey('orders.Order', on_delete=models.PROTECT, related_name='payments')
    payment_method = models.ForeignKey(PaymentMethod, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    method = models.CharField(max_length=20)
    channel = models.CharField(max_length=20, blank=True, default='')  # upi | paytm | phonepe | gpay
    card_type = models.CharField(max_length=6, blank=True, default='')  # credit | debit
    amount = models.DecimalField(**MONEY)
    amount_received = models.DecimalField(null=True, blank=True, **MONEY)  # cash handed over
    change_returned = models.DecimalField(null=True, blank=True, **MONEY)
    reference = models.TextField(blank=True, default='')  # approval code / UTR; never a card number
    status = models.CharField(max_length=20, default='completed', choices=[(s, s) for s in STATUSES])
    refunded_amount = models.DecimalField(default=0, **MONEY)
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, null=True, blank=True, related_name='payments')
    received_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='+')
    source = models.CharField(max_length=12, default='settle')  # settle | collection
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('payments')
        ordering = ['id']
        indexes = [models.Index(fields=['shift']), models.Index(fields=['created_at'])]
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='payments_amount_positive'),
            models.CheckConstraint(condition=models.Q(refunded_amount__lte=models.F('amount')),
                                   name='payments_refund_within_amount'),
        ]


class Tip(TenantModel):
    order = models.ForeignKey('orders.Order', on_delete=models.PROTECT, related_name='tips')
    method = models.CharField(max_length=20)
    amount = models.DecimalField(**MONEY)
    staff = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, null=True, blank=True, related_name='tips')
    received_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('tips')
        ordering = ['id']


class Refund(TenantModel):
    REASONS = ['food_quality', 'wrong_order', 'service', 'overcharged', 'duplicate_payment', 'other']

    order = models.ForeignKey('orders.Order', on_delete=models.PROTECT, related_name='refunds')
    credit_note_number = models.TextField()
    amount = models.DecimalField(**MONEY)
    reason = models.CharField(max_length=20, choices=[(r, r) for r in REASONS])
    note = models.TextField(blank=True, default='')
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, null=True, blank=True, related_name='refunds')
    refunded_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='+')
    approved_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('refunds')
        ordering = ['id']


class RefundLine(TenantModel):
    refund = models.ForeignKey(Refund, on_delete=models.CASCADE, related_name='lines')
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name='refund_lines')
    method = models.CharField(max_length=20)  # how the money went back
    amount = models.DecimalField(**MONEY)
    reference = models.TextField(blank=True, default='')

    class Meta:
        db_table = app_table('refund_lines')
        ordering = ['id']


class OutstandingAccount(TenantModel, TimestampedModel):
    """Credit Pay: a bill the guest pays later."""
    STATUSES = ['pending', 'contacted', 'payment_promised', 'resolved', 'written_off', 'transferred_ar']
    PRIORITIES = ['low', 'medium', 'high', 'urgent']

    order = models.OneToOneField('orders.Order', on_delete=models.PROTECT, related_name='outstanding')
    customer_name = models.TextField()
    customer_phone = models.TextField()
    customer_email = models.TextField(blank=True, default='')
    original_amount = models.DecimalField(**MONEY)
    paid_amount = models.DecimalField(default=0, **MONEY)
    status = models.CharField(max_length=20, default='pending', choices=[(s, s) for s in STATUSES])
    priority = models.CharField(max_length=10, default='medium', choices=[(p, p) for p in PRIORITIES])
    next_follow_up_date = models.DateField(null=True, blank=True)
    contact_attempts = models.IntegerField(default=0)
    last_contact_date = models.DateTimeField(null=True, blank=True)
    resolution_action = models.CharField(max_length=25, blank=True, default='')
    resolution_notes = models.TextField(blank=True, default='')
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    approved_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    created_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = app_table('outstanding_accounts')
        ordering = ['-created_at', '-id']

    @property
    def outstanding_amount(self):
        return max(self.original_amount - self.paid_amount, 0)

    @property
    def is_resolved(self):
        return self.status in ('resolved', 'written_off', 'transferred_ar')


class OutstandingNote(TenantModel):
    account = models.ForeignKey(OutstandingAccount, on_delete=models.CASCADE, related_name='notes')
    note_type = models.CharField(max_length=10, default='internal')  # contact | internal | manager | system
    contact_method = models.CharField(max_length=10, blank=True, default='')
    content = models.TextField()
    customer_response = models.TextField(blank=True, default='')
    created_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('outstanding_notes')
        ordering = ['-id']


class IdempotencyRecord(TenantModel):
    """The first answer to a request carrying an idempotency key, replayed for retries."""
    key = models.CharField(max_length=100)
    endpoint = models.TextField()
    response_code = models.IntegerField()
    response_body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('idempotency_keys')
        constraints = [models.UniqueConstraint('tenant', 'key', 'endpoint', name='idempotency_keys_uniq')]
