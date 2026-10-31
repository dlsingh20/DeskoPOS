"""
The Information Request Form (IRF): what a new client tells us to set up their restaurant.

One definition drives everything: the client's form page renders from it, the server cleans
and checks answers against it, and the PDF is laid out from it. The answers are stored as
JSON shaped like the sections below ({section: {field: value}} or {section: [{...}, ...]}).

Field types: text, email, tel, number, textarea, select, yesno, multi (several options),
lines (one entry per line -> list), time (HH:MM), date (YYYY-MM-DD), list (rows of fields),
file (uploads, stored apart from the JSON).
"""
import re

SCHEMA_ID = 'deskopos.irf/1'

LOGIN_ID_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$')
LOGIN_ID_HELP = '3-60 characters: letters, numbers, dot, dash or underscore.'

BUSINESS_TYPES = [
    ('restaurant', 'Restaurant'), ('cafe', 'Cafe'), ('bar', 'Bar / Pub'), ('qsr', 'Quick service (QSR)'),
    ('bakery', 'Bakery'), ('food_court', 'Food court'), ('cloud_kitchen', 'Cloud kitchen'),
    ('hotel_fnb', 'Hotel F&B'), ('other', 'Other'),
]
ROLES = [('administrator', 'Administrator'), ('manager', 'Manager'), ('cashier', 'Cashier'), ('waiter', 'Waiter')]
MONTHS = [(str(i), m) for i, m in enumerate(
    ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
     'November', 'December'], start=1)]
PRINT_FORMATS = [('thermal80', 'Thermal 80 mm'), ('thermal58', 'Thermal 58 mm'), ('sheet', 'A4 / Letter sheet')]

MENU_FILE_TYPES = '.xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png'
LOGO_FILE_TYPES = '.png,.jpg,.jpeg,.svg'


def f(key, label, type='text', required=False, **extra):
    return {'key': key, 'label': label, 'type': type, 'required': required, **extra}


SECTIONS = [
    {'key': 'business', 'title': 'Business', 'fields': [
        f('name', 'Business / brand name', required=True, help='As customers know it. Printed on bills.'),
        f('legal_name', 'Registered company name', help='If different from the brand name.'),
        f('business_type', 'Type of business', 'select', required=True, options=BUSINESS_TYPES),
        f('country', 'Country', 'select', required=True, options='countries'),
        f('timezone', 'Time zone', placeholder='e.g. Asia/Kolkata',
          help="Leave blank to use your country's time zone."),
        f('outlets_count', 'Number of outlets', 'number', min=1),
    ]},
    {'key': 'contact', 'title': 'Contact person', 'help': 'Who we talk to during setup.', 'fields': [
        f('name', 'Full name', required=True),
        f('designation', 'Designation', placeholder='e.g. Owner, Manager'),
        f('phone', 'Mobile number', 'tel', required=True),
        f('email', 'Email', 'email', required=True),
    ]},
    {'key': 'owner', 'title': 'Administrator login',
     'help': "The person who manages the POS: staff, menu and settings. We send a temporary password; "
             "please don't write any password in this form.",
     'fields': [
         f('full_name', 'Full name', required=True),
         f('login_id', 'Preferred login ID', required=True, placeholder='e.g. ravi.admin', help=LOGIN_ID_HELP),
         f('email', 'Email', 'email', required=True),
         f('phone', 'Mobile number', 'tel'),
     ]},
    {'key': 'outlets', 'title': 'Outlets', 'type': 'list', 'item': 'Outlet', 'min': 1, 'max': 50,
     'help': 'Each restaurant location. Details are printed on its bills.',
     'fields': [
         f('name', 'Outlet name', required=True, placeholder='e.g. Indiranagar'),
         f('address', 'Address', 'textarea', required=True),
         f('city', 'City', required=True),
         f('state', 'State'),
         f('postal_code', 'PIN / postal code'),
         f('phone', 'Phone', 'tel', required=True),
         f('email', 'Email', 'email'),
         f('tax_number', 'GSTIN / tax registration number'),
         f('fssai', 'FSSAI licence number'),
         f('other_licences', 'Other licences', placeholder='e.g. Bar licence no.'),
         f('opening_time', 'Opens at', 'time'),
         f('closing_time', 'Closes at', 'time'),
         f('weekly_off', 'Weekly off', placeholder='e.g. None, Monday'),
         f('day_close_time', 'Business day ends at', 'time',
           help='Orders before this time count toward the previous day. Usually 04:00; later for late-night bars.'),
         f('seating_capacity', 'Seating capacity', 'number', min=0),
         f('qr_ordering', 'Customers order from a QR code on the table?', 'yesno'),
         f('cash_counters', 'Cash counters', 'lines', placeholder='Main counter',
           help='One name per line. Leave blank for one counter.'),
         f('tables', 'Tables', 'list', item='Table', max=500, range_key='number', fields=[
             f('number', 'Table no.', required=True),
             f('seats', 'Seats', 'number', min=1),
             f('area', 'Area', placeholder='e.g. AC Hall, Terrace'),
         ]),
     ]},
    {'key': 'billing', 'title': 'Billing rules', 'fields': [
        f('prices_include_tax', 'Do menu prices already include tax?', 'yesno', required=True),
        f('rounding', 'Round the bill total', 'select',
          options=[('nearest', 'To the nearest rupee'), ('up', 'Always up'), ('down', 'Always down'),
                   ('none', 'No rounding')]),
        f('service_charge_percent', 'Service charge %', 'number', min=0, max=100,
          help='Leave blank if you do not charge one.'),
        f('service_charge_dine_in_only', 'Service charge on dine-in only?', 'yesno'),
        f('fiscal_year_start', 'Financial year starts in', 'select', options=MONTHS),
        f('invoice_prefix', 'Invoice number prefix', placeholder='e.g. BLR'),
        f('cashier_discount_limit', 'Highest discount a cashier may give without a manager (%)', 'number',
          min=0, max=100),
    ]},
    {'key': 'taxes', 'title': 'Taxes', 'type': 'list', 'item': 'Tax', 'max': 30,
     'help': 'The taxes on your bills. In India GST is usually CGST + SGST; add VAT if you serve alcohol.',
     'fields': [
         f('name', 'Tax name', required=True, placeholder='e.g. CGST'),
         f('rate', 'Rate %', 'number', required=True, min=0, max=100),
         f('applies_to', 'Applies to', placeholder='e.g. All food, Liquor only'),
     ]},
    {'key': 'menu', 'title': 'Menu',
     'help': 'Attach your menu as an Excel sheet with columns: Name, Category, Price, Vegetarian (yes/no), '
             'and optionally Description, Spicy, Allergens, Prep minutes. A PDF or photo of the menu card works too.',
     'fields': [
         f('files', 'Menu files', 'file', required=True, accept=MENU_FILE_TYPES, multiple=True),
         f('category_taxes', 'Taxes by category', 'textarea',
           placeholder='e.g. Food - GST 5%\nLiquor - VAT 20%', help='Only if categories are taxed differently.'),
         f('timed_menus', 'Menus served at certain times', 'list', item='Menu', max=20, fields=[
             f('name', 'Menu', required=True, placeholder='e.g. Breakfast'),
             f('from', 'From', 'time'),
             f('until', 'Until', 'time'),
             f('days', 'Days', placeholder='e.g. Every day, Mon-Fri'),
         ]),
         f('notes', 'Anything else about the menu', 'textarea'),
     ]},
    {'key': 'staff', 'title': 'Staff', 'type': 'list', 'item': 'Staff member', 'max': 300,
     'help': 'Administrators, managers and cashiers sign in. Waiters do not sign in; they are listed so '
             'orders and tips can be credited to them.',
     'fields': [
         f('name', 'Name', required=True),
         f('role', 'Role', 'select', required=True, options=ROLES),
         f('login_id', 'Preferred login ID', help='Not needed for waiters.'),
         f('email', 'Email', 'email', help='Needed for administrators and managers.'),
         f('phone', 'Mobile number', 'tel'),
         f('outlet', 'Outlet', help='If you have more than one.'),
     ]},
    {'key': 'payments', 'title': 'Payments', 'fields': [
        f('methods', 'Payment methods you accept', 'multi', options=[
            ('cash', 'Cash'), ('card', 'Card'), ('upi', 'UPI'), ('paytm', 'Paytm'), ('phonepe', 'PhonePe'),
            ('room_charge', 'Charge to hotel room'), ('credit_pay', 'Credit (pay later)')]),
        f('tips', 'Do you record tips?', 'yesno'),
        f('tips_notes', 'How tips are shared', placeholder='e.g. To the waiter who served'),
    ]},
    {'key': 'printing', 'title': 'Printing and devices', 'fields': [
        f('bill_format', 'Bill printer', 'select', options=PRINT_FORMATS),
        f('kot_format', 'Kitchen ticket (KOT) printer', 'select', options=PRINT_FORMATS),
        f('kitchen_printer', 'Separate printer in the kitchen?', 'yesno'),
        f('kot_copies', 'KOT copies', 'number', min=1, max=5),
        f('auto_print_bill', 'Print the bill automatically when it is settled?', 'yesno'),
        f('bill_header', 'Bill header', 'textarea', placeholder='e.g. tagline, website'),
        f('bill_footer', 'Bill footer', placeholder='Thank you! Visit again.'),
        f('logo', 'Logo for bills', 'file', accept=LOGO_FILE_TYPES),
        f('tablets', 'Tablets', 'number', min=0),
        f('laptops', 'Laptops / desktops', 'number', min=0),
    ]},
    {'key': 'extras', 'title': 'Other', 'fields': [
        f('delivery_platforms', 'Delivery platforms you use', 'multi',
          options=[('swiggy', 'Swiggy'), ('zomato', 'Zomato'), ('own', 'Own delivery'), ('other', 'Other')]),
        f('existing_data', 'Data to bring over', 'textarea',
          placeholder='e.g. customer list, pending credit balances'),
        f('go_live', 'Preferred go-live date', 'date'),
        f('notes', 'Anything else we should know', 'textarea'),
    ]},
]

TEXT_LIMITS = {'textarea': 4000, 'lines': 4000}
TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def option_values(field, options):
    opts = options.get(field['options']) if isinstance(field.get('options'), str) else field.get('options')
    return [o[0] if isinstance(o, (list, tuple)) else o['value'] for o in (opts or [])]


def _clean_value(field, value, options):
    """A value of the field's type, or None when empty or unusable. Never raises."""
    kind = field['type']
    if value is None:
        return None
    if kind == 'list':
        if not isinstance(value, list):
            return []
        rows = [_clean_fields(field['fields'], row, options) for row in value[:field.get('max', 100)]
                if isinstance(row, dict)]
        return [row for row in rows if any(not _empty(v) and v is not False for v in row.values())]
    if kind == 'yesno':
        return value if isinstance(value, bool) else None
    if kind == 'number':
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        if number != number or ('min' in field and number < field['min']) or ('max' in field and number > field['max']):
            return None
        return int(number) if number.is_integer() else round(number, 3)
    if kind == 'multi':
        allowed = option_values(field, options)
        return [v for v in allowed if isinstance(value, list) and v in value]
    if kind == 'lines':
        lines = value if isinstance(value, list) else str(value).splitlines()
        return [str(line).strip()[:200] for line in lines if str(line).strip()][:100]
    text = str(value).strip()[:TEXT_LIMITS.get(kind, 500)]
    if not text:
        return None
    if kind == 'select':
        return text if text in option_values(field, options) else None
    if kind == 'time':
        return text if TIME_RE.match(text) else None
    if kind == 'date':
        return text if DATE_RE.match(text) else None
    return text


def _clean_fields(fields, values, options):
    values = values if isinstance(values, dict) else {}
    return {fld['key']: _clean_value(fld, values.get(fld['key']), options)
            for fld in fields if fld['type'] != 'file'}


def clean(data, options):
    """Keep only known sections and fields, each as its type. Unknown keys are dropped."""
    data = data if isinstance(data, dict) else {}
    out = {}
    for section in SECTIONS:
        if section.get('type') == 'list':
            out[section['key']] = _clean_value({**section, 'type': 'list'}, data.get(section['key']), options) or []
        else:
            out[section['key']] = _clean_fields(section['fields'], data.get(section['key']), options)
    return out


def _empty(value):
    return value is None or value == '' or value == []


def problems(data, file_counts):
    """
    What stops the form being submitted: [{'path', 'label', 'message'}]. `data` is cleaned;
    file_counts maps 'section.field' to the number of files uploaded for it.
    """
    found = []

    def need(path, label, message='Required'):
        found.append({'path': path, 'label': label, 'message': message})

    def check_fields(fields, values, path, prefix):
        for fld in fields:
            key_path = f'{path}.{fld["key"]}'
            label = f'{prefix} · {fld["label"]}'
            value = values.get(fld['key'])
            if fld['type'] == 'file':
                if fld['required'] and not file_counts.get(key_path):
                    need(key_path, label, 'Attach a file')
                continue
            if fld['required'] and _empty(value):
                need(key_path, label)
            elif fld['type'] == 'email' and value and not EMAIL_RE.match(value):
                need(key_path, label, 'Not a valid email address')
            elif fld['key'] == 'login_id' and value and not LOGIN_ID_RE.match(value):
                need(key_path, label, LOGIN_ID_HELP)
            if fld['type'] == 'list':
                for i, row in enumerate(value or []):
                    check_fields(fld['fields'], row, f'{key_path}.{i}', f'{prefix} · {fld["item"]} {i + 1}')

    for section in SECTIONS:
        value = data.get(section['key'])
        if section.get('type') == 'list':
            if len(value or []) < section.get('min', 0):
                need(section['key'], section['title'], f'Add at least {section["min"]} {section["item"].lower()}')
            for i, row in enumerate(value or []):
                check_fields(section['fields'], row, f'{section["key"]}.{i}', f'{section["item"]} {i + 1}')
        else:
            check_fields(section['fields'], value or {}, section['key'], section['title'])
    return found


def file_fields():
    """'section.field' -> field, for every file field."""
    return {f'{s["key"]}.{fld["key"]}': fld for s in SECTIONS for fld in s['fields'] if fld['type'] == 'file'}


def public_schema(options):
    """The definition as the form page needs it, with dynamic option lists filled in."""
    def field_out(fld):
        out = dict(fld)
        if 'options' in fld:
            opts = options.get(fld['options'], []) if isinstance(fld['options'], str) else fld['options']
            out['options'] = [{'value': v, 'label': lbl} for v, lbl in opts]
        if fld['type'] == 'list':
            out['fields'] = [field_out(x) for x in fld['fields']]
        return out
    return [{**s, 'fields': [field_out(x) for x in s['fields']]} for s in SECTIONS]
