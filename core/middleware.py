from . import tenancy


class DatabaseContextResetMiddleware:
    """
    In production the request transaction ends the SET LOCAL role and client.
    When requests share one outer transaction (tests), reset them explicitly
    so the next request starts clean.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        finally:
            tenancy.reset()
