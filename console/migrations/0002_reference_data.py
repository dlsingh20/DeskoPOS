from django.db import migrations

from console import reference_data


def load(apps, schema_editor):
    Currency = apps.get_model('console', 'Currency')
    Country = apps.get_model('console', 'Country')
    Permission = apps.get_model('console', 'Permission')
    Plan = apps.get_model('console', 'Plan')
    for code, name, symbol, decimals in reference_data.CURRENCIES:
        Currency.objects.update_or_create(code=code, defaults={'name': name, 'symbol': symbol, 'decimals': decimals})
    for code, name, currency, locale, tz, label, taxes in reference_data.COUNTRIES:
        Country.objects.update_or_create(code=code, defaults={
            'name': name, 'default_currency_id': currency, 'default_locale': locale,
            'default_timezone': tz, 'tax_id_label': label, 'tax_template': taxes})
    for key, group, label, approvable, admin_only, order in reference_data.PERMISSIONS:
        Permission.objects.update_or_create(key=key, defaults={
            'group_name': group, 'label': label, 'approvable': approvable, 'admin_only': admin_only, 'sort_order': order})
    for plan in reference_data.PLANS:
        Plan.objects.update_or_create(code=plan['code'], defaults={k: v for k, v in plan.items() if k != 'code'})


class Migration(migrations.Migration):
    dependencies = [('console', '0001_initial')]
    operations = [migrations.RunPython(load, migrations.RunPython.noop)]
