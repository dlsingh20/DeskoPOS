"""
Repairs data saved before time zones and day close times were checked:
- time zones spelt with the wrong case ('Asia/kolkata'), which fail on Linux;
- a business day ending in the afternoon or evening (the closing time typed by mistake),
  which dates the whole day's orders to the day before. It goes back to the 04:00 default.
"""
from datetime import time

from django.db import migrations

from core import tenancy
from core.timezones import canonical_timezone


def repair(apps, schema_editor):
    Tenant = apps.get_model('console', 'Tenant')
    Outlet = apps.get_model('outlets', 'Outlet')
    for tenant in Tenant.objects.exclude(timezone__isnull=True).exclude(timezone=''):
        fixed = canonical_timezone(tenant.timezone)
        if fixed and fixed != tenant.timezone:
            Tenant.objects.filter(id=tenant.id).update(timezone=fixed)

    # Outlets are behind row security: only pos_platform sees every client's. On a new database
    # its grants come after the migrations, but then there are no outlets to repair.
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT to_regrole('pos_platform') IS NOT NULL "
                       "AND has_table_privilege('pos_platform', 'app.outlets', 'UPDATE')")
        if not cursor.fetchone()[0]:
            return
    tenancy.act_as_platform()
    try:
        for outlet in Outlet.objects.exclude(timezone__isnull=True).exclude(timezone=''):
            fixed = canonical_timezone(outlet.timezone)
            if fixed and fixed != outlet.timezone:
                Outlet.objects.filter(id=outlet.id).update(timezone=fixed)
        Outlet.objects.filter(day_close_time__gte=time(12)).update(day_close_time=time(4))
    finally:
        tenancy.reset()


class Migration(migrations.Migration):

    dependencies = [
        ('console', '0003_onboarding_forms'),
        ('outlets', '0003_service_charge'),
    ]

    operations = [migrations.RunPython(repair, migrations.RunPython.noop)]
