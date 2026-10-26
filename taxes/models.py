from django.db import models
from django.db.models.functions import Coalesce, Lower

from core.models import MONEY, RATE, TenantModel, TimestampedModel, app_table


class Tax(TenantModel, TimestampedModel):
    """
    A tax with the client's own name and code (CGST, VAT, Service Tax, Packing…).
    percentage: rate 0-100. fixed: amount per unit or once per bill.
    """
    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    name = models.TextField()
    code = models.TextField(blank=True, default='')
    type = models.CharField(max_length=10, choices=[('percentage', 'percentage'), ('fixed', 'fixed')])
    rate = models.DecimalField(null=True, blank=True, **RATE)
    amount = models.DecimalField(null=True, blank=True, **MONEY)
    fixed_basis = models.CharField(max_length=10, null=True, blank=True,
                                   choices=[('per_unit', 'per_unit'), ('per_bill', 'per_bill')])
    channels = models.JSONField(default=list, blank=True)  # order types; empty = all
    is_compound = models.BooleanField(default=False)
    sequence = models.SmallIntegerField(default=0)
    reporting_code = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    valid_from = models.DateField(null=True, blank=True)
    valid_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = app_table('taxes')
        ordering = ['sequence', 'id']
        constraints = [
            models.UniqueConstraint('tenant', Coalesce('outlet', models.Value(0)), Lower('name'), name='taxes_name_uniq'),
            models.CheckConstraint(
                condition=(models.Q(type='percentage', rate__isnull=False, rate__gte=0, rate__lte=100,
                                    amount__isnull=True, fixed_basis__isnull=True)
                           | models.Q(type='fixed', amount__isnull=False, amount__gte=0,
                                      fixed_basis__isnull=False, rate__isnull=True)),
                name='taxes_type_fields_valid'),
        ]

    def __str__(self):
        return self.name
