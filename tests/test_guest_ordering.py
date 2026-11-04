"""Guests ordering from a table's QR code: no sign-in, the code is the table's secret."""
from rest_framework.test import APIClient

from .test_merge_tables import floor, merge  # noqa: F401  (floor is a fixture)
from .test_orders import POS, place, shop, table_status  # noqa: F401  (shop is a fixture)

GUEST = '/api/guest/tables'


def guest():
    return APIClient()  # nobody signed in


def order(code, *lines, name='Priya', phone='98765 43210', **extra):
    return guest().post(f'{GUEST}/{code}/orders/', {
        'name': name, 'phone': phone,
        'items': [{'menu_item': item['id'], 'quantity': qty} for item, qty in lines], **extra}, format='json')


def test_guest_sees_the_menu_for_the_table(shop):
    api, outlet, table, paneer, naan = shop
    r = guest().get(f"{GUEST}/{table['qr_code']}/")
    assert r.status_code == 200, r.data
    assert r.data['table'] == {'label': 'Table 1'} and r.data['restaurant']['name'] == outlet['name']
    assert r.data['currency']['code'] == 'INR' and r.data['mode'] == 'auto'
    items = [(i['name'], i['price']) for c in r.data['categories'] for i in c['items']]
    assert items == [('Butter Naan', '60.00'), ('Paneer Tikka', '250.00')]
    assert guest().get(f'{GUEST}/not-a-code/').status_code == 404


def test_guest_order_starts_the_tables_order(shop):
    api, outlet, table, paneer, naan = shop
    r = order(table['qr_code'], (paneer, 2), (naan, 1))
    assert r.status_code == 201, r.data
    assert r.data['table'] == 'Table 1' and [i['quantity'] for i in r.data['items']] == [2, 1]

    staff_view = api.get(f'{POS}/orders/', {'restaurant_id': outlet['id']}).data['results'][0]
    assert staff_view['source'] == 'qr' and staff_view['status'] == 'pending'
    assert (staff_view['customer_name'], staff_view['customer_phone']) == ('Priya', '98765 43210')
    assert [i['source'] for i in staff_view['items']] == ['qr', 'qr']
    assert staff_view['subtotal'] == '560.00' and staff_view['total_amount'] == '588.00'  # priced by the server
    assert table_status(api, table) == 'occupied'


def test_guest_items_join_the_open_order_and_merged_tables(floor):
    api, outlet, (t1, t2, _), paneer, naan = floor
    running = place(api, outlet, t1, (paneer, 1, ''))
    assert order(t1['qr_code'], (naan, 2), name='Ravi', phone='+91 9000000001').status_code == 201
    bill = api.get(f"{POS}/orders/{running['id']}/").data
    assert [(i['menu_item_name'], i['source']) for i in bill['items']] == [('Paneer Tikka', 'pos'), ('Butter Naan', 'qr')]
    assert bill['customer_name'] == 'Ravi'

    merge(api, t1, t2)
    assert order(t2['qr_code'], (naan, 1)).status_code == 201
    bill = api.get(f"{POS}/orders/{running['id']}/").data
    assert bill['items'][-1]['table_number'] == '2'  # its KOT prints with Table 2's name


def test_guest_order_checks(shop):
    api, outlet, table, paneer, naan = shop
    code = table['qr_code']
    assert order(code, (paneer, 1), name='').status_code == 400
    assert order(code, (paneer, 1), phone='12').status_code == 400
    assert order(code, (paneer, 21)).status_code == 400  # at most 20 of an item
    assert order(code, ({'id': 999999}, 1)).status_code == 400

    api.patch(f"{POS}/menu-items/{naan['id']}/", {'is_available': False}, format='json')
    r = order(code, (naan, 1))
    assert r.status_code == 409 and 'sold out' in r.data['detail']

    # A retry with the same reference doesn't order twice
    ref = '5b0e6a32-6a7c-4cf4-9a0e-2a1d6b9b2f10'
    assert order(code, (paneer, 1), client_ref=ref).status_code == 201
    assert order(code, (paneer, 1), client_ref=ref).data['order_number']
    lines = api.get(f'{POS}/orders/', {'restaurant_id': outlet['id']}).data['results'][0]['items']
    assert len(lines) == 1

    # A new QR code stops the printed one working
    api.post(f"{POS}/tables/{table['id']}/generate_qr_code/", {}, format='json')
    assert order(code, (paneer, 1)).status_code == 404


def test_qr_ordering_mode_is_per_restaurant(shop):
    api, outlet, table, *_ = shop
    url = f"{POS}/restaurants/{outlet['id']}/qr-ordering/"
    assert api.get(url).data['mode'] == 'auto'
    assert api.put(url, {'mode': 'accept'}, format='json').data['mode'] == 'accept'
    assert api.put(url, {'mode': 'sometimes'}, format='json').status_code == 400
    assert guest().get(f"{GUEST}/{table['qr_code']}/").data['mode'] == 'accept'
    assert api.get(f"{POS}/restaurants/{outlet['id']}/print-settings/").data['qr_orders_mode'] == 'accept'
