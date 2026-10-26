"""
Cash counters and cashier shifts, on the /api/accounting/ paths the POS app uses
(cash-counters, shift-templates, cash-register). Contracts: MISSING_APIS.md "Cash counters".

Cashiers count blind: expected cash and the variance are shown to Managers and
Administrators only.
"""
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import audit
from accounts.views import use_approval
from core.exceptions import ApiError, Conflict, PermissionRequired
from core.money import MoneyField, money_str
from core.pagination import StandardPagination
from core.permissions import read_or_require, require
from orders.services import business_date
from outlets.models import CashCounter
from outlets.services import outlets_for

from .models import CashMovement, Shift
from .services import decimals_of, open_shift_of, person, shift_totals, when

SEES_EXPECTED = ('manager', 'administrator')


def sees_expected(user):
    return user.role.key in SEES_EXPECTED


# ---- Counters -----------------------------------------------------------------

def counter_payload(c, in_use=None):
    return {'id': c.id, 'name': c.name, 'is_active': c.is_active, 'sort_order': c.sort_order,
            'restaurant': c.outlet_id, 'restaurant_name': c.outlet.name,
            'in_use_by': in_use.cashier.full_name if in_use else None, 'open_shift': in_use.id if in_use else None}


class CounterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=60)
    sort_order = serializers.IntegerField(required=False, min_value=0, max_value=9999)
    is_active = serializers.BooleanField(required=False)
    restaurant = serializers.IntegerField(required=False, allow_null=True)


class CounterList(generics.GenericAPIView):
    permission_classes = [read_or_require('settings.manage')]
    pagination_class = StandardPagination

    def get(self, request):
        qs = CashCounter.objects.filter(outlet__in=outlets_for(request.user)).select_related('outlet')
        if request.query_params.get('restaurant_id'):
            qs = qs.filter(outlet_id=request.query_params['restaurant_id'])
        open_shifts = {s.counter_id: s for s in Shift.objects.filter(status='open').select_related('cashier')}
        page = self.paginate_queryset(qs.order_by('outlet__sort_order', 'sort_order', 'name'))
        return self.get_paginated_response([counter_payload(c, open_shifts.get(c.id)) for c in page])

    def post(self, request):
        body = CounterSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        outlets = outlets_for(request.user).filter(is_active=True)
        outlet = outlets.filter(id=data['restaurant']).first() if data.get('restaurant') else outlets.first()
        if outlet is None:
            raise ApiError('No such restaurant.', code='invalid', fields={'restaurant': ['No such restaurant.']})
        name = data['name'].strip()
        if CashCounter.objects.filter(outlet=outlet, name__iexact=name).exists():
            raise ApiError('A counter with this name already exists.', code='invalid', fields={'name': ['Already used.']})
        counter = CashCounter.objects.create(outlet=outlet, name=name, sort_order=data.get('sort_order', 0),
                                             is_active=data.get('is_active', True))
        return Response(counter_payload(counter), status=status.HTTP_201_CREATED)


class CounterDetail(generics.GenericAPIView):
    permission_classes = [read_or_require('settings.manage')]

    def _counter(self, request, pk):
        return generics.get_object_or_404(
            CashCounter.objects.filter(outlet__in=outlets_for(request.user)).select_related('outlet'), pk=pk)

    def get(self, request, pk):
        counter = self._counter(request, pk)
        return Response(counter_payload(counter, Shift.objects.filter(counter=counter, status='open').first()))

    def patch(self, request, pk):
        counter = self._counter(request, pk)
        body = CounterSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if 'name' in data:
            name = data['name'].strip()
            if CashCounter.objects.filter(outlet=counter.outlet, name__iexact=name).exclude(id=counter.id).exists():
                raise ApiError('A counter with this name already exists.', code='invalid', fields={'name': ['Already used.']})
            counter.name = name
        if data.get('is_active') is False and Shift.objects.filter(counter=counter, status='open').exists():
            raise Conflict('Close the open shift on this counter first.', code='counter_in_use')
        for field in ('sort_order', 'is_active'):
            if field in data:
                setattr(counter, field, data[field])
        counter.save()
        return Response(counter_payload(counter))

    put = patch

    def delete(self, request, pk):
        """Counters are kept for the shift history: deleting deactivates."""
        counter = self._counter(request, pk)
        if Shift.objects.filter(counter=counter, status='open').exists():
            raise Conflict('Close the open shift on this counter first.', code='counter_in_use')
        counter.is_active = False
        counter.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
def shift_templates(request):
    """Named shifts (Morning, Evening) are optional in the app; none are set up yet."""
    return Response({'count': 0, 'next': None, 'previous': None, 'results': []})


# ---- Shifts -------------------------------------------------------------------

def shift_payload(shift, request, with_totals=True):
    decimals = decimals_of(request)
    m = lambda v: money_str(v, decimals)  # noqa: E731
    show = sees_expected(request.user)
    totals, expected = shift_totals(shift, decimals) if with_totals else (None, None)
    cash_line = next((r for r in (totals or {}).get('by_method', []) if r['payment_method'] == 'cash'), None)
    data = {
        'id': shift.id,
        'status': shift.status,
        'restaurant': shift.outlet_id,
        'counter_ref': shift.counter_id,
        'counter': shift.counter_name,
        'counter_snapshot': shift.counter_name,
        'cashier': shift.cashier_id,
        'cashier_name': shift.cashier.full_name,
        'opened_by': shift.opened_by_id,
        'opened_by_name': shift.opened_by.full_name,
        'opened_at': when(shift.opened_at),
        'register_date': str(shift.business_date),
        'shift': None,
        'opening_balance': m(shift.opening_balance),
        'cash_receipts': cash_line['total'] if cash_line else m(0),
        'cash_payments': (totals or {}).get('cash_out', m(0)),
        'physical_count': m(shift.counted_cash),
        'closed_at': when(shift.closed_at),
        'closed_by': shift.closed_by_id,
        'closed_by_name': shift.closed_by.full_name if shift.closed_by else None,
        'notes': shift.notes,
        'close_notes': shift.close_notes,
        'carried_from': shift.carried_from_id,
    }
    if show:
        data['calculated_closing'] = m(shift.expected_cash if shift.status == 'closed' else expected)
        data['variance'] = m(shift.variance)
        data['totals'] = totals
    elif totals is not None:
        # Blind count: the takings without the drawer figures
        data['totals'] = {k: v for k, v in totals.items() if k not in ('expected_cash',)}
        data['calculated_closing'] = None
        data['variance'] = None
    return data


def _shifts(request):
    return (Shift.objects.filter(outlet__in=outlets_for(request.user))
            .select_related('cashier', 'opened_by', 'closed_by', 'counter'))


class ShiftList(generics.GenericAPIView):
    pagination_class = StandardPagination

    def get(self, request):
        qs = _shifts(request)
        params = request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('restaurant_id'):
            qs = qs.filter(outlet_id=params['restaurant_id'])
        if not sees_expected(request.user) and params.get('mine') == 'true':
            qs = qs.filter(cashier=request.user)
        page = self.paginate_queryset(qs.order_by('-opened_at', '-id'))
        # Lists stay light: totals only for open shifts (the app shows them in "Open now")
        return self.get_paginated_response([shift_payload(s, request, with_totals=s.status == 'open') for s in page])


@api_view(['GET'])
def current_shift(request):
    shift = open_shift_of(request.user)
    if shift is None:
        raise ApiError('You have no open cash counter.', code='not_found', status_code=404)
    return Response(shift_payload(_shifts(request).get(id=shift.id), request))


@api_view(['GET'])
def shift_detail(request, pk):
    return Response(shift_payload(generics.get_object_or_404(_shifts(request), pk=pk), request))


@api_view(['GET'])
def open_defaults(request):
    """The cash left in the drawer at the counter's last close, offered as the opening cash."""
    counter_id = request.query_params.get('counter_id')
    last = (_shifts(request).filter(counter_id=counter_id, status='closed').order_by('-closed_at').first()
            if counter_id else None)
    if last is None:
        return Response({'opening_balance': None, 'shift_template': None, 'carried_from': None})
    return Response({
        'opening_balance': money_str(last.counted_cash, decimals_of(request)),
        'shift_template': None,
        'carried_from': {'id': last.id, 'cashier': last.cashier.full_name, 'cashier_name': last.cashier.full_name,
                         'closed_at': when(last.closed_at)},
    })


class OpenSerializer(serializers.Serializer):
    counter_id = serializers.IntegerField()
    opening_balance = MoneyField()
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)
    shift_template_id = serializers.IntegerField(required=False, allow_null=True)


@api_view(['POST'])
@permission_classes([require('bill.settle')])
def open_shift(request):
    body = OpenSerializer(data=request.data, context={'request': request})
    body.is_valid(raise_exception=True)
    data = body.validated_data
    counter = (CashCounter.objects.select_for_update().filter(outlet__in=outlets_for(request.user), is_active=True)
               .select_related('outlet').filter(id=data['counter_id']).first())
    if counter is None:
        raise ApiError('Select a cash counter.', code='invalid', fields={'counter_id': ['No such counter.']})
    mine = open_shift_of(request.user)
    if mine:
        raise Conflict(f'You already have {mine.counter_name} open. Close it first.', code='already_open', shift_id=mine.id)
    busy = Shift.objects.filter(counter=counter, status='open').select_related('cashier').first()
    if busy:
        raise Conflict(f'{counter.name} is open by {busy.cashier.full_name}.', code='counter_in_use')
    last = Shift.objects.filter(counter=counter, status='closed').order_by('-closed_at').first()
    try:
        with transaction.atomic():
            shift = Shift.objects.create(
                outlet=counter.outlet, counter=counter, counter_name=counter.name, cashier=request.user,
                opened_by=request.user, business_date=business_date(counter.outlet, request.tenant),
                opening_balance=data['opening_balance'], notes=(data.get('notes') or '').strip(), carried_from=last)
    except IntegrityError:
        raise Conflict(f'{counter.name} was just opened by someone else.', code='counter_in_use')
    audit.record(request, 'shift.open', 'shift', shift.id,
                 after={'counter': counter.name, 'opening_balance': str(shift.opening_balance)})
    return Response(shift_payload(_shifts(request).get(id=shift.id), request), status=status.HTTP_201_CREATED)


class CloseSerializer(serializers.Serializer):
    physical_count = MoneyField()
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)
    denominations = serializers.DictField(required=False, allow_null=True)


@api_view(['POST'])
def close_shift(request, pk):
    """Close with the counted cash. Your own shift, or anyone's for Managers and Administrators."""
    body = CloseSerializer(data=request.data, context={'request': request})
    body.is_valid(raise_exception=True)
    data = body.validated_data
    shift = generics.get_object_or_404(_shifts(request), pk=pk)
    Shift.objects.select_for_update().filter(id=shift.id).first()  # lock; re-read below
    shift = _shifts(request).get(id=shift.id)
    if shift.cashier_id != request.user.id and not sees_expected(request.user):
        raise PermissionRequired('bill.settle', detail="Only a manager can close another cashier's counter.")
    if shift.status != 'open':
        raise Conflict('This counter is already closed.', code='already_closed')
    _, expected = shift_totals(shift, decimals_of(request))
    shift.status = 'closed'
    shift.expected_cash = expected
    shift.counted_cash = data['physical_count']
    shift.variance = data['physical_count'] - expected
    shift.closed_at = timezone.now()
    shift.closed_by = request.user
    shift.close_notes = (data.get('notes') or '').strip()
    shift.save()
    audit.record(request, 'shift.close', 'shift', shift.id,
                 after={'counter': shift.counter_name, 'counted': str(shift.counted_cash),
                        'expected': str(expected), 'variance': str(shift.variance)})
    return Response(shift_payload(shift, request))


class MovementSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=['in', 'out'])
    amount = MoneyField(min_value=Decimal('0.0001'))
    reason = serializers.ChoiceField(choices=[r for r in CashMovement.REASONS if r != 'refund'])
    note = serializers.CharField(required=False, allow_blank=True, max_length=500)
    approval_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)


def movement_payload(mv, decimals):
    return {'id': mv.id, 'cash_register': mv.shift_id, 'type': mv.type, 'amount': money_str(mv.amount, decimals),
            'reason': mv.reason, 'note': mv.note, 'created_by': person(mv.created_by),
            'approved_by': person(mv.approved_by), 'created_at': when(mv.created_at)}


@api_view(['GET', 'POST'])
def movements(request, pk):
    """Cash in and cash out during a shift (needs cash.movement or a manager's approval)."""
    shift = generics.get_object_or_404(_shifts(request), pk=pk)
    decimals = decimals_of(request)
    if request.method == 'GET':
        return Response([movement_payload(mv, decimals) for mv in shift.movements.select_related('created_by', 'approved_by')])
    body = MovementSerializer(data=request.data, context={'request': request})
    body.is_valid(raise_exception=True)
    data = body.validated_data
    shift = Shift.objects.select_for_update().get(id=shift.id)
    if shift.status != 'open':
        raise Conflict('This counter is closed.', code='already_closed')
    if shift.cashier_id != request.user.id and not sees_expected(request.user):
        raise PermissionRequired('cash.movement', detail="This is another cashier's counter.")
    approval = use_approval(request, data.get('approval_id'), 'cash.movement')
    mv = CashMovement.objects.create(shift=shift, type=data['type'], amount=data['amount'], reason=data['reason'],
                                     note=(data.get('note') or '').strip(), created_by=request.user,
                                     approved_by=approval.approver if approval else None)
    audit.record(request, 'shift.cash_' + data['type'], 'shift', shift.id, approval=approval,
                 after={'amount': str(mv.amount), 'reason': mv.reason, 'note': mv.note})
    return Response(movement_payload(mv, decimals), status=status.HTTP_201_CREATED)
