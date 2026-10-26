from .models import AuditLog


def record(request, action, entity_type, entity_id=None, before=None, after=None, approval=None, actor=None):
    """Append an audit entry for the current client."""
    user = actor or getattr(request, 'user', None)
    AuditLog.objects.create(
        actor=user if getattr(user, 'is_client_user', False) else None,
        action=action, entity_type=entity_type, entity_id=entity_id,
        before_data=before, after_data=after, approval=approval,
        ip_address=request.META.get('REMOTE_ADDR') if request else None,
    )
