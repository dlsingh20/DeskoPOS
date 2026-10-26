"""History window, staff names, top sellers and shared print settings."""
from .test_orders import place, shop  # noqa: F401  (shop is a fixture)
from .test_payments import cash, counter_of, open_counter, settle, staff  # noqa: F401

POS = '/api/pos/api'
ACC = '/api/accounting'


def test_cashiers_see_bills_since_the_last_counter_close(staff):  # noqa: F811
    (api, outlet, table, paneer, naan), cashier, manager = staff
    shift = open_counter(cashier, api)
    before = place(cashier, outlet, table, (paneer, 1, ''))
    assert settle(cashier, before, [cash('263.00')]).status_code == 200
    cashier.post(f"{ACC}/cash-register/{shift['id']}/close/", {'physical_count': '2263'}, format='json')

    open_counter(cashier, api)
    after = place(cashier, outlet, table, (naan, 2, ''))
    settle(cashier, after, [cash('126.00')])
    still_open = place(cashier, outlet, None, (naan, 1, ''))

    mine = {o['id'] for o in cashier.get(f'{POS}/orders/', {'restaurant_id': outlet['id']}).data['results']}
    assert mine == {after['id'], still_open['id']}
    assert cashier.get(f"{POS}/orders/{before['id']}/").status_code == 404
    everything = {o['id'] for o in manager.get(f'{POS}/orders/', {'restaurant_id': outlet['id']}).data['results']}
    assert everything == {before['id'], after['id'], still_open['id']}


def test_staff_names_for_every_user(staff):  # noqa: F811
    (api, _, _, _, _), cashier, _ = staff
    waiter = api.post('/api/auth/users/', {'login_id': 'sg_wait', 'role': 'waiter', 'first_name': 'Ravi',
                                           'last_name': 'K'}, format='json').data
    people = cashier.get(f'{POS}/staff/', {'active': 'all', 'page_size': 500}).data['results']
    assert {'id': waiter['id'], 'name': 'Ravi K', 'login_id': 'sg_wait', 'role': 'waiter', 'role_name': 'Waiter',
            'is_active': True} in people
    assert [p['name'] for p in cashier.get(f'{POS}/staff/', {'role': 'waiter'}).data['results']] == ['Ravi K']
    assert cashier.get('/api/auth/users/').status_code == 403


def test_top_sellers(staff):  # noqa: F811
    (api, outlet, table, paneer, naan), cashier, _ = staff
    open_counter(cashier, api)
    settle(cashier, place(cashier, outlet, table, (naan, 3, ''), (paneer, 1, '')), [cash('452.00')])
    place(cashier, outlet, None, (paneer, 9, ''))  # still open: not counted
    ranked = cashier.get(f'{POS}/reports/top_items', {'limit': 8}).data['items']
    assert [(i['name'], i['quantity'], i['revenue']) for i in ranked] == [('Butter Naan', 3, None), ('Paneer Tikka', 1, None)]
    assert api.get(f'{POS}/reports/top_items/').data['items'][0]['revenue'] == '180.00'


PRINT = {
    'bill_format': 'thermal58', 'kot_format': 'sheet', 'sheet_size': 'A4',
    'header': {'name': 'Spice Garden', 'address': '12 MG Road', 'phone': '080 4000 1234', 'tax_id_label': 'GSTIN',
               'tax_id': '29abcde1234f1z5', 'licence_label': 'FSSAI Lic. No', 'licence': '11223344556677',
               'footer': 'Thank you! Visit again.'},
    'tax': {'profile': 'IN', 'invoice_title': 'TAX INVOICE', 'receipt_title': 'BILL', 'mode': 'split',
            'single_label': 'GST', 'components': [{'label': 'CGST', 'share': 50}, {'label': 'SGST', 'share': 50}]},
    'kot_copies': 2, 'auto_print_bill': True, 'qr_orders_mode': 'accept',
}


def test_print_settings_are_shared_by_the_restaurant(staff):  # noqa: F811
    (api, outlet, _, _, _), cashier, _ = staff
    url = f"{POS}/restaurants/{outlet['id']}/print-settings/"
    first = cashier.get(url).data
    assert first['saved'] is False and first['header']['name'] == 'Spice Garden Main'
    assert first['header']['tax_id_label'] == 'GSTIN' and first['bill_format'] == 'thermal80'
    assert cashier.put(url, PRINT, format='json').status_code == 403
    bad = api.put(url, {**PRINT, 'header': {**PRINT['header'], 'licence': '#'}}, format='json')
    assert bad.status_code == 400 and 'header' in bad.data['fields']

    saved = api.put(url, PRINT, format='json')
    assert saved.status_code == 200, saved.data
    seen = cashier.get(url).data
    assert seen['saved'] and seen['updated_by']['name'] == 'Administrator'
    assert (seen['bill_format'], seen['kot_format'], seen['kot_copies'], seen['auto_print_bill']) == ('thermal58', 'sheet', 2, True)
    assert seen['header']['tax_id'] == '29ABCDE1234F1Z5' and seen['tax']['components'][1] == {'label': 'SGST', 'share': 50.0}
    assert seen['qr_orders_mode'] == 'accept'
