"""Dining tables of an outlet."""
from django.db import models
from django.db.models.functions import Lower

from core.models import TenantModel, TimestampedModel, app_table


class DiningTable(TenantModel, TimestampedModel):
    STATUSES = ['available', 'occupied', 'reserved', 'cleaning', 'maintenance']

    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.PROTECT, related_name='tables')
    table_number = models.CharField(max_length=20)
    name = models.TextField(blank=True, default='')
    capacity = models.IntegerField(default=4)
    status = models.CharField(max_length=12, default='available', choices=[(s, s) for s in STATUSES])
    location = models.TextField(blank=True, default='')  # Indoor, Terrace, AC Hall
    is_outdoor = models.BooleanField(default=False)
    has_view = models.BooleanField(default=False)
    accessibility = models.BooleanField(default=False)
    # Secret in the table's QR ordering link; regenerating it stops old printed codes working
    qr_secret = models.TextField(null=True, blank=True, unique=True)
    qr_enabled = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    # Split Table: a temporary table 4-1 seated next to table 4 for another party. It goes away
    # (is_active = False) once its bill is closed.
    split_from = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        db_table = app_table('dining_tables')
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint('outlet', Lower('table_number'), condition=models.Q(is_active=True),
                                    name='dining_tables_number_uniq'),
            models.CheckConstraint(condition=models.Q(capacity__gt=0, capacity__lt=1000), name='dining_tables_capacity_valid'),
        ]

    def __str__(self):
        return self.name or f'Table {self.table_number}'
