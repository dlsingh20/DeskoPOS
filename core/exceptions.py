"""
Error responses in one shape (docs/MISSING_APIS.md, "Shared error shape"):
  {"code": "...", "detail": "...", "fields": {...}, "approval_required": bool, "permission": "..."}
"""
from rest_framework import exceptions, status


class ApiError(exceptions.APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'bad_request'

    def __init__(self, detail, code=None, status_code=None, **extra):
        super().__init__(detail, code)
        if status_code:
            self.status_code = status_code
        self.code = code or self.default_code
        self.extra = extra


class Conflict(ApiError):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'conflict'


class ClientInactive(ApiError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'client_inactive'


class PermissionRequired(ApiError):
    """Missing permission; approvable ones can be retried with a manager's approval_id."""
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'permission_denied'

    def __init__(self, permission, approvable=False, detail=None):
        super().__init__(detail or "Your role can't do this.", permission=permission, approval_required=approvable)


def error_response(exc: ApiError):
    """
    Answer with an error but keep the transaction: for sign-in, where a failed
    attempt must still be saved (failed password count, wrong-code attempts).
    """
    from rest_framework.response import Response
    return Response({'code': exc.code, 'detail': str(exc.detail), 'fields': {}, **exc.extra}, status=exc.status_code)


def _first_message(data):
    if isinstance(data, list) and data:
        return _first_message(data[0])
    if isinstance(data, dict) and data:
        return _first_message(next(iter(data.values())))
    return str(data)


def exception_handler(exc, context):
    from rest_framework.views import exception_handler as drf_handler  # import here: avoids a cycle at settings load
    response = drf_handler(exc, context)
    if response is None:
        return None

    body = {'code': 'error', 'detail': '', 'fields': {}}
    if isinstance(exc, ApiError):
        body.update(code=exc.code, detail=str(exc.detail), **exc.extra)
    elif isinstance(exc, exceptions.ValidationError):
        data = exc.detail
        fields = data if isinstance(data, dict) else {}
        body.update(code='invalid', detail=_first_message(data), fields=fields)
    elif isinstance(exc, exceptions.APIException):
        codes = exc.get_codes()
        body.update(code=codes if isinstance(codes, str) else 'error', detail=str(exc.detail))
    response.data = body
    return response
