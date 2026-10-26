from django.db import migrations


class Migration(migrations.Migration):
    """The two PostgreSQL schemas: platform (Super Admin) and app (client data)."""

    initial = True
    dependencies = []

    operations = [
        migrations.RunSQL(
            'CREATE SCHEMA IF NOT EXISTS platform; CREATE SCHEMA IF NOT EXISTS app;',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
