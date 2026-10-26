from django.db import models

from .tenancy import current_tenant_id


def app_table(name):
    """Table in the `app` schema (client data, protected by RLS)."""
    return f'app"."{name}'


def platform_table(name):
    """Table in the `platform` schema (Super Admin data)."""
    return f'platform"."{name}'


class TenantModel(models.Model):
    """
    Base for every client-owned table.

    tenant_id is filled from the request's client. The database adds
    UNIQUE (tenant_id, id), a composite foreign key for every reference to
    another client table, and the RLS policy (core.db_guards), so a row can
    never be read or linked across clients.

    Never read `.tenant` in client requests: pos_api has no access to the
    platform tables. Use request.tenant instead.
    """
    tenant = models.ForeignKey('console.Tenant', on_delete=models.PROTECT, related_name='+', editable=False)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.tenant_id:
            self.tenant_id = current_tenant_id()
            if not self.tenant_id:
                raise RuntimeError(f'No client in context while saving {type(self).__name__}')
        super().save(*args, **kwargs)


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


MONEY = {'max_digits': 18, 'decimal_places': 4}
RATE = {'max_digits': 9, 'decimal_places': 4}
QTY = {'max_digits': 12, 'decimal_places': 3}
