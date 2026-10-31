"""Information Request Forms: Super Admin sends a link, the client fills it in and submits."""
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from console.models import PlatformAuditLog, PlatformUser
from core import tenancy

from .conftest import platform_api_for

COMPLETE = {
    'business': {'name': 'Spice Garden', 'business_type': 'restaurant', 'country': 'IN'},
    'contact': {'name': 'Ravi', 'phone': '9876543210', 'email': 'ravi@spice.example'},
    'owner': {'full_name': 'Ravi Kumar', 'login_id': 'ravi.admin', 'email': 'ravi@spice.example'},
    'outlets': [{'name': 'Indiranagar', 'address': '12 100 Ft Rd', 'city': 'Bengaluru', 'phone': '080 1234',
                 'tables': [{'number': '1', 'seats': 4, 'area': 'AC Hall'}, {'number': '2', 'seats': '2'}]}],
    'billing': {'prices_include_tax': False, 'rounding': 'nearest'},
    'taxes': [{'name': 'CGST', 'rate': 2.5}, {'name': 'SGST', 'rate': '2.5'}],
    'staff': [{'name': 'Asha', 'role': 'cashier', 'login_id': 'asha'}],
    'payments': {'methods': ['cash', 'upi']},
}


def menu_sheet(name='menu.xlsx', size=200):
    return SimpleUploadedFile(name, b'x' * size, content_type='application/vnd.ms-excel')


@pytest.fixture
def form(platform_api):
    r = platform_api.post('/api/platform/onboarding/', {'title': 'Spice Garden', 'contact_name': 'Ravi',
                                                        'contact_email': 'ravi@spice.example'}, format='json')
    assert r.status_code == 201, r.data
    return r.data


def token_of(form):
    return form['link'].rstrip('/').rsplit('/', 1)[1]


@pytest.fixture
def client_api():
    return APIClient()


def put(api, form, data, version, **headers):
    return api.put(f'/api/irf/{token_of(form)}/', {'data': data, 'version': version}, format='json', **headers)


def test_new_form_starts_with_what_we_know(form, client_api):
    assert form['status'] == 'draft'
    assert form['link'].startswith('http://testserver/irf/')
    r = client_api.get(f'/api/irf/{token_of(form)}/')
    assert r.status_code == 200
    assert r.data['data']['business']['name'] == 'Spice Garden'
    assert r.data['data']['contact']['email'] == 'ravi@spice.example'
    assert r.data['editable'] is True and r.data['editor'] == 'client'
    countries = next(f for f in r.data['schema'][0]['fields'] if f['key'] == 'country')['options']
    assert {'value': 'IN', 'label': 'India'} in countries


def test_the_page_never_leaks_its_link(form, client):
    r = client.get(f'/irf/{token_of(form)}/')
    assert r.status_code == 200 and b'Restaurant Setup Form' in r.content
    assert r['Referrer-Policy'] == 'no-referrer'
    assert 'noindex' in r['X-Robots-Tag']


def test_wrong_link_is_refused(db, client_api):
    assert client_api.get('/api/irf/not-a-real-token/').status_code == 404


def test_saving_keeps_only_known_answers_of_the_right_type(form, client_api):
    r = put(client_api, form, {
        'business': {'name': ' Spice Garden ', 'business_type': 'spaceship', 'outlets_count': 'two', 'hack': 1},
        'billing': {'prices_include_tax': 'yes', 'service_charge_percent': '7.5'},
        'outlets': [{'name': 'MG Road', 'cash_counters': 'Main\n\n Bar ', 'opening_time': '25:00'}, {}],
        'payments': {'methods': ['upi', 'bitcoin', 'cash']},
        'unknown_section': {'x': 1},
    }, form['version'])
    assert r.status_code == 200, r.data
    data = r.data['data']
    assert data['business']['name'] == 'Spice Garden'
    assert data['business']['business_type'] is None and data['business']['outlets_count'] is None
    assert 'hack' not in data['business'] and 'unknown_section' not in data
    assert data['billing']['prices_include_tax'] is None and data['billing']['service_charge_percent'] == 7.5
    assert len(data['outlets']) == 1  # the empty one is dropped
    assert data['outlets'][0]['cash_counters'] == ['Main', 'Bar'] and data['outlets'][0]['opening_time'] is None
    assert data['payments']['methods'] == ['cash', 'upi']
    assert r.data['version'] == form['version'] + 1


def test_an_old_copy_cannot_overwrite_newer_answers(form, client_api):
    assert put(client_api, form, COMPLETE, form['version']).status_code == 200
    r = put(client_api, form, {}, form['version'])
    assert r.status_code == 409 and r.data['code'] == 'stale_version'


def test_submit_lists_what_is_missing_and_keeps_the_answers(form, client_api):
    token = token_of(form)
    r = client_api.post(f'/api/irf/{token}/submit/', {'data': {**COMPLETE, 'owner': {'login_id': 'a b'}},
                                                      'version': form['version']}, format='json')
    assert r.status_code == 400 and r.data['code'] == 'incomplete'
    paths = {p['path']: p['message'] for p in r.data['problems']}
    assert 'owner.full_name' in paths and 'owner.email' in paths
    assert 'characters' in paths['owner.login_id']
    assert paths['menu.files'] == 'Attach a file'
    # Saved anyway: the client fixes the gaps and submits again
    assert client_api.get(f'/api/irf/{token}/').data['data']['taxes'][0]['name'] == 'CGST'


def submit_complete(client_api, form):
    token = token_of(form)
    assert client_api.post(f'/api/irf/{token}/files/', {'field': 'menu.files', 'file': menu_sheet()},
                           format='multipart').status_code == 201
    version = client_api.get(f'/api/irf/{token}/').data['version']
    return client_api.post(f'/api/irf/{token}/submit/', {'data': COMPLETE, 'version': version}, format='json')


def test_submitted_form_is_read_only_until_reopened(form, client_api, platform_api):
    r = submit_complete(client_api, form)
    assert r.status_code == 200 and r.data['status'] == 'submitted'
    token = token_of(form)
    view = client_api.get(f'/api/irf/{token}/').data
    assert view['editable'] is False
    assert put(client_api, form, COMPLETE, view['version']).status_code == 409
    assert client_api.post(f'/api/irf/{token}/files/', {'field': 'menu.files', 'file': menu_sheet()},
                           format='multipart').status_code == 409
    with tenancy.platform_scope():
        assert PlatformAuditLog.objects.filter(action='onboarding.submitted').exists()

    detail = platform_api.get(f"/api/platform/onboarding/{form['id']}/").data
    assert detail['status'] == 'submitted' and detail['problems'] == []
    assert platform_api.post(f"/api/platform/onboarding/{form['id']}/reopen/").data['status'] == 'draft'
    assert put(client_api, form, COMPLETE, view['version']).status_code == 200


def test_super_admin_edit_link_works_on_a_submitted_form(form, client_api, platform_api):
    submit_complete(client_api, form)
    r = platform_api.post(f"/api/platform/onboarding/{form['id']}/edit-link/")
    assert r.status_code == 200
    key = r.data['url'].split('#key=', 1)[1]
    view = client_api.get(f'/api/irf/{token_of(form)}/', HTTP_X_IRF_KEY=key).data
    assert view['editable'] is True and view['editor'] == 'admin'
    changed = {**COMPLETE, 'extras': {'notes': 'Filled in on the phone with Ravi'}}
    r = put(client_api, form, changed, view['version'], HTTP_X_IRF_KEY=key)
    assert r.status_code == 200
    detail = platform_api.get(f"/api/platform/onboarding/{form['id']}/").data
    assert detail['status'] == 'submitted' and detail['last_saved_by'] == 'owner@appdesko.com'
    assert detail['data']['extras']['notes'] == 'Filled in on the phone with Ravi'
    # A tampered key is refused
    assert put(client_api, form, changed, detail['version'], HTTP_X_IRF_KEY=key + 'x').status_code == 403


def test_files_are_checked(form, client_api):
    url = f'/api/irf/{token_of(form)}/files/'
    assert client_api.post(url, {'field': 'menu.files', 'file': menu_sheet('menu.exe')},
                           format='multipart').data['code'] == 'file_type'
    assert client_api.post(url, {'field': 'secret.place', 'file': menu_sheet()},
                           format='multipart').data['code'] == 'invalid_field'
    big = menu_sheet(size=10 * 1024 * 1024 + 1)
    assert client_api.post(url, {'field': 'menu.files', 'file': big}, format='multipart').data['code'] == 'file_too_large'
    # The logo keeps only the latest upload
    for name in ('a.png', 'b.png'):
        client_api.post(url, {'field': 'printing.logo', 'file': menu_sheet(name)}, format='multipart')
    files = client_api.get(f'/api/irf/{token_of(form)}/').data['files']
    assert [f['name'] for f in files if f['field'] == 'printing.logo'] == ['b.png']
    r = client_api.get(f"{url}{files[0]['id']}/")
    assert r.status_code == 200 and r.content == b'x' * 200


def test_exports_as_json_and_pdf(form, client_api, platform_api):
    submit_complete(client_api, form)
    r = platform_api.get(f"/api/platform/onboarding/{form['id']}/export.json")
    assert r.status_code == 200 and 'attachment' in r['Content-Disposition']
    body = json.loads(r.content)
    assert body['schema'] == 'deskopos.irf/1' and body['status'] == 'submitted'
    assert body['data']['outlets'][0]['tables'][1] == {'number': '2', 'seats': 2, 'area': None}
    assert body['files'][0]['name'] == 'menu.xlsx'

    pdf = platform_api.get(f"/api/platform/onboarding/{form['id']}/export.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b'%PDF')
    assert client_api.get(f'/api/irf/{token_of(form)}/pdf/').content.startswith(b'%PDF')


def test_new_link_stops_the_old_one(form, client_api, platform_api):
    new = platform_api.post(f"/api/platform/onboarding/{form['id']}/new-link/").data
    assert client_api.get(f'/api/irf/{token_of(form)}/').status_code == 404
    assert client_api.get(f'/api/irf/{token_of(new)}/').status_code == 200


def test_read_only_staff_can_look_but_not_change(form, owner):
    with tenancy.platform_scope():
        support = PlatformUser(email='support@appdesko.com', full_name='Support', role='support',
                               mfa_secret=owner.mfa_secret)
        support.set_password('support-password-1')
        support.save()
    api = platform_api_for(support, 'support-password-1')
    assert api.get('/api/platform/onboarding/').status_code == 200
    assert api.get(f"/api/platform/onboarding/{form['id']}/export.pdf").status_code == 200
    assert api.post('/api/platform/onboarding/', {'title': 'X'}, format='json').status_code == 403
    assert api.post(f"/api/platform/onboarding/{form['id']}/edit-link/").status_code == 403
