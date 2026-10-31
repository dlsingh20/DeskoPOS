"""Creating a restaurant from an onboarding form or its JSON export."""
import io
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.models import User, UserOutlet
from catalogue.models import Category, MenuCategory, Product
from console import menu_sheet
from console.models import OnboardingForm
from core import tenancy
from floor.models import DiningTable
from outlets.models import CashCounter, Outlet, PrintSettings, TenantSettings
from payments.models import PaymentMethod
from taxes.models import Tax

from .conftest import sign_in
from .test_onboarding import COMPLETE, token_of

ANSWERS = {
    **COMPLETE,
    'business': {**COMPLETE['business'], 'legal_name': 'Spice Garden Hospitality Pvt Ltd'},
    'outlets': [
        {**COMPLETE['outlets'][0], 'state': 'Karnataka', 'tax_number': '29ABCDE1234F1Z5', 'fssai': '11223344556677',
         'day_close_time': '05:00', 'qr_ordering': False, 'cash_counters': ['Main', 'Bar']},
        {'name': 'Koramangala', 'address': '5 80 Ft Rd', 'city': 'Bengaluru', 'phone': '080 9999',
         'tables': [{'number': 'T1', 'seats': 6}]},
    ],
    'billing': {'prices_include_tax': True, 'rounding': 'up', 'fiscal_year_start': '4', 'invoice_prefix': 'SG',
                'cashier_discount_limit': 5, 'service_charge_percent': 5},
    'taxes': [{'name': 'CGST', 'rate': 2.5, 'applies_to': 'All food'}, {'name': 'SGST', 'rate': 2.5},
              {'name': 'VAT', 'rate': 20, 'applies_to': 'Liquor only'}],
    'staff': [{'name': 'Asha Rao', 'role': 'cashier', 'login_id': 'asha.sg', 'outlet': 'koramangala'},
              {'name': 'Vikram', 'role': 'waiter'},
              {'name': 'Meera Shah', 'role': 'manager', 'email': 'meera@spice.example'}],
    'payments': {'methods': ['cash', 'upi', 'paytm']},
    'printing': {'bill_format': 'thermal58', 'kot_copies': 2, 'bill_footer': 'Come again!'},
}


def menu_xlsx():
    book = Workbook()
    sheet = book.active
    sheet.title = 'Menu'
    sheet.append(['Spice Garden menu'])  # a title row above the header
    sheet.append(['Item Name', 'Category', 'Rate', 'Veg/Non-veg', 'Description'])
    sheet.append(['Paneer Tikka', 'Starters', '₹ 280', 'Veg', 'Smoky'])
    sheet.append(['Chicken 65', 'Starters', 320, 'Non-veg', None])
    sheet.append(['Dal Makhani', 'Mains', '1,050.00', 'veg', None])
    sheet.append(['Chef special', 'Mains', 'Ask', None, None])
    drinks = book.create_sheet('Drinks')  # no category column: headings and the sheet name
    drinks.append(['Name', 'Price'])
    drinks.append(['HOT DRINKS', None])
    drinks.append(['Masala Chai', 40])
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


@pytest.fixture
def submitted_form(platform_api):
    form = platform_api.post('/api/platform/onboarding/', {'title': 'Spice Garden'}, format='json').data
    client = APIClient()
    token = token_of(form)
    client.post(f'/api/irf/{token}/files/', {'field': 'menu.files', 'file': SimpleUploadedFile('menu.xlsx', menu_xlsx())},
                format='multipart')
    version = client.get(f'/api/irf/{token}/').data['version']
    r = client.post(f'/api/irf/{token}/submit/', {'data': ANSWERS, 'version': version}, format='json')
    assert r.status_code == 200, r.data
    return form


def test_menu_sheet_reader_finds_columns_headings_and_sheet_names():
    menu = menu_sheet.read_menu(menu_xlsx(), 'menu.xlsx')
    names = [(i['name'], i['category'], str(i['price']), i.get('vegetarian')) for i in menu['items']]
    assert names == [('Paneer Tikka', 'Starters', '280.00', True), ('Chicken 65', 'Starters', '320.00', False),
                     ('Dal Makhani', 'Mains', '1050.00', True), ('Masala Chai', 'Hot Drinks', '40.00', None)]
    assert menu['categories'] == ['Starters', 'Mains', 'Hot Drinks']
    assert menu['problems'] == ['Menu row 6: "Chef special" has no usable price']
    csv = menu_sheet.read_menu(b'Dish,Price,Section\nIdli,60,Breakfast\n', 'menu.csv')
    assert csv['items'][0] == {'name': 'Idli', 'category': 'Breakfast', 'price': csv['items'][0]['price']}
    with pytest.raises(menu_sheet.MenuSheetError):
        menu_sheet.read_menu(b'just,some\nwords,here\n', 'menu.csv')


def test_preview_says_what_will_be_made_and_writes_nothing(submitted_form, platform_api):
    r = platform_api.post('/api/platform/onboarding/import/preview/', {'form_id': submitted_form['id']}, format='json')
    assert r.status_code == 200, r.data
    assert r.data['problems'] == []
    assert r.data['outlets'] == [{'name': 'Indiranagar', 'tables': 2, 'cash_counters': 2},
                                 {'name': 'Koramangala', 'tables': 1, 'cash_counters': 1}]
    assert r.data['menu']['items'] == 4 and r.data['menu']['categories'] == 3
    people = {p['name']: p for p in r.data['people']}
    assert people['Ravi Kumar']['login_id'] == 'ravi.admin' and not people['Ravi Kumar']['generated']
    assert people['Vikram']['generated'] and not people['Vikram']['can_login']
    warnings = ' '.join(r.data['warnings'])
    assert 'VAT apply only to some items' in warnings and 'service charge' not in warnings
    assert [(t['name'], t['rate'], t['dine_in_only']) for t in r.data['taxes']] == [
        ('CGST', 2.5, False), ('SGST', 2.5, False), ('VAT', 20, False), ('Service charge', 5, False)]
    with tenancy.platform_scope():
        assert OnboardingForm.objects.get(id=submitted_form['id']).tenant_id is None


def test_create_restaurant_from_a_form(submitted_form, platform_api, mailoutbox, make_client):
    other = make_client(name='Other Cafe', admin_login_id='oc_admin')  # another client's rows must stay untouched
    r = platform_api.post('/api/platform/onboarding/import/', {'form_id': submitted_form['id'], 'plan': 'growth'},
                          format='json')
    assert r.status_code == 201, r.data
    tenant = r.data['tenant']
    assert tenant['name'] == 'Spice Garden' and tenant['status'] == 'pending'
    creds = {c['login_id']: c for c in r.data['credentials']}
    assert set(creds) == {'ravi.admin', 'asha.sg', 'vikram', 'meera'}
    assert creds['vikram']['password'] is None and len(creds['asha.sg']['password']) == 12

    with tenancy.client_scope(tenant['id']):
        s = TenantSettings.objects.get()
        assert (s.prices_include_tax, s.rounding_mode, s.cashier_discount_limit) == (True, 'up', 5)
        assert s.invoice_format == 'SG/{fy}/{seq:06}' and s.settings['onboarding']['service_charge_percent'] == 5
        main, second = Outlet.objects.order_by('sort_order')
        assert (main.code, main.name, main.city, main.licence_number) == ('MAIN', 'Indiranagar', 'Bengaluru', '11223344556677')
        assert 'Karnataka' in main.address and str(main.day_close_time) == '05:00:00'
        assert second.code == 'O2' and second.name == 'Koramangala'
        assert list(CashCounter.objects.filter(outlet=main).values_list('name', flat=True)) == ['Main', 'Bar']
        tables = list(DiningTable.objects.filter(outlet=main).values_list('table_number', 'capacity', 'location', 'qr_enabled'))
        assert tables == [('1', 4, 'AC Hall', False), ('2', 2, '', False)]
        prints = PrintSettings.objects.get(outlet=main)
        assert prints.header['name'] == 'Spice Garden' and prints.header['taxId'] == '29ABCDE1234F1Z5'
        assert (prints.bill_format, prints.kot_copies, prints.footer) == ('thermal58', 2, 'Come again!')
        assert list(Tax.objects.order_by('sequence').values_list('name', flat=True)) == ['CGST', 'SGST', 'VAT', 'Service charge']
        active = set(PaymentMethod.objects.filter(is_active=True).values_list('code', flat=True))
        assert active == {'cash', 'upi', 'paytm'}

        starters = Category.objects.get(name='Starters')
        assert sorted(t.tax.name for t in starters.tax_links.all()) == ['CGST', 'SGST', 'Service charge']  # not the liquor VAT
        assert MenuCategory.objects.filter(category=starters).count() == 2  # on both outlets' menus
        assert Product.objects.get(name='Dal Makhani').price == 1050
        assert Product.objects.count() == 4

        admin = User.objects.get(username='ravi.admin')
        assert (admin.first_name, admin.last_name, admin.role.key) == ('Ravi', 'Kumar', 'administrator')
        assert User.objects.get(username='vikram').password_hash is None
        asha = User.objects.get(username='asha.sg')
        assert [link.outlet.name for link in UserOutlet.objects.filter(user=asha)] == ['Koramangala']

    with tenancy.platform_scope(other['id']):
        assert sorted(Tax.objects.filter(tenant_id=other['id']).values_list('name', flat=True)) == ['CGST', 'SGST']
        assert PaymentMethod.objects.filter(tenant_id=other['id'], is_active=True).count() == 4
        assert Outlet.objects.filter(tenant_id=other['id']).count() == 1
    with tenancy.platform_scope():
        assert OnboardingForm.objects.get(id=submitted_form['id']).tenant_id == tenant['id']
    # The same form can't make a second restaurant
    again = platform_api.post('/api/platform/onboarding/import/', {'form_id': submitted_form['id']}, format='json')
    assert again.status_code == 400 and 'already used' in again.data['problems'][0]

    # Activated, the cashier signs in with the temporary password
    platform_api.post(f"/api/platform/tenants/{tenant['id']}/activate/", {}, format='json')
    _, tokens = sign_in('asha.sg', creds['asha.sg']['password'], mailoutbox)
    assert tokens['user']['must_change_password'] is True


def test_import_from_the_json_export(submitted_form, platform_api):
    export = json.loads(platform_api.get(f"/api/platform/onboarding/{submitted_form['id']}/export.json").content)
    export['data']['business']['name'] = 'Spice Garden (edited)'  # reviewed and changed offline
    r = platform_api.post('/api/platform/onboarding/import/', {'payload': export}, format='json')
    assert r.status_code == 201, r.data
    assert r.data['tenant']['name'] == 'Spice Garden (edited)'
    assert r.data['summary']['menu']['items'] == 4  # the menu file comes from the linked form


def test_import_refuses_what_it_cannot_create(platform_api, make_client):
    make_client(admin_login_id='ravi.admin')
    bad = {'schema': 'deskopos.irf/1', 'data': {**ANSWERS, 'outlets': [
        {'name': 'A', 'tables': [{'number': '1'}, {'number': '1'}]}]}}
    r = platform_api.post('/api/platform/onboarding/import/preview/', {'payload': bad}, format='json')
    problems = ' '.join(r.data['problems'])
    assert 'ravi.admin' in problems and 'already used' in problems
    assert 'table 1 is listed twice' in problems
    assert 'menu file' in r.data['menu']['error'].lower()
    assert platform_api.post('/api/platform/onboarding/import/', {'payload': bad}, format='json').status_code == 400
    assert platform_api.post('/api/platform/onboarding/import/preview/', {'payload': {'x': 1}},
                             format='json').data['code'] == 'invalid_payload'


def only_the_form_taxes(platform_api, taxes, billing):
    data = {**ANSWERS, 'staff': [], 'taxes': taxes, 'billing': billing,
            'owner': {**ANSWERS['owner'], 'login_id': 'tax.owner'}}
    r = platform_api.post('/api/platform/onboarding/import/', {'payload': {'schema': 'deskopos.irf/1', 'data': data}},
                          format='json')
    assert r.status_code == 201, r.data
    with tenancy.client_scope(r.data['tenant']['id']):
        return list(Tax.objects.order_by('sequence').values_list('name', 'rate', 'channels')), r.data['summary']


def test_no_country_default_taxes_only_the_forms(platform_api):
    taxes, _ = only_the_form_taxes(platform_api, [{'name': 'VAT', 'rate': 7}],
                                   {'service_charge_percent': 10, 'service_charge_dine_in_only': True})
    assert taxes == [('VAT', 7, []), ('Service charge', 10, ['dine_in'])]  # no CGST / SGST


def test_no_taxes_on_the_form_means_none(platform_api):
    taxes, summary = only_the_form_taxes(platform_api, [], {})
    assert taxes == []
    assert any('starts without any' in w for w in summary['warnings'])


def test_service_charge_listed_as_a_tax_is_not_added_twice(platform_api):
    taxes, _ = only_the_form_taxes(platform_api, [{'name': 'Service Charge', 'rate': 10}], {'service_charge_percent': 10})
    assert [t[0] for t in taxes] == ['Service Charge']
