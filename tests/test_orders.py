"""Orders, items, KOTs, voids, cancelling and the table status that follows them."""
from decimal import Decimal

import pytest

from orders.pricing import calculate

from .conftest import sign_in

POS = '/api/pos/api'


@pytest.fixture
def shop(client_admin):
    """Spice Garden with Table 1, a GST category (CGST + SGST 2.5% each) and two dishes."""
    tenant, api, _ = client_admin
    outlet = api.get(f'{POS}/restaurants/').data[0]
    taxes = api.get(f'{POS}/taxes/', {'restaurant_id': outlet['id']}).data['results']
    category = api.post(f'{POS}/menu-categories/', {'name': 'Mains', 'restaurant': outlet['id'],
                                                    'tax_ids': [t['id'] for t in taxes]}, format='json').data
    paneer = api.post(f'{POS}/menu-items/', {'name': 'Paneer Tikka', 'category': category['id'], 'price': '250'},
                      format='json').data
    naan = api.post(f'{POS}/menu-items/', {'name': 'Butter Naan', 'category': category['id'], 'price': '60'},
                    format='json').data
    table = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '1'}, format='json').data
    return api, outlet, table, paneer, naan


def place(api, outlet, table, *lines, **extra):
    r = api.post(f'{POS}/orders/', {
        'restaurant': outlet['id'], 'table': table['id'] if table else None, 'type': 'dine_in' if table else 'takeaway',
        'items': [{'menu_item': item['id'], 'quantity': qty, 'unit_price': '1', 'special_instructions': note}
                  for item, qty, note in lines], **extra}, format='json')
    assert r.status_code == 201, r.data
    return r.data


def table_status(api, table):
    return api.get(f"{POS}/tables/{table['id']}/").data['status']


def test_placing_an_order_prices_it_from_the_menu(shop):
    api, outlet, table, paneer, naan = shop
    order = place(api, outlet, table, (paneer, 2, 'less spicy'), (naan, 3, ''), customer_name='Ravi')
    # The price sent by the app (1) is ignored; the menu price is used
    assert (order['subtotal'], order['tax_amount'], order['total_amount']) == ('680.00', '34.00', '714.00')
    assert [(t['name'], t['amount']) for t in order['tax_breakdown']] == [('CGST', '17.00'), ('SGST', '17.00')]
    assert order['status'] == 'pending' and order['payment_status'] == 'pending' and order['amount_due'] == '714.00'
    assert order['order_number'].endswith('001') and order['table_number'] == '1' and order['customer_name'] == 'Ravi'
    line = order['items'][0]
    assert (line['menu_item_name'], line['category_name'], line['unit_price'], line['total_price']) == \
        ('Paneer Tikka', 'Mains', '250.00', '500.00')
    assert line['special_instructions'] == 'less spicy' and line['kot_number'] is None
    assert table_status(api, table) == 'occupied'
    assert place(api, outlet, None, (naan, 1, ''))['order_number'].endswith('002')


def test_menu_changes_dont_touch_existing_orders(shop):
    api, outlet, table, paneer, _ = shop
    order = place(api, outlet, table, (paneer, 1, ''))
    api.patch(f"{POS}/menu-items/{paneer['id']}/", {'price': '300', 'name': 'Paneer Tikka (new)'}, format='json')
    again = api.get(f"{POS}/orders/{order['id']}/").data
    assert again['items'][0]['menu_item_name'] == 'Paneer Tikka' and again['total_amount'] == '263.00'


def test_one_open_order_per_table(shop):
    api, outlet, table, paneer, _ = shop
    first = place(api, outlet, table, (paneer, 1, ''))
    r = api.post(f'{POS}/orders/', {'restaurant': outlet['id'], 'table': table['id'], 'items': []}, format='json')
    assert r.status_code == 409 and r.data['code'] == 'table_has_order' and r.data['order_id'] == first['id']


def test_sold_out_items_cannot_be_ordered(shop):
    api, outlet, table, paneer, _ = shop
    api.patch(f"{POS}/menu-items/{paneer['id']}/", {'is_available': False}, format='json')
    r = api.post(f'{POS}/orders/', {'restaurant': outlet['id'], 'items': [{'menu_item': paneer['id'], 'quantity': 1}]},
                 format='json')
    assert r.status_code == 409 and r.data['code'] == 'item_unavailable'


def test_retrying_with_the_same_client_ref_returns_the_same_order(shop):
    api, outlet, _, paneer, _ = shop
    ref = '0b9f7a52-8a39-4f3a-a3f1-6f2c7cbd1d10'
    first = place(api, outlet, None, (paneer, 1, ''), client_ref=ref)
    again = api.post(f'{POS}/orders/', {'restaurant': outlet['id'], 'client_ref': ref,
                                        'items': [{'menu_item': paneer['id'], 'quantity': 1}]}, format='json')
    assert again.status_code == 200 and again.data['id'] == first['id']


def test_kot_numbers_only_new_items(shop):
    api, outlet, table, paneer, naan = shop
    order = place(api, outlet, table, (paneer, 1, 'no onion'))
    kot1 = api.post(f"{POS}/orders/{order['id']}/send_kot/", {}, format='json').data
    assert kot1['kot_number'] == 1 and [i['menu_item_name'] for i in kot1['items']] == ['Paneer Tikka']
    assert kot1['items'][0]['special_instructions'] == 'no onion'
    assert api.get(f"{POS}/orders/{order['id']}/").data['status'] == 'confirmed'
    nothing = api.post(f"{POS}/orders/{order['id']}/send_kot/", {}, format='json')
    assert nothing.status_code == 409 and nothing.data['code'] == 'nothing_to_send'

    added = api.post(f'{POS}/order-items/', {'order': order['id'], 'menu_item': naan['id'], 'quantity': 4},
                     format='json')
    assert added.status_code == 201 and added.data['kot_number'] is None
    kot2 = api.post(f"{POS}/orders/{order['id']}/send_kot/", {}, format='json').data
    assert kot2['kot_number'] == 2 and [(i['menu_item_name'], i['quantity']) for i in kot2['items']] == [('Butter Naan', 4)]
    reprint = api.post(f"{POS}/orders/{order['id']}/send_kot/", {'reprint_kot_number': 1}, format='json').data
    assert reprint['is_reprint'] and [i['menu_item_name'] for i in reprint['items']] == ['Paneer Tikka']
    items = api.get(f"{POS}/orders/{order['id']}/").data['items']
    assert [i['kot_number'] for i in items] == [1, 2] and all(i['kot_sent_at'] for i in items)


def test_pending_items_change_freely(shop):
    api, outlet, table, paneer, naan = shop
    order = place(api, outlet, table, (paneer, 2, ''), (naan, 1, ''))
    paneer_line, naan_line = order['items']
    r = api.patch(f"{POS}/order-items/{paneer_line['id']}/", {'quantity': 1}, format='json')
    assert r.status_code == 200 and r.data['quantity'] == 1
    assert api.delete(f"{POS}/order-items/{naan_line['id']}/").status_code == 204
    assert api.get(f"{POS}/orders/{order['id']}/").data['total_amount'] == '263.00'


@pytest.fixture
def cashier(shop):
    api = shop[0]
    for body in ({'login_id': 'sg_cash', 'role': 'cashier', 'password': 'Cashier-pass-1'},
                 {'login_id': 'sg_mgr', 'role': 'manager', 'email': 'm@spice.example', 'password': 'Manager-pass-1'}):
        assert api.post('/api/auth/users/', body, format='json').status_code == 201
    return sign_in('sg_cash', 'Cashier-pass-1')[0]


def approve(cashier, permission, order):
    r = cashier.post(f'{POS}/approvals/', {'permission': permission, 'approver_username': 'sg_mgr',
                                           'approver_secret': 'Manager-pass-1', 'order_id': order['id']},
                     format='json')
    assert r.status_code == 201, r.data
    return r.data['approval_id']


def test_items_the_kitchen_has_need_a_void_with_approval(shop, cashier):
    api, outlet, table, paneer, _ = shop
    order = place(cashier, outlet, table, (paneer, 3, ''))
    cashier.post(f"{POS}/orders/{order['id']}/send_kot/", {}, format='json')
    line = order['items'][0]
    r = cashier.patch(f"{POS}/order-items/{line['id']}/", {'quantity': 1}, format='json')
    assert r.status_code == 403 and r.data['permission'] == 'order.void_items' and r.data['approval_required']
    assert cashier.delete(f"{POS}/order-items/{line['id']}/").status_code == 403
    no_approval = cashier.post(f"{POS}/order-items/{line['id']}/void/", {'quantity': 1, 'reason': 'Changed mind'},
                               format='json')
    assert no_approval.status_code == 403

    r = cashier.post(f"{POS}/order-items/{line['id']}/void/", {
        'quantity': 2, 'reason': 'Guest changed the order',
        'approval_id': approve(cashier, 'order.void_items', order)}, format='json')
    assert r.status_code == 200, r.data
    assert (r.data['item']['quantity'], r.data['item']['voided_quantity']) == (1, 2)
    assert r.data['void']['amount'] == '500.00' and r.data['void']['approved_by']['name'] == 'sg_mgr'
    assert r.data['order']['total_amount'] == '263.00'
    # Increasing is still fine without approval
    assert cashier.patch(f"{POS}/order-items/{line['id']}/", {'quantity': 2}, format='json').status_code == 200


def test_cancelling_frees_the_table_and_needs_permission(shop, cashier):
    api, outlet, table, paneer, _ = shop
    order = place(cashier, outlet, table, (paneer, 1, ''))
    assert cashier.post(f"{POS}/orders/{order['id']}/cancel/", {'reason': 'Left'}, format='json').status_code == 403
    r = cashier.post(f"{POS}/orders/{order['id']}/cancel/", {
        'reason': 'Guest left', 'approval_id': approve(cashier, 'order.cancel', order)}, format='json')
    assert r.status_code == 200, r.data
    assert r.data['status'] == 'cancelled' and r.data['cancel_reason'] == 'Guest left'
    assert r.data['cancelled_by']['name'] == 'sg_cash' and r.data['cancel_approved_by']['name'] == 'sg_mgr'
    assert table_status(api, table) == 'available'
    closed = api.post(f'{POS}/order-items/', {'order': order['id'], 'menu_item': paneer['id'], 'quantity': 1},
                      format='json')
    assert closed.status_code == 409 and closed.data['code'] == 'order_closed'
    # The table takes a new order right away
    place(api, outlet, table, (paneer, 1, ''))


def test_kitchen_progress_and_stats(shop):
    api, outlet, table, paneer, _ = shop
    order = place(api, outlet, table, (paneer, 1, ''))
    # The app sends to the kitchen by confirming: the items go on KOT 1
    sent = api.patch(f"{POS}/orders/{order['id']}/update_status/", {'status': 'confirmed'}, format='json').data
    assert sent['items'][0]['kot_number'] == 1
    assert api.get(f'{POS}/orders/kitchen_stats/').data['pending_orders'] == 1
    for status_ in ('preparing', 'ready', 'served'):
        r = api.patch(f"{POS}/orders/{order['id']}/update_status/", {'status': status_}, format='json')
        assert r.status_code == 200 and r.data['status'] == status_
    assert r.data['items'][0]['status'] == 'served' and r.data['served_time']
    assert api.get(f'{POS}/orders/kitchen_stats/').data['served_orders'] == 1
    unpaid = api.patch(f"{POS}/orders/{order['id']}/update_status/", {'status': 'completed'}, format='json')
    assert unpaid.status_code == 409 and unpaid.data['code'] == 'not_paid'
    assert table_status(api, table) == 'occupied'


def test_open_orders_by_status_and_moving_tables(shop):
    api, outlet, table, paneer, _ = shop
    other = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '2'}, format='json').data
    order = place(api, outlet, table, (paneer, 1, ''))
    listed = api.get(f'{POS}/orders/', {'restaurant_id': outlet['id'], 'status': 'pending', 'page_size': 100}).data
    assert [o['id'] for o in listed['results']] == [order['id']]
    assert api.get(f'{POS}/orders/', {'restaurant_id': outlet['id'], 'status': 'served'}).data['results'] == []
    moved = api.patch(f"{POS}/orders/{order['id']}/", {'table': other['id'], 'guest_count': 3}, format='json')
    assert moved.status_code == 200 and moved.data['table_number'] == '2' and moved.data['guest_count'] == 3
    assert (table_status(api, table), table_status(api, other)) == ('available', 'occupied')
    bad = api.patch(f"{POS}/orders/{order['id']}/", {'customer_phone': 'call me'}, format='json')
    assert bad.status_code == 400 and 'customer_phone' in bad.data['fields']


def test_another_clients_orders_are_invisible(shop, make_client, mailoutbox):
    api, outlet, table, paneer, _ = shop
    order = place(api, outlet, table, (paneer, 1, ''))
    make_client(name='Beans Cafe', admin_login_id='bc_admin', admin_email='a@beans.example', country='AE')
    other, _ = sign_in('bc_admin', 'Admin-pass-1', mailoutbox)
    assert other.get(f"{POS}/orders/{order['id']}/").status_code == 404
    assert other.get(f'{POS}/orders/').data['results'] == []
    r = other.post(f'{POS}/order-items/', {'order': order['id'], 'menu_item': paneer['id'], 'quantity': 1}, format='json')
    assert r.status_code == 404


# ---- The calculation on its own ----

GST = [{'key': 1, 'name': 'CGST', 'type': 'percentage', 'rate': '2.5', 'amount': None, 'fixed_basis': None},
       {'key': 2, 'name': 'SGST', 'type': 'percentage', 'rate': '2.5', 'amount': None, 'fixed_basis': None}]


def test_discount_is_split_before_tax():
    lines = [{'unit_price': '300', 'quantity': 1, 'taxes': GST}, {'unit_price': '100', 'quantity': 1, 'taxes': GST},
             {'unit_price': '50', 'quantity': 1, 'discountable': False, 'taxes': []}]
    results, totals = calculate(lines, decimals=2, discount_amount=Decimal('40'))
    assert [r['discount'] for r in results] == [Decimal('30.00'), Decimal('10.00'), Decimal('0')]
    assert totals['tax_amount'] == Decimal('18.00') and totals['total_amount'] == Decimal('428.00')


def test_prices_including_tax_and_rounding():
    lines = [{'unit_price': '105', 'quantity': 1, 'taxes': GST}]
    _, totals = calculate(lines, decimals=2, prices_include_tax=True)
    assert totals['total_amount'] == Decimal('105.00') and totals['tax_amount'] == Decimal('5.00')
    _, totals = calculate([{'unit_price': '99.50', 'quantity': 1, 'taxes': GST}], decimals=2,
                          rounding_mode='nearest', rounding_step=Decimal('1'))
    assert totals['total_amount'] == Decimal('104') and totals['round_off'] == Decimal('-0.48')


def test_fixed_taxes_per_unit_and_per_bill():
    packing = {'key': 9, 'name': 'Packing', 'type': 'fixed', 'rate': None, 'amount': '20', 'fixed_basis': 'per_bill'}
    bottle = {'key': 8, 'name': 'Deposit', 'type': 'fixed', 'rate': None, 'amount': '0.250', 'fixed_basis': 'per_unit'}
    lines = [{'unit_price': '1.500', 'quantity': 2, 'taxes': [packing, bottle]},
             {'unit_price': '1.000', 'quantity': 1, 'taxes': [packing]}]
    results, totals = calculate(lines, decimals=3)
    assert [r['tax_amount'] for r in results] == [Decimal('20.500'), Decimal('0')]
    assert totals['total_amount'] == Decimal('24.500')
