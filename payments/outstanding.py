"""
/outstanding-orders/: Credit Pay bills to collect later. Created by settling with credit;
collected (fully or in parts), written off or moved to accounts receivable here.
"""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts import audit
from accounts.views import use_approval
from core.exceptions import ApiError, Conflict, PermissionRequired
from core.money import MoneyField, money_str
from core.pagination import StandardPagination
from orders.services import recalculate, record
from outlets.services import outlets_for

from .models import OutstandingAccount, OutstandingNote
from .services import APP_METHODS, ZERO, decimals_of, shift_for_payment, when
from .views import add_payment

OVERDUE_DAYS = 7
# The Credit Pay screens' method names → the POS methods
COLLECTION_METHODS = {'cash': 'cash', 'card': 'credit_card', 'credit_card': 'credit_card', 'debit_card': 'debit_card',
                      'digital_wallet': 'mobile_payment', 'mobile_payment': 'mobile_payment', 'upi': 'mobile_payment',
                      'bank_transfer': 'bank_transfer'}


def _accounts(request):
    return (OutstandingAccount.objects.filter(order__outlet__in=outlets_for(request.user))
            .select_related('order__outlet', 'order__table', 'resolved_by', 'created_by'))


def _is_overdue(account, today):
    if account.is_resolved:
        return False
    if account.next_follow_up_date:
        return account.next_follow_up_date < today
    return (timezone.now() - account.created_at).days >= OVERDUE_DAYS


def account_payload(a, request, with_notes=False):
    decimals = decimals_of(request)
    m = lambda v: money_str(v, decimals)  # noqa: E731
    order = a.order
    data = {
        'id': a.id,
        'order': order.id,
        'order_number': order.order_number,
        'invoice_number': order.invoice_number or None,
        'restaurant': order.outlet_id,
        'restaurant_name': order.outlet.name,
        'table_number': order.table.table_number if order.table else None,
        'room_number': order.room_number or None,
        'customer_name': a.customer_name,
        'customer_phone': a.customer_phone,
        'customer_email': a.customer_email,
        'original_amount': m(a.original_amount),
        'total_amount': m(order.total_amount),
        'paid_amount': m(a.paid_amount),
        'outstanding_amount': m(a.outstanding_amount),
        'amount': m(a.outstanding_amount),
        'status': a.status,
        'priority': a.priority,
        'is_resolved': a.is_resolved,
        'is_overdue': _is_overdue(a, timezone.localdate()),
        'age_in_days': (timezone.now() - a.created_at).days,
        'contact_attempts': a.contact_attempts,
        'last_contact_date': when(a.last_contact_date),
        'next_follow_up_date': str(a.next_follow_up_date) if a.next_follow_up_date else None,
        'resolution_action': a.resolution_action or None,
        'resolution_notes': a.resolution_notes,
        'resolved_at': when(a.resolved_at),
        'resolved_by_name': a.resolved_by.full_name if a.resolved_by else None,
        'created_by_name': a.created_by.full_name,
        'order_time': when(order.created_at),
        'created_at': when(a.created_at),
    }
    if with_notes:
        data['notes'] = [{'id': n.id, 'note_type': n.note_type, 'contact_method': n.contact_method or None,
                          'content': n.content, 'customer_response': n.customer_response,
                          'created_by_name': n.created_by.full_name if n.created_by else None,
                          'created_at': when(n.created_at)} for n in a.notes.select_related('created_by')]
    return data


class AccountList(generics.GenericAPIView):
    pagination_class = StandardPagination

    def get(self, request):
        params = request.query_params
        qs = _accounts(request)
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('restaurant_id'):
            qs = qs.filter(order__outlet_id=params['restaurant_id'])
        if params.get('search'):
            s = params['search']
            qs = qs.filter(Q(order__order_number__icontains=s) | Q(customer_name__icontains=s) |
                           Q(customer_phone__icontains=s))
        page = self.paginate_queryset(qs)
        return self.get_paginated_response([account_payload(a, request) for a in page])


@api_view(['GET'])
def account_detail(request, pk):
    return Response(account_payload(generics.get_object_or_404(_accounts(request), pk=pk), request, with_notes=True))


@api_view(['GET'])
def dashboard_stats(request):
    open_accounts = [a for a in _accounts(request) if not a.is_resolved]
    today = timezone.localdate()
    ages = [(timezone.now() - a.created_at).days for a in open_accounts]
    return Response({
        'total_outstanding': len(open_accounts),
        'total_amount': money_str(sum((a.outstanding_amount for a in open_accounts), ZERO), decimals_of(request)),
        'overdue_count': sum(1 for a in open_accounts if _is_overdue(a, today)),
        'avg_age_days': round(sum(ages) / len(ages), 1) if ages else 0,
    })


def _locked_account(request, pk):
    account = generics.get_object_or_404(_accounts(request), pk=pk)
    return OutstandingAccount.objects.select_for_update().get(id=account.id)


class ContactSerializer(serializers.Serializer):
    contact_method = serializers.ChoiceField(choices=['phone', 'email', 'in_person', 'sms', 'whatsapp'])
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    customer_response = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    promised_payment_date = serializers.DateField(required=False, allow_null=True)

    def to_internal_value(self, data):
        if hasattr(data, 'copy') and data.get('promised_payment_date') == '':
            data = data.copy()
            data['promised_payment_date'] = None
        return super().to_internal_value(data)


@api_view(['POST'])
def contact_attempt(request, pk):
    body = ContactSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    data = body.validated_data
    account = _locked_account(request, pk)
    if account.is_resolved:
        raise Conflict('This bill is already resolved.', code='already_resolved')
    account.contact_attempts += 1
    account.last_contact_date = timezone.now()
    if data.get('promised_payment_date'):
        account.status = 'payment_promised'
        account.next_follow_up_date = data['promised_payment_date']
    else:
        account.status = 'contacted'
        account.next_follow_up_date = timezone.localdate() + timedelta(days=3)
    account.save()
    OutstandingNote.objects.create(account=account, note_type='contact', contact_method=data['contact_method'],
                                   content=(data.get('notes') or '').strip() or f'Contacted by {data["contact_method"]}',
                                   customer_response=(data.get('customer_response') or '').strip(),
                                   created_by=request.user)
    return Response(account_payload(_accounts(request).get(id=account.id), request, with_notes=True))


@api_view(['POST'])
def add_note(request, pk):
    content = str(request.data.get('content') or '').strip()
    if not content:
        raise ApiError('Write the note.', code='invalid', fields={'content': ['Required.']})
    note_type = request.data.get('note_type') or 'internal'
    if note_type not in ('internal', 'manager'):
        note_type = 'internal'
    account = _locked_account(request, pk)
    OutstandingNote.objects.create(account=account, note_type=note_type, content=content[:2000], created_by=request.user)
    return Response(account_payload(_accounts(request).get(id=account.id), request, with_notes=True))


class ResolveSerializer(serializers.Serializer):
    resolution_action = serializers.ChoiceField(choices=['payment_collected', 'partial_payment', 'room_charge_applied',
                                                         'complimentary', 'manager_writeoff', 'accounts_receivable'])
    amount_collected = MoneyField(required=False, allow_null=True)
    payment_method = serializers.CharField(required=False, allow_blank=True, max_length=20)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    resolution_notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    approval_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    cash_register = serializers.IntegerField(required=False, allow_null=True)


@api_view(['POST'])
def resolve(request, pk):
    """Collect the money (all or part), or close the bill another way."""
    body = ResolveSerializer(data=request.data, context={'request': request})
    body.is_valid(raise_exception=True)
    data = body.validated_data
    account = _locked_account(request, pk)
    if account.is_resolved:
        raise Conflict('This bill is already resolved.', code='already_resolved')
    order = account.order
    order = type(order).objects.select_for_update().get(id=order.id)
    action = data['resolution_action']
    notes = (data.get('resolution_notes') or '').strip()
    left = account.outstanding_amount
    approval = None

    if action == 'room_charge_applied' or data.get('payment_method') == 'room_charge':
        raise Conflict('Charging a hotel room needs the StayDesko connection, which is not set up yet.',
                       code='room_charge_unavailable')
    if action in ('payment_collected', 'partial_payment'):
        if not request.user.has_perm('bill.settle'):
            raise PermissionRequired('bill.settle')
        amount = data.get('amount_collected') or left
        if amount <= 0 or amount > left:
            raise ApiError(f'Collect from 0 to {money_str(left, decimals_of(request))}.', code='invalid',
                           fields={'amount_collected': [f'At most {money_str(left, decimals_of(request))}.']})
        method = COLLECTION_METHODS.get(data.get('payment_method') or 'cash')
        if method not in APP_METHODS:
            raise ApiError('Choose how the guest paid.', code='invalid', fields={'payment_method': ['Not a valid method.']})
        shift = shift_for_payment(request, order.outlet, data.get('cash_register'))
        add_payment(request, order, shift, {'method': method, 'amount': amount, 'reference': data.get('reference')},
                    notes, source='collection')
        account.paid_amount += amount
        order.amount_paid += amount
        if account.outstanding_amount <= 0:
            account.status = 'resolved'
            account.resolution_action = 'payment_collected'
            order.status = 'completed'
        else:
            account.resolution_action = 'partial_payment'
    elif action in ('complimentary', 'manager_writeoff'):
        # Not collecting is a 100% discount after the fact: the same manager permission
        approval = use_approval(request, data.get('approval_id'), 'discount.unlimited', order.id)
        account.status = 'written_off'
        account.resolution_action = action
        order.status = 'completed'
    else:  # accounts_receivable
        approval = use_approval(request, data.get('approval_id'), 'payment.credit', order.id)
        account.status = 'transferred_ar'
        account.resolution_action = action

    if account.is_resolved:
        account.resolved_at = timezone.now()
        account.resolved_by = request.user
    account.resolution_notes = notes or account.resolution_notes
    account.save()
    recalculate(order, request.tenant)
    OutstandingNote.objects.create(account=account, note_type='system', created_by=request.user,
                                   content=f'{action.replace("_", " ").capitalize()}'
                                           f'{f" ({notes})" if notes else ""}')
    record(order, 'credit_' + action, request.user, notes=notes)
    audit.record(request, 'outstanding.resolve', 'order', order.id, approval=approval,
                 after={'order_number': order.order_number, 'action': action,
                        'paid': str(account.paid_amount), 'left': str(account.outstanding_amount)})
    return Response(account_payload(_accounts(request).get(id=account.id), request, with_notes=True))

