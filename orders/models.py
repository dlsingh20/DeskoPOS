"""
Orders, their lines, kitchen tickets (KOTs) and voids.

Lines keep a snapshot of the product name, category, price and every tax charged,
so editing the menu or a tax never changes an existing bill.
"""
from django.db import models

from core.models import MONEY, RATE, TenantModel, TimestampedModel, app_table

OPEN_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'served']
CLOSED_STATUSES = ['completed', 'outstanding', 'cancelled', 'refunded']  # outstanding = Credit Pay


class NumberSequence(TenantModel):
    """Gapless counters: order and KOT numbers per outlet and business day."""
    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.CASCADE, related_name='+')
    kind = models.CharField(max_length=10)  # order | kot
    period = models.CharField(max_length=10)  # business date (YYYY-MM-DD)
    last_value = models.IntegerField(default=0)

    class Meta:
        db_table = app_table('number_sequences')
        constraints = [models.UniqueConstraint('outlet', 'kind', 'period', name='number_sequences_uniq')]


class Order(TenantModel, TimestampedModel):
    TYPES = ['dine_in', 'takeaway', 'delivery', 'room_service']
    STATUSES = OPEN_STATUSES + CLOSED_STATUSES
    PAYMENT_STATUSES = ['pending', 'partial', 'paid', 'refunded', 'partially_refunded']

    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.PROTECT, related_name='orders')
    table = models.ForeignKey('floor.DiningTable', on_delete=models.PROTECT, null=True, blank=True, related_name='orders')
    order_number = models.CharField(max_length=20)
    business_date = models.DateField()
    type = models.CharField(max_length=12, default='dine_in', choices=[(t, t) for t in TYPES])
    status = models.CharField(max_length=12, default='pending', choices=[(s, s) for s in STATUSES])
    source = models.CharField(max_length=12, default='pos')  # pos | qr | aggregator
    client_ref = models.UUIDField(null=True, blank=True)  # makes creating an order safe to retry
    guest_count = models.IntegerField(null=True, blank=True)
    customer_name = models.TextField(blank=True, default='')
    customer_phone = models.TextField(blank=True, default='')
    customer_email = models.TextField(blank=True, default='')
    room_number = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    server = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    created_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, related_name='+')

    # Totals, recalculated on every change (orders.pricing)
    subtotal = models.DecimalField(default=0, **MONEY)
    discount_type = models.CharField(max_length=10, blank=True, default='')  # percent | amount
    discount_percent = models.DecimalField(null=True, blank=True, **RATE)
    discount_amount = models.DecimalField(default=0, **MONEY)
    discount_reason = models.TextField(blank=True, default='')
    discounted_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    discount_approved_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True,
                                             related_name='+')
    tax_amount = models.DecimalField(default=0, **MONEY)
    service_charge = models.DecimalField(default=0, **MONEY)
    round_off = models.DecimalField(default=0, **MONEY)
    total_amount = models.DecimalField(default=0, **MONEY)
    amount_paid = models.DecimalField(default=0, **MONEY)
    payment_status = models.CharField(max_length=20, default='pending', choices=[(s, s) for s in PAYMENT_STATUSES])

    served_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    cancel_approved_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True,
                                           related_name='+')
    cancel_reason = models.TextField(blank=True, default='')
    invoice_number = models.TextField(blank=True, default='')
    version = models.IntegerField(default=1)  # bumped on every change; If-Match support later

    class Meta:
        db_table = app_table('orders')
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['outlet', 'status']), models.Index(fields=['outlet', 'business_date'])]
        constraints = [
            models.UniqueConstraint('outlet', 'business_date', 'order_number', name='orders_number_uniq'),
            models.UniqueConstraint('tenant', 'client_ref', condition=models.Q(client_ref__isnull=False),
                                    name='orders_client_ref_uniq'),
        ]

    @property
    def is_open(self):
        return self.status in OPEN_STATUSES

    @property
    def amount_due(self):
        return max(self.total_amount - self.amount_paid, 0)


class Kot(TenantModel):
    """One kitchen ticket: the lines sent to the kitchen together."""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='kots')
    number = models.IntegerField()  # per outlet and business day
    sent_at = models.DateTimeField(auto_now_add=True)
    sent_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, related_name='+')
    print_count = models.IntegerField(default=1)

    class Meta:
        db_table = app_table('kots')
        ordering = ['number']


class OrderItem(TenantModel, TimestampedModel):
    STATUSES = ['pending', 'preparing', 'ready', 'served', 'cancelled']

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('catalogue.Product', on_delete=models.PROTECT, related_name='order_items')
    menu_item_name = models.TextField()      # snapshots
    category_name = models.TextField(blank=True, default='')
    unit_price = models.DecimalField(**MONEY)
    quantity = models.IntegerField()         # still billed
    voided_quantity = models.IntegerField(default=0)
    special_instructions = models.TextField(blank=True, default='')  # KOT only, never on the bill
    status = models.CharField(max_length=10, default='pending', choices=[(s, s) for s in STATUSES])
    discountable = models.BooleanField(default=True)
    kot = models.ForeignKey(Kot, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    discount_amount = models.DecimalField(default=0, **MONEY)  # this line's share of the bill discount
    tax_amount = models.DecimalField(default=0, **MONEY)
    total_price = models.DecimalField(default=0, **MONEY)       # unit price x quantity
    created_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, related_name='+')

    class Meta:
        db_table = app_table('order_items')
        ordering = ['id']
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gte=0, voided_quantity__gte=0), name='order_items_qty_valid'),
        ]


class OrderItemTax(TenantModel):
    """A tax as it applied when the line was added (name, rate or amount)."""
    item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name='taxes')
    tax = models.ForeignKey('taxes.Tax', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    name = models.TextField()
    type = models.CharField(max_length=10)  # percentage | fixed
    rate = models.DecimalField(null=True, blank=True, **RATE)
    amount = models.DecimalField(null=True, blank=True, **MONEY)
    fixed_basis = models.CharField(max_length=10, null=True, blank=True)
    tax_amount = models.DecimalField(default=0, **MONEY)

    class Meta:
        db_table = app_table('order_item_taxes')
        ordering = ['id']


class ItemVoid(TenantModel):
    """Quantity taken off a line the kitchen already had: who, why and who approved."""
    item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name='voids')
    quantity = models.IntegerField()
    amount = models.DecimalField(**MONEY)
    reason = models.TextField()
    voided_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='+')
    approved_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    voided_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('item_voids')
        ordering = ['id']


class OrderEvent(TenantModel):
    """The order's timeline: created, items added, sent to kitchen, voided, cancelled…"""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='events')
    type = models.CharField(max_length=30)
    data = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey('accounts.User', on_delete=models.PROTECT, null=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('order_events')
        ordering = ['id']
