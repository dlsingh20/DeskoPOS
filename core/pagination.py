from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """{count, next, previous, results}, as the POS app reads today."""
    page_size_query_param = 'page_size'
    max_page_size = 200
