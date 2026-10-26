"""Taxes, menus, categories and menu items."""
import pytest

from .conftest import sign_in

POS = '/api/pos/api'


@pytest.fixture
def setup(client_admin):
    tenant, api, _ = client_admin
    outlet = api.get(f'{POS}/restaurants/').data[0]
    taxes = {t['name']: t for t in api.get(f'{POS}/taxes/', {'restaurant_id': outlet['id']}).data['results']}
    return api, outlet, taxes


def add_category(api, outlet, **body):
    r = api.post(f'{POS}/menu-categories/', {'name': 'Mains', 'restaurant': outlet['id'], **body}, format='json')
    assert r.status_code == 201, r.data
    return r.data


def add_item(api, category, **body):
    r = api.post(f'{POS}/menu-items/', {'name': 'Paneer Tikka', 'category': category['id'], 'price': '250', **body},
                 format='json')
    assert r.status_code == 201, r.data
    return r.data


# ---- Taxes ----

def test_country_taxes_come_ready(setup):
    _, _, taxes = setup
    assert set(taxes) == {'CGST', 'SGST'}
    assert taxes['CGST']['rate'] == '2.500' and taxes['CGST']['restaurant'] is None


def test_fixed_and_percentage_taxes(setup):
    api, outlet, _ = setup
    packing = api.post(f'{POS}/taxes/', {'restaurant': outlet['id'], 'name': 'Packing', 'type': 'fixed', 'amount': '20',
                                         'fixed_basis': 'per_bill', 'channels': ['takeaway', 'delivery']}, format='json')
    assert packing.status_code == 201, packing.data
    assert (packing.data['amount'], packing.data['rate']) == ('20.00', None)
    bad = api.post(f'{POS}/taxes/', {'name': 'Cess', 'type': 'percentage', 'rate': '101'}, format='json')
    assert bad.status_code == 400 and 'rate' in bad.data['fields']
    no_basis = api.post(f'{POS}/taxes/', {'name': 'Cess', 'type': 'fixed', 'amount': '1'}, format='json')
    assert no_basis.status_code == 400 and 'fixed_basis' in no_basis.data['fields']
    dup = api.post(f'{POS}/taxes/', {'restaurant': outlet['id'], 'name': 'cgst', 'type': 'percentage', 'rate': '1'}, format='json')
    assert dup.status_code == 400 and 'name' in dup.data['fields']
    too_precise = api.post(f'{POS}/taxes/', {'name': 'Deposit', 'type': 'fixed', 'amount': '1.005', 'fixed_basis': 'per_unit'},
                           format='json')
    assert too_precise.status_code == 400 and 'amount' in too_precise.data['fields']


def test_taxes_are_switched_off_not_deleted(setup):
    api, _, taxes = setup
    tid = taxes['SGST']['id']
    assert api.delete(f'{POS}/taxes/{tid}/').status_code == 405
    assert api.patch(f'{POS}/taxes/{tid}/', {'is_active': False}, format='json').data['is_active'] is False


# ---- Categories ----

def test_first_category_creates_the_menu(setup):
    api, outlet, _ = setup
    cat = add_category(api, outlet, tax_rate='5')
    menus = api.get(f'{POS}/menus/by_restaurant/', {'restaurant_id': outlet['id']}).data
    assert len(menus) == 1 and cat['menu'] == menus[0]['id'] and cat['restaurant'] == outlet['id']
    assert cat['tax_rate'] == '5.00' and cat['tax_ids'] == [] and cat['is_available'] is True


def test_category_with_tax_list(setup):
    api, outlet, taxes = setup
    cat = add_category(api, outlet, tax_ids=[taxes['CGST']['id'], taxes['SGST']['id']])
    assert cat['tax_rate'] == '5.00'
    assert [t['name'] for t in cat['taxes']] == ['CGST', 'SGST']
    # A PATCH without tax_ids keeps them; [] clears them
    kept = api.patch(f"{POS}/menu-categories/{cat['id']}/", {'description': 'Hot'}, format='json').data
    assert kept['tax_ids'] == cat['tax_ids'] and kept['tax_rate'] == '5.00'
    cleared = api.patch(f"{POS}/menu-categories/{cat['id']}/", {'tax_ids': []}, format='json').data
    assert cleared['tax_ids'] == [] and cleared['tax_rate'] == '0.00'


def test_category_rejects_unknown_taxes_and_duplicate_names(setup):
    api, outlet, _ = setup
    add_category(api, outlet)
    r = api.post(f'{POS}/menu-categories/', {'name': 'MAINS', 'restaurant': outlet['id']}, format='json')
    assert r.status_code == 400 and 'name' in r.data['fields']
    r = api.post(f'{POS}/menu-categories/', {'name': 'Drinks', 'restaurant': outlet['id'], 'tax_ids': [99999]}, format='json')
    assert r.status_code == 400 and 'tax_ids' in r.data['fields']
    r = api.post(f'{POS}/menu-categories/', {'name': 'Drinks'}, format='json')
    assert r.status_code == 400 and 'menu' in r.data['fields']


def test_categories_list_per_restaurant(setup):
    api, outlet, _ = setup
    other = api.post(f'{POS}/restaurants/', {'name': 'Terrace'}, format='json').data
    add_category(api, outlet, name='Mains')
    add_category(api, other, name='Cocktails')
    here = api.get(f'{POS}/menu-categories/', {'restaurant_id': outlet['id']}).data['results']
    assert [c['name'] for c in here] == ['Mains'] and here[0]['product_count'] == 0


# ---- Menu items ----

def test_menu_item_shape_the_pos_reads(setup):
    api, outlet, taxes = setup
    cat = add_category(api, outlet, tax_ids=[taxes['CGST']['id'], taxes['SGST']['id']])
    item = add_item(api, cat, is_vegetarian=True, allergens='Dairy, nuts', preparation_time_minutes=15)
    assert item['price'] == '250.00' and item['formatted_price'] == '₹250.00'
    assert (item['category'], item['category_name'], item['category_tax_rate']) == (cat['id'], 'Mains', '5.00')
    assert item['dietary_tags'] == ['vegetarian'] and item['allergens'] == ['dairy', 'nuts']
    assert item['preparation_time_minutes'] == 15 and item['is_available'] is True
    listed = api.get(f'{POS}/menu-items/', {'restaurant_id': outlet['id']}).data
    assert listed['count'] == 1 and listed['results'][0]['restaurant'] == outlet['id']


def test_menu_item_validation(setup):
    api, outlet, _ = setup
    cat = add_category(api, outlet)
    add_item(api, cat)
    dup = api.post(f'{POS}/menu-items/', {'name': 'paneer tikka', 'category': cat['id'], 'price': '1'}, format='json')
    assert dup.status_code == 400 and 'name' in dup.data['fields']
    bad = api.post(f'{POS}/menu-items/', {'name': 'Naan', 'category': cat['id'], 'price': '40.123'}, format='json')
    assert bad.status_code == 400 and 'price' in bad.data['fields']
    neg = api.post(f'{POS}/menu-items/', {'name': 'Naan', 'category': cat['id'], 'price': '-1'}, format='json')
    assert neg.status_code == 400


def test_whole_menu_fits_on_the_first_page(setup):
    api, outlet, _ = setup
    cat = add_category(api, outlet)
    for i in range(60):
        add_item(api, cat, name=f'Item {i:02d}', price='10')
    data = api.get(f'{POS}/menu-items/', {'restaurant_id': outlet['id']}).data
    assert data['count'] == 60 and len(data['results']) == 60


def test_sold_out_and_delete(setup):
    api, outlet, _ = setup
    item = add_item(api, add_category(api, outlet))
    off = api.patch(f"{POS}/menu-items/{item['id']}/", {'is_available': False}, format='json').data
    assert off['is_available'] is False
    available = api.get(f'{POS}/menu-items/', {'restaurant_id': outlet['id'], 'is_available': 'true'}).data
    assert available['count'] == 0
    assert api.delete(f"{POS}/menu-items/{item['id']}/").status_code == 204
    assert api.get(f'{POS}/menu-items/', {'restaurant_id': outlet['id']}).data['count'] == 0


def test_cashier_reads_the_menu_but_cannot_edit_it(setup):
    api, outlet, _ = setup
    item = add_item(api, add_category(api, outlet))
    api.post('/api/auth/users/', {'login_id': 'sg_cash', 'role': 'cashier', 'password': 'Cashier-pass-1'}, format='json')
    cashier, _ = sign_in('sg_cash', 'Cashier-pass-1')
    assert cashier.get(f'{POS}/menu-items/', {'restaurant_id': outlet['id']}).data['count'] == 1
    r = cashier.patch(f"{POS}/menu-items/{item['id']}/", {'price': '1'}, format='json')
    assert r.status_code == 403 and r.data['permission'] == 'settings.manage'


def test_three_decimal_currency(make_client, mailoutbox):
    make_client(name='Gulf Grill', admin_login_id='gg_admin', admin_email='a@gulf.example', country='KW')
    api, _ = sign_in('gg_admin', 'Admin-pass-1', mailoutbox)
    outlet = api.get(f'{POS}/restaurants/').data[0]
    cat = add_category(api, outlet)
    item = add_item(api, cat, price='1.250')
    assert item['price'] == '1.250' and item['formatted_price'].endswith('1.250')
