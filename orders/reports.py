"""
/reports/: the few report endpoints the app calls. History and the Reports screen work
out their figures in the app from /orders/ (MISSING_APIS.md "Server-side reports" is planned).
"""
from datetime import date, timedelta

from django.db.models import Sum
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.money import money_str
from outlets.services import outlets_for

from .models import OrderItem


def _day(value, default):
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return default


@api_view(['GET'])
def top_items(request):
    """Best sellers by quantity on settled bills (the menu's Top Sellers rail). Revenue needs reports.view."""
    params = request.query_params
    end = _day(params.get('end_date'), date.today())
    start = _day(params.get('start_date'), end - timedelta(days=30))
    try:
        limit = max(1, min(int(params.get('limit', 10)), 50))
    except ValueError:
        limit = 10
    lines = OrderItem.objects.filter(order__outlet__in=outlets_for(request.user), order__status__in=['completed', 'outstanding'],
                                     order__business_date__gte=start, order__business_date__lte=end, quantity__gt=0)
    if params.get('restaurant_id'):
        lines = lines.filter(order__outlet_id=params['restaurant_id'])
    rows = (lines.values('product_id', 'menu_item_name').annotate(quantity=Sum('quantity'), revenue=Sum('total_price'))
            .order_by('-quantity', 'menu_item_name')[:limit])
    decimals = int(request.tenant.get('currency_decimals') or 0)
    show_revenue = request.user.has_perm('reports.view')  # the rail only needs the ranking
    return Response({'start_date': str(start), 'end_date': str(end), 'items': [
        {'menu_item_id': r['product_id'], 'name': r['menu_item_name'], 'quantity': r['quantity'],
         'revenue': money_str(r['revenue'], decimals) if show_revenue else None} for r in rows]})
