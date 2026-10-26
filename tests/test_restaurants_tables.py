"""Restaurants (outlets), client settings and tables."""
import pytest

from .conftest import sign_in

POS = '/api/pos/api'


@pytest.fixture
def admin(client_admin):
    tenant, api, _ = client_admin
    outlet = api.get(f'{POS}/restaurants/').data[0]
    return tenant, api, outlet


def add_cashier(api, login_id='sg_cash'):
    r = api.post('/api/auth/users/', {'login_id': login_id, 'role': 'cashier', 'password': 'Cashier-pass-1'}, format='json')
    assert r.status_code == 201, r.data
    return sign_in(login_id, 'Cashier-pass-1')[0]


def test_restaurant_list_has_table_counts(admin):
    _, api, outlet = admin
    assert outlet['name'] == 'Spice Garden Main' and outlet['code'] == 'MAIN' and outlet['is_active']
    api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '1', 'capacity': 4}, format='json')
    t2 = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '2', 'capacity': 2}, format='json').data
    api.patch(f"{POS}/tables/{t2['id']}/update_status/", {'status': 'occupied'}, format='json')
    again = api.get(f"{POS}/restaurants/{outlet['id']}/").data
    assert (again['total_tables'], again['available_tables'], again['occupied_tables']) == (2, 1, 1)


def test_client_settings_replace_hotel_settings(admin):
    _, api, _ = admin
    s = api.get(f'{POS}/settings/').data
    assert (s['name'], s['currency'], s['currency_symbol'], s['currency_decimals']) == ('Spice Garden', 'INR', '₹', 2)
    assert s['timezone'] == 'Asia/Kolkata' and s['tax_id_label'] == 'GSTIN'
    assert api.patch(f'{POS}/settings/', {'cashier_discount_limit': '15'}, format='json').data['cashier_discount_limit'] == '15.0000'


def test_plan_limits_new_restaurants(admin):
    _, api, _ = admin  # growth plan: 3 outlets
    for name in ('Terrace', 'Rooftop'):
        r = api.post(f'{POS}/restaurants/', {'name': name, 'type': 'bar'}, format='json')
        assert r.status_code == 201, r.data
        assert r.data['code'] in ('O2', 'O3') and r.data['total_tables'] == 0
    r = api.post(f'{POS}/restaurants/', {'name': 'Fourth'}, format='json')
    assert r.status_code == 409 and r.data['code'] == 'plan_limit'
    menus = api.get(f'{POS}/menus/by_restaurant/', {'restaurant_id': api.get(f'{POS}/restaurants/').data[1]['id']}).data
    assert [m['name'] for m in menus] == ['Main Menu']


def test_last_restaurant_cannot_be_closed(admin):
    _, api, outlet = admin
    r = api.delete(f"{POS}/restaurants/{outlet['id']}/")
    assert r.status_code == 409 and r.data['code'] == 'last_outlet'


def test_table_numbers_are_unique_per_restaurant(admin):
    _, api, outlet = admin
    body = {'restaurant': outlet['id'], 'table_number': 'T1', 'capacity': 4}
    first = api.post(f'{POS}/tables/', body, format='json')
    assert first.status_code == 201
    assert first.data['name'] == 'Table T1' and first.data['qr_code'] and first.data['is_available'] is True
    dup = api.post(f'{POS}/tables/', {**body, 'table_number': 't1'}, format='json')
    assert dup.status_code == 400 and 'table_number' in dup.data['fields']
    assert api.post(f'{POS}/tables/', {**body, 'table_number': 'T2', 'capacity': 0}, format='json').status_code == 400


def test_tables_by_restaurant_and_status(admin):
    _, api, outlet = admin
    t = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '5', 'location': 'Terrace',
                                    'is_outdoor': True}, format='json').data
    listed = api.get(f'{POS}/tables/by_restaurant/', {'restaurant_id': outlet['id']}).data
    assert [x['table_number'] for x in listed] == ['5'] and listed[0]['location'] == 'Terrace'
    assert api.patch(f"{POS}/tables/{t['id']}/update_status/", {'status': 'party'}, format='json').status_code == 400
    r = api.patch(f"{POS}/tables/{t['id']}/update_status/", {'status': 'cleaning'}, format='json')
    assert r.data['status'] == 'cleaning' and r.data['is_available'] is False


def test_regenerating_the_qr_code_changes_it(admin):
    _, api, outlet = admin
    t = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '9'}, format='json').data
    again = api.post(f"{POS}/tables/{t['id']}/generate_qr_code/").data
    assert again['qr_code'] and again['qr_code'] != t['qr_code']


def test_occupied_table_cannot_be_deleted(admin):
    _, api, outlet = admin
    t = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '3'}, format='json').data
    api.patch(f"{POS}/tables/{t['id']}/update_status/", {'status': 'occupied'}, format='json')
    assert api.delete(f"{POS}/tables/{t['id']}/").status_code == 409
    api.patch(f"{POS}/tables/{t['id']}/update_status/", {'status': 'available'}, format='json')
    assert api.delete(f"{POS}/tables/{t['id']}/").status_code == 204
    assert api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '3'}, format='json').status_code == 201


def test_cashier_can_use_but_not_set_up_tables(admin):
    _, api, outlet = admin
    t = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '1'}, format='json').data
    cashier = add_cashier(api)
    assert cashier.get(f'{POS}/tables/by_restaurant/', {'restaurant_id': outlet['id']}).status_code == 200
    assert cashier.patch(f"{POS}/tables/{t['id']}/update_status/", {'status': 'occupied'}, format='json').status_code == 200
    r = cashier.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '2'}, format='json')
    assert r.status_code == 403 and r.data['permission'] == 'settings.manage'


def test_staff_only_see_their_restaurants(admin):
    _, api, outlet = admin
    other = api.post(f'{POS}/restaurants/', {'name': 'Terrace'}, format='json').data
    r = api.post('/api/auth/users/', {'login_id': 'sg_t_cash', 'role': 'cashier', 'password': 'Cashier-pass-1',
                                      'outlet_ids': [other['id']]}, format='json')
    assert r.status_code == 201, r.data
    cashier, _ = sign_in('sg_t_cash', 'Cashier-pass-1')
    assert [o['name'] for o in cashier.get(f'{POS}/restaurants/').data] == ['Terrace']
    assert cashier.get(f'{POS}/tables/by_restaurant/', {'restaurant_id': outlet['id']}).status_code == 404


def test_another_clients_tables_are_invisible(admin, make_client, mailoutbox):
    _, api, outlet = admin
    t = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '1'}, format='json').data
    make_client(name='Beans Cafe', admin_login_id='bc_admin', admin_email='a@beans.example', country='AE')
    other, _ = sign_in('bc_admin', 'Admin-pass-1', mailoutbox)
    assert other.get(f"{POS}/tables/{t['id']}/").status_code == 404
    assert other.get(f'{POS}/tables/by_restaurant/', {'restaurant_id': outlet['id']}).status_code == 404
    r = other.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '99'}, format='json')
    assert r.status_code == 400 and 'restaurant' in r.data['fields']

