"""
Creating a restaurant from an Information Request Form (its JSON export, or the form itself).

plan() reads the answers and says what will be created and what stops it, without writing
anything; run() creates the client through provisioning.provision_tenant (so it gets the
same defaults as a client made by hand) and then applies the answers: settings, outlets,
cash counters, tables, print settings, taxes, payment methods, staff and the menu sheet.
The client starts as Pending, like every new client; activate it when they are ready.
"""
import re
import secrets
from decimal import Decimal

from django.db import transaction
from django.utils.text import slugify

from accounts.models import Role, User, UserOutlet
from catalogue.models import Category, CategoryTax, Menu, MenuCategory, Product
from core import tenancy
from core.exceptions import ApiError
from floor.models import DiningTable
from floor.views import new_qr_secret
from outlets.models import CashCounter, Outlet, PrintSettings, TenantSettings
from outlets.services import create_outlet, next_outlet_code
from payments.models import PaymentMethod
from taxes.models import Tax

from . import irf_schema, menu_sheet, provisioning
from .models import Country, OnboardingFile, OnboardingForm, PlatformAuditLog, Tenant

# Payment methods a client can tick on the form that a new client doesn't have by default
EXTRA_PAYMENT_METHODS = {
    # code: (label, kind, needs_reference, opens_drawer)
    'paytm': ('Paytm', 'wallet', True, False),
    'phonepe': ('PhonePe', 'wallet', True, False),
    'room_charge': ('Room charge', 'room_charge', False, False),
}
LOGIN_ROLES = ('administrator', 'manager', 'cashier')
PREFIX_RE = re.compile(r'^[a-z0-9]{2,12}$')
GENERAL_TAX_RE = re.compile(r'^\s*(all|every|food|all items)\b', re.I)
PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'


def temporary_password(length=12):
    """Readable, with upper, lower and digits, no look-alike characters"""
    while True:
        value = ''.join(secrets.choice(PASSWORD_CHARS) for _ in range(length))
        if any(c.isupper() for c in value) and any(c.islower() for c in value) and any(c.isdigit() for c in value):
            return value


def split_name(full):
    parts = (full or '').strip().split(None, 1)
    return (parts[0][:60] if parts else ''), (parts[1][:60] if len(parts) > 1 else '')


def form_taxes(d):
    """
    The taxes to create: exactly those on the form, plus the service charge from the billing
    rules (dine-in only when the form says so). Never the country defaults.
    """
    taxes = [{**t, 'channels': []} for t in d['taxes'] if t.get('name') and t.get('rate') is not None]
    percent = d['billing'].get('service_charge_percent')
    listed = any('service' in t['name'].lower() for t in taxes)
    if percent and not listed:
        dine_in = d['billing'].get('service_charge_dine_in_only') is True
        taxes.append({'name': 'Service charge', 'rate': percent, 'applies_to': None,
                      'channels': ['dine_in'] if dine_in else []})
    return taxes


def is_general_tax(tax):
    """A tax for every item (CGST on all food), as opposed to one for some items (VAT on liquor)"""
    return not tax.get('applies_to') or bool(GENERAL_TAX_RE.match(tax['applies_to']))


class Plan:
    """What an import will create. `problems` stop it; `warnings` are for the person importing to follow up."""

    def __init__(self, data, form):
        self.data, self.form = data, form
        self.problems, self.warnings = [], []
        self.people, self.taxes, self.menu = [], [], None
        self.country = None

    def problem(self, message):
        self.problems.append(message)

    def summary(self):
        d = self.data
        return {
            'form_id': self.form.id if self.form else None,
            'business': {'name': d['business'].get('name'), 'type': d['business'].get('business_type'),
                         'country': self.country.name if self.country else d['business'].get('country'),
                         'currency': self.country.default_currency_id if self.country else None},
            'outlets': [{'name': o.get('name'), 'tables': len(o.get('tables') or []),
                         'cash_counters': len(o.get('cash_counters') or []) or 1} for o in d['outlets']],
            'taxes': [{'name': t['name'], 'rate': t.get('rate'), 'every_item': is_general_tax(t),
                       'dine_in_only': t.get('channels') == ['dine_in']} for t in self.taxes],
            'people': [{k: p[k] for k in ('name', 'role', 'login_id', 'generated', 'can_login')} for p in self.people],
            'payment_methods': self.payment_codes(),
            'menu': None if self.menu is None else {
                'file': self.menu.get('file'), 'items': len(self.menu.get('items', [])),
                'categories': len(self.menu.get('categories', [])), 'problems': self.menu.get('problems', []),
                'error': self.menu.get('error')},
            'problems': self.problems,
            'warnings': self.warnings,
        }

    def payment_codes(self):
        chosen = self.data['payments'].get('methods') or []
        defaults = [code for code, *_ in provisioning.DEFAULT_PAYMENT_METHODS]
        return chosen or defaults


def read_payload(body):
    """(answers, linked form) from {'payload': <exported JSON>} or {'form_id': n}."""
    form = None
    if body.get('form_id'):
        form = OnboardingForm.objects.filter(id=body['form_id']).first()
        if form is None:
            raise ApiError('No such onboarding form.', code='not_found', status_code=404)
        raw = form.data
    else:
        payload = body.get('payload')
        if not isinstance(payload, dict) or payload.get('schema') != irf_schema.SCHEMA_ID:
            raise ApiError('This is not an onboarding form export. Choose the JSON downloaded from an onboarding form.',
                           code='invalid_payload')
        raw = payload.get('data')
        if payload.get('form_id'):
            form = OnboardingForm.objects.filter(id=payload['form_id']).first()
    from .onboarding import options
    return irf_schema.clean(raw, options()), form


def _login_base(name, prefix):
    first = slugify(split_name(name)[0]).replace('-', '') or 'user'
    return f'{prefix}_{first}'[:50] if prefix else first[:50]


def _people(plan, prefix):
    """The Administrator and staff, each with a login ID (made up when not given) and whether it is usable."""
    d = plan.data
    owner = d['owner']
    wanted = [{'name': owner.get('full_name') or '', 'role': 'administrator', 'login_id': owner.get('login_id'),
               'email': owner.get('email'), 'phone': owner.get('phone'), 'outlet': None, 'owner': True}]
    for s in d['staff']:
        if s.get('name') and s.get('role'):
            wanted.append({'name': s['name'], 'role': s['role'], 'login_id': s.get('login_id'), 'email': s.get('email'),
                           'phone': s.get('phone'), 'outlet': s.get('outlet'), 'owner': False})
        elif s.get('name') or s.get('login_id'):
            plan.warnings.append(f'Staff "{s.get("name") or s.get("login_id")}" has no name or role and is left out.')

    used, emails = set(), set()
    for p in wanted:
        p['can_login'] = p['role'] in LOGIN_ROLES
        login = (p['login_id'] or '').strip()
        p['generated'] = not login
        if login:
            if not irf_schema.LOGIN_ID_RE.match(login):
                plan.problem(f'Login ID "{login}" for {p["name"]}: {irf_schema.LOGIN_ID_HELP}')
            elif login.lower() in used:
                plan.problem(f'Login ID "{login}" is given to more than one person.')
            elif provisioning.login_id_taken(login):
                plan.problem(f'Login ID "{login}" for {p["name"]} is already used by another client. '
                             'Login IDs are unique across all clients; change it on the form.')
        else:
            base, n = _login_base(p['name'], prefix), 1
            login = base if len(base) >= 3 else f'{base}_user'
            while login.lower() in used or provisioning.login_id_taken(login):
                n += 1
                login = f'{base}{n}'
        p['login_id'] = login
        used.add(login.lower())
        email = (p['email'] or '').lower()
        if email and email in emails:
            plan.warnings.append(f'{p["name"]} has the same email as someone above; their email is left empty.')
            p['email'] = None
        elif email:
            emails.add(email)
        if p['role'] in ('administrator', 'manager') and not p['email']:
            plan.warnings.append(f'{p["name"]} ({p["role"]}) has no email. Add one if the emailed sign-in code is turned on.')
    plan.people = wanted


def _menu_files(form):
    if form is None:
        return []
    return list(OnboardingFile.objects.filter(form=form, field='menu.files').order_by('id'))


def _read_menu(plan):
    files = _menu_files(plan.form)
    readable = [f for f in files if f.name.lower().endswith(('.xlsx', '.csv'))]
    if not files:
        plan.menu = {'error': 'No menu file' + ('' if plan.form else ' (the JSON has no linked form)') +
                     '. Add the menu in Product Management after creating the restaurant.'}
        return
    if not readable:
        plan.menu = {'file': ', '.join(f.name for f in files),
                     'error': 'The menu is not an .xlsx or .csv sheet, so it cannot be imported automatically. '
                              'Type it in, or import a sheet in Product Management.'}
        return
    file = readable[0]
    try:
        plan.menu = {'file': file.name, **menu_sheet.read_menu(bytes(file.content), file.name)}
    except menu_sheet.MenuSheetError as error:
        plan.menu = {'file': file.name, 'error': str(error) + ' Import the menu in Product Management instead.'}
    if len(readable) > 1:
        plan.warnings.append(f'Only {file.name} is imported; import the other menu files in Product Management.')


def plan_import(body):
    data, form = read_payload(body)
    plan = Plan(data, form)
    d = data
    if form and form.tenant_id:
        plan.problem(f'This form was already used to create client {form.tenant_id}.')

    prefix = (body.get('login_prefix') or '').strip().lower()
    if prefix and not PREFIX_RE.match(prefix):
        plan.problem('Login prefix: 2-12 lowercase letters or numbers.')
    elif prefix and Tenant.objects.filter(login_prefix=prefix).exists():
        plan.problem(f'Login prefix "{prefix}" is used by another client.')

    for path, label in (('business.name', 'Business name'), ('business.business_type', 'Type of business'),
                        ('business.country', 'Country'), ('owner.full_name', 'Administrator name'),
                        ('owner.login_id', 'Administrator login ID'), ('owner.email', 'Administrator email')):
        section, field = path.split('.')
        if not d[section].get(field):
            plan.problem(f'{label} is missing.')
    plan.country = Country.objects.filter(code=d['business'].get('country')).first()
    if not d['outlets']:
        plan.problem('Add at least one outlet.')
    names = [(o.get('name') or '').strip().lower() for o in d['outlets']]
    for i, outlet in enumerate(d['outlets'], start=1):
        if not outlet.get('name'):
            plan.problem(f'Outlet {i} has no name.')
        elif names.count(outlet['name'].strip().lower()) > 1:
            plan.problem(f'Two outlets are called "{outlet["name"]}".')
        numbers = [str(t.get('number') or '').strip().lower() for t in outlet.get('tables') or []]
        repeated = sorted({n for n in numbers if n and numbers.count(n) > 1})
        if repeated:
            plan.problem(f'{outlet.get("name") or f"Outlet {i}"}: table {", ".join(repeated)} is listed twice.')
        if any(not n for n in numbers):
            plan.warnings.append(f'{outlet.get("name") or f"Outlet {i}"}: tables without a number are left out.')

    plan.taxes = form_taxes(d)
    if not plan.taxes:
        plan.warnings.append('No taxes on the form, so the restaurant starts without any. Add them in Settings if needed.')
    specific = [t['name'] for t in plan.taxes if not is_general_tax(t)]
    if specific:
        plan.warnings.append(f'{", ".join(specific)} apply only to some items, so they are not added to any menu '
                             'category. Add them to the right categories in Product Management.')
    if d['menu'].get('category_taxes'):
        plan.warnings.append(f'Taxes by category on the form: "{d["menu"]["category_taxes"]}". Check the '
                             'categories in Product Management.')

    _people(plan, prefix or None)
    _read_menu(plan)

    not_applied = []
    if d['menu'].get('timed_menus'):
        not_applied.append('menus served at certain times')
    if d['printing'].get('bill_header'):
        not_applied.append('bill header text')
    if d['extras'].get('delivery_platforms'):
        not_applied.append('delivery platforms')
    if not_applied:
        plan.warnings.append(f'Set up by hand: {", ".join(not_applied)}. They are saved with the client\'s settings '
                             'for reference.')
    if len(d['outlets']) > 1 and plan.menu and plan.menu.get('items'):
        plan.warnings.append('The same menu is added to every outlet.')
    return plan


# ---- Creating -------------------------------------------------------------------------------

def _settings(tenant, d, form):
    s = TenantSettings.objects.get()
    billing = d['billing']
    if billing.get('prices_include_tax') is not None:
        s.prices_include_tax = billing['prices_include_tax']
    if billing.get('rounding'):
        s.rounding_mode = billing['rounding']
    if billing.get('fiscal_year_start'):
        s.fiscal_year_start = int(billing['fiscal_year_start'])
    if billing.get('cashier_discount_limit') is not None:
        s.cashier_discount_limit = Decimal(str(billing['cashier_discount_limit']))
    prefix = re.sub(r'[^A-Za-z0-9-]', '', billing.get('invoice_prefix') or '')[:12]
    if prefix:
        s.invoice_format = f'{prefix}/{{fy}}/{{seq:06}}'
    s.settings = {**s.settings, 'onboarding': {
        'form_id': form.id if form else None,
        'legal_name': d['business'].get('legal_name'),
        'service_charge_percent': billing.get('service_charge_percent'),
        'service_charge_dine_in_only': billing.get('service_charge_dine_in_only'),
        'tips': d['payments'].get('tips'), 'tips_notes': d['payments'].get('tips_notes'),
        'timed_menus': d['menu'].get('timed_menus'), 'delivery_platforms': d['extras'].get('delivery_platforms'),
        'devices': {'tablets': d['printing'].get('tablets'), 'laptops': d['printing'].get('laptops')},
        'bill_header': d['printing'].get('bill_header'), 'go_live': d['extras'].get('go_live'),
        'notes': d['extras'].get('notes'), 'existing_data': d['extras'].get('existing_data'),
    }}
    s.save()


def _outlet(outlet, answers, d, country, business_name, index):
    """Fill an outlet from its answers: address, licences, hours, counters, tables and print settings."""
    state = answers.get('state') or ''
    outlet.name = answers['name']
    outlet.address = answers.get('address') or ''
    if state and len(state) > 3:
        outlet.address = f'{outlet.address}\n{state}'.strip()
    outlet.state_code = state if len(state) <= 3 else ''
    outlet.city = answers.get('city') or ''
    outlet.postal_code = answers.get('postal_code') or ''
    outlet.phone = answers.get('phone') or ''
    outlet.email = answers.get('email') or ''
    outlet.tax_reg_number = answers.get('tax_number') or ''
    if answers.get('fssai'):
        outlet.licence_label, outlet.licence_number = 'FSSAI', answers['fssai']
    if answers.get('day_close_time'):
        outlet.day_close_time = answers['day_close_time']
    outlet.opening_hours = {k: answers.get(k) for k in ('opening_time', 'closing_time', 'weekly_off') if answers.get(k)}
    outlet.capacity = answers.get('seating_capacity')
    outlet.sort_order = index
    outlet.settings = {**outlet.settings, 'qr_ordering': answers.get('qr_ordering'),
                       'other_licences': answers.get('other_licences')}
    outlet.save()

    counters = answers.get('cash_counters') or []
    if counters:
        first = CashCounter.objects.filter(outlet=outlet).order_by('id').first()
        first.name = counters[0][:60]
        first.save(update_fields=['name'])
        for i, name in enumerate(counters[1:], start=1):
            CashCounter.objects.create(outlet=outlet, name=name[:60], sort_order=i)

    qr = answers.get('qr_ordering') is not False
    for i, table in enumerate(t for t in (answers.get('tables') or []) if t.get('number')):
        seats = table.get('seats')
        DiningTable.objects.create(
            outlet=outlet, table_number=str(table['number'])[:20], capacity=seats if seats and 0 < seats < 1000 else 4,
            location=table.get('area') or '', sort_order=i, qr_enabled=qr, qr_secret=new_qr_secret())

    p = d['printing']
    prints = PrintSettings.objects.get(outlet=outlet)
    address = ', '.join(x for x in (answers.get('address', '').replace('\n', ', '), answers.get('city'),
                                    answers.get('postal_code')) if x)
    prints.header = {**prints.header, 'name': business_name, 'address': address, 'phone': answers.get('phone') or '',
                     'taxId': answers.get('tax_number') or '', 'taxIdLabel': country.tax_id_label,
                     'licenceLabel': 'FSSAI' if answers.get('fssai') else '', 'licence': answers.get('fssai') or ''}
    for field in ('bill_format', 'kot_format'):
        if p.get(field):
            setattr(prints, field, p[field])
    if p.get('kot_copies'):
        prints.kot_copies = p['kot_copies']
    if p.get('auto_print_bill') is not None:
        prints.auto_print_bill = p['auto_print_bill']
    if p.get('bill_footer'):
        prints.footer = p['bill_footer']
        prints.header['footer'] = p['bill_footer']
    prints.save()


def _taxes(plan):
    """Only the form's taxes; returns those that apply to every item (they go on every menu category)."""
    Tax.objects.all().delete()  # the country defaults provisioning made a moment ago; nothing uses them yet
    made = [(Tax.objects.create(name=t['name'], type='percentage', rate=Decimal(str(t['rate'])), sequence=i,
                                channels=t['channels']), t)
            for i, t in enumerate(plan.taxes)]
    return [tax for tax, answers in made if is_general_tax(answers)]


def _payments(plan, tenant):
    chosen = plan.data['payments'].get('methods') or []
    if not chosen:
        return
    PaymentMethod.objects.exclude(code__in=chosen).update(is_active=False)
    order = {code: (i + 1) * 10 for i, code in enumerate(chosen)}
    for method in PaymentMethod.objects.all():
        method.sort_order = order.get(method.code, method.sort_order)
        method.save(update_fields=['sort_order'])
    for code in chosen:
        if code in EXTRA_PAYMENT_METHODS and not PaymentMethod.objects.filter(code=code).exists():
            label, kind, ref, drawer = EXTRA_PAYMENT_METHODS[code]
            PaymentMethod.objects.create(code=code, label=label, kind=kind, needs_reference=ref, opens_drawer=drawer,
                                         sort_order=order[code])


def _people_rows(plan, outlets_by_name):
    """The users; returns their sign-in details (temporary passwords are shown once, then only hashes remain)."""
    roles = {r.key: r for r in Role.objects.all()}
    credentials = []
    for p in plan.people:
        first, last = split_name(p['name'])
        password = temporary_password() if p['can_login'] else None
        if p['owner']:
            user = User.objects.get(role__key='administrator')
            user.username = p['login_id']
            user.first_name, user.last_name = first, last
            user.phone = (p['phone'] or '')[:20]
            user.email = p['email'] or None
        else:
            user = User(username=p['login_id'], first_name=first, last_name=last, phone=(p['phone'] or '')[:20],
                        email=p['email'] or None, role=roles[p['role']], must_change_password=True)
        if password:
            user.set_password(password)
        else:
            user.password_hash = None
        user.save()
        outlet = outlets_by_name.get((p['outlet'] or '').strip().lower())
        if outlet is not None:
            UserOutlet.objects.create(user=user, outlet=outlet)
        elif p['outlet'] and len(outlets_by_name) > 1:
            plan.warnings.append(f'{p["name"]}: no outlet called "{p["outlet"]}", so they can work in every outlet.')
        credentials.append({'name': p['name'], 'role': p['role'], 'login_id': p['login_id'], 'password': password,
                            'generated': p['generated']})
    return credentials


def _menu(plan, tenant, general_taxes):
    items = (plan.menu or {}).get('items') or []
    if not items:
        return 0
    menus = list(Menu.objects.all())
    rate = sum((t.rate for t in general_taxes), Decimal(0))
    categories = {}
    for i, name in enumerate(plan.menu['categories']):
        category = Category.objects.create(name=name, sort_order=i, uses_tax_list=True, tax_rate=rate)
        CategoryTax.objects.bulk_create([CategoryTax(category=category, tax=t, tenant_id=tenant.id) for t in general_taxes])
        MenuCategory.objects.bulk_create([MenuCategory(menu=m, category=category, sort_order=i, tenant_id=tenant.id)
                                          for m in menus])
        categories[name.lower()] = category
    Product.objects.bulk_create([Product(
        tenant_id=tenant.id, category=categories[item['category'].lower()], name=item['name'], price=item['price'],
        short_name=item.get('short_name', ''), description=item.get('description', ''),
        is_vegetarian=item.get('vegetarian', False), is_vegan=item.get('vegan', False),
        is_gluten_free=item.get('gluten_free', False), is_spicy=item.get('spicy', False),
        allergens=item.get('allergens', []), calories=item.get('calories'),
        preparation_minutes=item.get('prep_minutes'), kitchen_notes=item.get('kitchen_notes', ''),
        is_available=item.get('available', True), sort_order=item.get('sort_order', i),
    ) for i, item in enumerate(items)])
    return len(items)


@transaction.atomic
def run_import(body, *, created_by, ip=None):
    plan = plan_import(body)
    if plan.problems:
        raise ApiError('The restaurant cannot be created yet.', code='import_problems', problems=plan.problems)
    d = plan.data
    owner = next(p for p in plan.people if p['owner'])
    form = OnboardingForm.objects.select_for_update().get(id=plan.form.id) if plan.form else None
    if form and form.tenant_id:
        raise ApiError(f'This form was already used to create client {form.tenant_id}.', code='already_imported',
                       status_code=409)

    tenant = provisioning.provision_tenant(
        name=d['business']['name'], business_type=d['business']['business_type'], country_code=d['business']['country'],
        outlet_name=d['outlets'][0]['name'], admin_login_id=owner['login_id'], admin_password=temporary_password(),
        admin_email=owner['email'], plan_code=body.get('plan') or None, timezone_name=d['business'].get('timezone'),
        login_prefix=(body.get('login_prefix') or '').strip().lower() or None,
        contact={'contact_name': d['contact'].get('name') or '', 'contact_email': d['contact'].get('email') or '',
                 'contact_phone': d['contact'].get('phone') or '',
                 'tax_reg_number': d['outlets'][0].get('tax_number') or ''},
        created_by=created_by, ip=ip)
    # Apply the answers as the new client: Row Level Security keeps every query and change below
    # to its rows (Super Admin access would see, and change, every client's settings, taxes...)
    tenancy.act_as_client(tenant.id)
    try:
        _settings(tenant, d, form)
        main = Outlet.objects.get()
        outlets = []
        for i, answers in enumerate(d['outlets']):
            outlet = main if i == 0 else create_outlet(
                code=next_outlet_code(), name=answers['name'], type=main.type, tax_id_label=plan.country.tax_id_label)
            _outlet(outlet, answers, d, plan.country, d['business']['name'], i)
            outlets.append(outlet)
        general_taxes = _taxes(plan)
        _payments(plan, tenant)
        credentials = _people_rows(plan, {o.name.strip().lower(): o for o in outlets})
        items = _menu(plan, tenant, general_taxes)
    finally:
        tenancy.act_as_platform()

    if form:
        form.tenant = tenant
        form.save(update_fields=['tenant', 'updated_at'])
    PlatformAuditLog.objects.create(
        platform_user=created_by, tenant=tenant, action='onboarding.import', ip_address=ip,
        details={'form': form.id if form else None, 'outlets': len(outlets), 'users': len(credentials),
                 'menu_items': items})
    return tenant, credentials, plan
