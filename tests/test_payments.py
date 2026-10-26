"""Discounts, settling, Credit Pay, cash counter shifts and refunds."""
import pytest
from django.utils import timezone

from payments.services import fiscal_year

from .conftest import sign_in
from .test_orders import place, shop, table_status  # noqa: F401  (shop is a fixture)

POS = '/api/pos/api'
ACC = '/api/accounting'


@pytest.fixture
def staff(shop, mailoutbox):  # noqa: F811
    """Admin api plus a cashier and a manager (manager PIN 4821), all signed in."""
    api = shop[0]
    for body in ({'login_id': 'sg_cash', 'role': 'cashier', 'password': 'Cashier-pass-1'},
                 {'login_id': 'sg_mgr', 'role': 'manager', 'email': 'm@spice.example', 'password': 'Manager-pass-1'}):
        assert api.post('/api/auth/users/', body, format='json').status_code == 201
    cashier = sign_in('sg_cash', 'Cashier-pass-1')[0]
    manager = sign_in('sg_mgr', 'Manager-pass-1', mailoutbox)[0]
    return shop, cashier, manager


def approve(client, permission, order):
    r = client.post(f'{POS}/approvals/', {'permission': permission, 'approver_username': 'sg_mgr',
                                          'approver_secret': 'Manager-pass-1-own', 'order_id': order['id']},
                    format='json')
    assert r.status_code == 201, r.data
    return r.data['approval_id']


def counter_of(api):
    return api.get(f'{ACC}/cash-counters/').data['results'][0]


def open_counter(client, api, opening='2000'):
    r = client.post(f'{ACC}/cash-register/open/', {'counter_id': counter_of(api)['id'], 'opening_balance': opening},
                    format='json')
    assert r.status_code == 201, r.data
    return r.data


def settle(client, order, payments=(), **extra):
    due = client.get(f"{POS}/orders/{order['id']}/").data['amount_due']
    return client.post(f"{POS}/orders/{order['id']}/settle/", {
        'expected_amount_due': extra.pop('expected', due), 'payments': list(payments), **extra}, format='json')


def cash(amount, received=None):
    return {'method': 'cash', 'amount': amount, 'amount_received': received}


# ---- Discounts ----

def test_discount_recalculates_tax_and_respects_the_limit(staff):
    (api, outlet, table, paneer, naan), cashier, _ = staff
    order = place(cashier, outlet, table, (paneer, 4, ''))  # 1000 + 5% GST
    url = f"{POS}/orders/{order['id']}/apply_discount/"
    r = cashier.post(url, {'type': 'percent', 'value': '10', 'reason': 'Regular', 'expected_subtotal': '1000.00'},
                     format='json')
    assert r.status_code == 200, r.data
    assert (r.data['discount_amount'], r.data['tax_amount'], r.data['total_amount']) == ('100.00', '45.00', '945.00')
    assert r.data['discounted_by']['name'] == 'sg_cash'

    over = cashier.post(url, {'type': 'percent', 'value': '50', 'reason': 'Friend'}, format='json')
    assert over.status_code == 403 and over.data['approval_required'] and over.data['permission'] == 'discount.unlimited'
    ok = cashier.post(url, {'type': 'fixed', 'value': '500', 'reason': 'Friend',
                            'approval_id': approve(cashier, 'discount.unlimited', order)}, format='json')
    assert ok.status_code == 200 and ok.data['discount_approved_by']['name'] == 'sg_mgr'
    assert (ok.data['tax_amount'], ok.data['total_amount']) == ('25.00', '525.00')

    stale = cashier.post(url, {'type': 'percent', 'value': '5', 'reason': 'x', 'expected_subtotal': '900'}, format='json')
    assert stale.status_code == 409 and stale.data['code'] == 'subtotal_changed' and stale.data['subtotal'] == '1000.00'
    # A percent discount follows the items
    cashier.post(url, {'type': 'percent', 'value': '10', 'reason': 'Regular'}, format='json')
    cashier.post(f'{POS}/order-items/', {'order': order['id'], 'menu_item': naan['id'], 'quantity': 5}, format='json')
    assert cashier.get(f"{POS}/orders/{order['id']}/").data['discount_amount'] == '130.00'
    removed = cashier.delete(f"{POS}/orders/{order['id']}/discount/")
    assert removed.data['discount_amount'] == '0.00' and removed.data['total_amount'] == '1365.00'


# ---- Settle ----

def test_cashier_settles_cash_on_the_open_counter(staff):
    (api, outlet, table, paneer, _), cashier, _ = staff
    order = place(cashier, outlet, table, (paneer, 2, ''))  # 525
    r = settle(cashier, order, [cash('525.00', '600.00')])
    assert r.status_code == 409 and r.data['code'] == 'no_open_shift'

    shift = open_counter(cashier, api)
    r = settle(cashier, order, [cash('525.00', '600.00')], cash_register=shift['id'], idempotency_key='k-1')
    assert r.status_code == 200, r.data
    fy = fiscal_year(timezone.localdate(), 4)
    assert r.data['order']['status'] == 'completed' and r.data['order']['amount_due'] == '0.00'
    assert r.data['order']['invoice_number'] == f'MAIN/{fy}/000001'
    assert r.data['payments'][0]['change_returned'] == '75.00' and r.data['payments'][0]['cash_register'] == shift['id']
    assert r.data['table'] == {'id': table['id'], 'status': 'available'}
    assert table_status(api, table) == 'available'

    again = settle(cashier, order, [cash('525.00')], expected='525.00', idempotency_key='k-1')
    assert again.status_code == 200 and again.data == r.data  # the retry replays, nothing charged twice
    other_key = settle(cashier, order, [cash('525.00')], expected='525.00', idempotency_key='k-2')
    assert other_key.status_code == 409 and other_key.data['code'] == 'already_settled'
    full = api.get(f"{POS}/orders/{order['id']}/").data
    assert len(full['payments']) == 1 and full['payment_status'] == 'paid' and full['closed_by']['name'] == 'sg_cash'


def test_settle_checks_the_amount(staff):
    (api, outlet, table, paneer, _), cashier, _ = staff
    order = place(cashier, outlet, table, (paneer, 2, ''))
    open_counter(cashier, api)
    changed = settle(cashier, order, [cash('500.00')], expected='500.00')
    assert changed.status_code == 409 and changed.data == {**changed.data, 'code': 'amount_changed', 'amount_due': '525.00'}
    over = settle(cashier, order, [cash('300.00'), {'method': 'mobile_payment', 'amount': '300.00', 'channel': 'upi'}])
    assert over.status_code == 422 and over.data['code'] == 'overpayment'
    short = settle(cashier, order, [cash('300.00')])
    assert short.status_code == 422 and short.data['code'] == 'underpayment'
    room = settle(cashier, order, [], room_charge={'guest_id': 881})
    assert room.status_code == 409 and room.data['code'] == 'room_charge_unavailable'


def test_split_payment_with_tip(staff):
    (api, outlet, table, paneer, _), cashier, _ = staff
    order = place(cashier, outlet, table, (paneer, 4, ''))  # 1050
    open_counter(cashier, api)
    waiter = api.post('/api/auth/users/', {'login_id': 'sg_wait', 'role': 'waiter', 'first_name': 'Ravi'},
                      format='json').data
    r = settle(cashier, order, [cash('550.00'), {'method': 'mobile_payment', 'channel': 'upi', 'amount': '500.00',
                                                 'reference': 'UTR4561237890'}],
               tip={'amount': '50.00', 'method': 'cash', 'staff_id': waiter['id']})
    assert r.status_code == 200, r.data
    assert [(p['method'], p['channel'], p['amount']) for p in r.data['payments']] == \
        [('cash', None, '550.00'), ('mobile_payment', 'upi', '500.00')]
    assert r.data['tip']['staff']['id'] == waiter['id']
    assert api.get(f"{POS}/orders/{order['id']}/").data['tip_amount'] == '50.00'


def test_administrator_settles_without_a_counter(staff):
    (api, outlet, _, paneer, _), _, _ = staff
    order = place(api, outlet, None, (paneer, 1, ''))
    r = settle(api, order, [{'method': 'credit_card', 'amount': '263.00', 'reference': 'APP123'}])
    assert r.status_code == 200 and r.data['payments'][0]['card_type'] == 'credit'
    assert r.data['payments'][0]['cash_register'] is None


# ---- Credit Pay ----

def test_credit_pay_then_collect(staff):
    (api, outlet, table, paneer, _), cashier, _ = staff
    order = place(cashier, outlet, table, (paneer, 4, ''))  # 1050
    shift = open_counter(cashier, api)
    credit = {'customer_name': 'R. Kumar', 'customer_phone': '+91 98765 43210'}
    denied = settle(cashier, order, [cash('50.00')], credit=credit)
    assert denied.status_code == 403 and denied.data['permission'] == 'payment.credit'
    r = settle(cashier, order, [cash('50.00')], credit=credit, approval_id=approve(cashier, 'payment.credit', order))
    assert r.status_code == 200, r.data
    assert r.data['order']['status'] == 'outstanding' and r.data['order']['amount_due'] == '1000.00'
    assert r.data['order']['invoice_number'] and table_status(api, table) == 'available'

    stats = cashier.get(f'{POS}/outstanding-orders/dashboard_stats/').data
    assert stats['total_outstanding'] == 1 and stats['total_amount'] == '1000.00'
    account = cashier.get(f'{POS}/outstanding-orders/').data['results'][0]
    assert (account['customer_name'], account['outstanding_amount'], account['is_resolved']) == ('R. Kumar', '1000.00', False)

    contact = cashier.post(f"{POS}/outstanding-orders/{account['id']}/contact_attempt/",
                           {'contact_method': 'phone', 'notes': 'Called', 'promised_payment_date': ''}, format='json')
    assert contact.status_code == 200 and contact.data['contact_attempts'] == 1 and contact.data['status'] == 'contacted'
    part = cashier.post(f"{POS}/outstanding-orders/{account['id']}/resolve/", {
        'resolution_action': 'partial_payment', 'amount_collected': '400.00', 'payment_method': 'cash'}, format='json')
    assert part.status_code == 200 and part.data['outstanding_amount'] == '600.00' and not part.data['is_resolved']
    rest = cashier.post(f"{POS}/outstanding-orders/{account['id']}/resolve/", {
        'resolution_action': 'payment_collected', 'payment_method': 'digital_wallet'}, format='json')
    assert rest.status_code == 200 and rest.data['is_resolved'] and rest.data['status'] == 'resolved'
    final = api.get(f"{POS}/orders/{order['id']}/").data
    assert (final['status'], final['payment_status'], final['amount_paid']) == ('completed', 'paid', '1050.00')
    assert [p['source'] for p in final['payments']] == ['settle', 'collection', 'collection']
    assert all(p['cash_register'] == shift['id'] for p in final['payments'])


# ---- Cash counters ----

def test_shift_figures_and_blind_close(staff):
    (api, outlet, table, paneer, _), cashier, manager = staff
    shift = open_counter(cashier, api, opening='2000')
    assert 'variance' in shift and shift['calculated_closing'] is None  # cashiers count blind
    assert cashier.post(f'{ACC}/cash-register/open/', {'counter_id': counter_of(api)['id'], 'opening_balance': '0'},
                        format='json').data['code'] == 'already_open'
    assert manager.post(f'{ACC}/cash-register/open/', {'counter_id': counter_of(api)['id'], 'opening_balance': '0'},
                        format='json').data['code'] == 'counter_in_use'
    assert counter_of(api)['in_use_by'] == 'sg_cash'

    order = place(cashier, outlet, table, (paneer, 2, ''))
    settle(cashier, order, [cash('525.00')])
    out = cashier.post(f"{ACC}/cash-register/{shift['id']}/movements/", {'type': 'out', 'amount': '100', 'reason': 'supplier',
                                                                          'note': 'Milk'}, format='json')
    assert out.status_code == 403  # cashiers need a manager for cash out
    pin = cashier.post(f'{POS}/approvals/', {'permission': 'cash.movement', 'approver_username': 'sg_mgr',
                                             'approver_secret': 'Manager-pass-1-own'}, format='json').data['approval_id']
    out = cashier.post(f"{ACC}/cash-register/{shift['id']}/movements/", {'type': 'out', 'amount': '100', 'reason': 'supplier',
                                                                          'approval_id': pin}, format='json')
    assert out.status_code == 201

    seen = manager.get(f"{ACC}/cash-register/{shift['id']}/").data
    assert seen['totals']['expected_cash'] == '2425.00' and seen['calculated_closing'] == '2425.00'
    assert seen['totals']['by_method'] == [{'payment_method': 'cash', 'total': '525.00', 'count': 1}]
    assert 'expected_cash' not in cashier.get(f'{ACC}/cash-register/current/').data['totals']

    closed = cashier.post(f"{ACC}/cash-register/{shift['id']}/close/", {'physical_count': '2400'}, format='json')
    assert closed.status_code == 200 and closed.data['status'] == 'closed' and closed.data['variance'] is None
    assert manager.get(f"{ACC}/cash-register/{shift['id']}/").data['variance'] == '-25.00'
    assert cashier.get(f'{ACC}/cash-register/current/').status_code == 404
    defaults = cashier.get(f'{ACC}/cash-register/open_defaults/', {'counter_id': counter_of(api)['id']}).data
    assert defaults['opening_balance'] == '2400.00' and defaults['carried_from']['cashier'] == 'sg_cash'


def test_counters_are_set_up_by_the_administrator(staff):
    (api, _, _, _, _), cashier, _ = staff
    r = api.post(f'{ACC}/cash-counters/', {'name': 'Bar Counter', 'sort_order': 2}, format='json')
    assert r.status_code == 201 and r.data['restaurant_name'] == 'Spice Garden Main'
    assert cashier.post(f'{ACC}/cash-counters/', {'name': 'Mine'}, format='json').status_code == 403
    assert [c['name'] for c in cashier.get(f'{ACC}/cash-counters/').data['results']] == ['Counter 1', 'Bar Counter']
    assert api.patch(f"{ACC}/cash-counters/{r.data['id']}/", {'is_active': False}, format='json').data['is_active'] is False


# ---- Refunds ----

def test_manager_refunds_cash_from_their_counter(staff):
    (api, outlet, table, paneer, _), cashier, manager = staff
    shift = open_counter(cashier, api)
    order = place(cashier, outlet, table, (paneer, 4, ''))  # 1050
    paid = settle(cashier, order, [cash('1000.00'), {'method': 'mobile_payment', 'channel': 'upi', 'amount': '50.00'}]).data
    cash_payment = paid['payments'][0]['id']

    denied = cashier.post(f"{POS}/orders/{order['id']}/refund/", {
        'refunds': [{'payment_id': cash_payment, 'amount': '500.00'}], 'reason': 'food_quality'}, format='json')
    assert denied.status_code == 403 and denied.data['permission'] == 'bill.refund'
    no_counter = manager.post(f"{POS}/orders/{order['id']}/refund/", {
        'refunds': [{'payment_id': cash_payment, 'amount': '500.00'}], 'reason': 'food_quality'}, format='json')
    assert no_counter.status_code == 409 and no_counter.data['code'] == 'no_open_shift'

    mgr_shift = manager.post(f'{ACC}/cash-register/open/', {
        'counter_id': api.post(f'{ACC}/cash-counters/', {'name': 'Desk'}, format='json').data['id'],
        'opening_balance': '1000'}, format='json').data
    too_much = manager.post(f"{POS}/orders/{order['id']}/refund/", {
        'refunds': [{'payment_id': cash_payment, 'amount': '1000.01'}], 'reason': 'food_quality'}, format='json')
    assert too_much.status_code == 400 and too_much.data['code'] == 'amount_exceeds_paid'
    r = manager.post(f"{POS}/orders/{order['id']}/refund/", {
        'refunds': [{'payment_id': cash_payment, 'amount': '500.00'}], 'reason': 'food_quality',
        'note': 'Dal was cold'}, format='json')
    assert r.status_code == 200, r.data
    assert r.data['refunded_total'] == '500.00' and r.data['refund']['credit_note_number'].startswith('CN/MAIN/')
    assert r.data['payments'][0]['status'] == 'partially_refunded' and r.data['status'] == 'completed'
    # The cash left the manager's drawer, not the cashier's
    assert manager.get(f"{ACC}/cash-register/{mgr_shift['id']}/").data['totals']['expected_cash'] == '500.00'
    assert manager.get(f"{ACC}/cash-register/{shift['id']}/").data['totals']['expected_cash'] == '3000.00'

    rest = manager.post(f"{POS}/orders/{order['id']}/refund/", {
        'refunds': [{'payment_id': cash_payment, 'amount': '500.00'},
                    {'payment_id': paid['payments'][1]['id'], 'amount': '50.00'}], 'reason': 'other'}, format='json')
    assert rest.status_code == 400 and 'note' in rest.data['fields']
    rest = manager.post(f"{POS}/orders/{order['id']}/refund/", {
        'refunds': [{'payment_id': cash_payment, 'amount': '500.00'},
                    {'payment_id': paid['payments'][1]['id'], 'amount': '50.00'}], 'reason': 'service'}, format='json')
    assert rest.status_code == 200 and rest.data['status'] == 'refunded'
