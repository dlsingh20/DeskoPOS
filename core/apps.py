from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _apply_guards(sender, using, **kwargs):
    from django.db import connections
    from . import db_guards
    db_guards.apply(connections[using])


class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        # post_migrate fires once per app; core is first in INSTALLED_APPS order
        # but every app's tables exist by then, because signals run after all migrations.
        post_migrate.connect(_apply_guards, sender=self, dispatch_uid='core.db_guards')
