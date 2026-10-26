from rest_framework.permissions import SAFE_METHODS, BasePermission

from .exceptions import PermissionRequired


def require(permission_key):
    """DRF permission class: the signed-in user must have this POS permission."""

    class HasPosPermission(BasePermission):
        def has_permission(self, request, view):
            user = request.user
            if user is None or not getattr(user, 'is_client_user', False):
                return False
            if not user.has_perm(permission_key):
                raise PermissionRequired(permission_key)
            return True

    HasPosPermission.__name__ = f'Require_{permission_key.replace(".", "_")}'
    return HasPosPermission


class IsPlatformUser(BasePermission):
    def has_permission(self, request, view):
        return bool(getattr(request.user, 'is_platform_user', False))


class PlatformRole(BasePermission):
    """Super Admin actions that change clients: not for support / read-only staff."""
    allowed = ('owner', 'admin')

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return IsPlatformUser().has_permission(request, view)
        return getattr(request.user, 'role', None) in self.allowed


def read_or_require(permission_key):
    """Any client user may read; changes need the permission."""
    required = require(permission_key)

    class ReadOrRequire(BasePermission):
        def has_permission(self, request, view):
            if request.method in SAFE_METHODS:
                return getattr(request.user, 'is_client_user', False)
            return required().has_permission(request, view)

    ReadOrRequire.__name__ = f'ReadOrRequire_{permission_key.replace(".", "_")}'
    return ReadOrRequire
