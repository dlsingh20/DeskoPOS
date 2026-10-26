from .models import CashCounter, Outlet, PrintSettings


def create_outlet(*, code, name, type='restaurant', tax_id_label='', **fields):
    """An outlet with what it needs to trade: a cash counter, print settings and an empty menu."""
    from catalogue.models import Menu

    outlet = Outlet.objects.create(code=code, name=name, type=type, **fields)
    CashCounter.objects.create(outlet=outlet, name='Counter 1')
    PrintSettings.objects.create(outlet=outlet, header={'name': name, 'taxIdLabel': tax_id_label})
    Menu.objects.create(outlet=outlet, name='Main Menu')
    return outlet


def next_outlet_code():
    """MAIN for the first outlet, then O2, O3…"""
    taken = set(Outlet.objects.values_list('code', flat=True))
    n = 2
    while f'O{n}' in taken:
        n += 1
    return f'O{n}'


def outlets_for(user):
    """Outlets the user works in: those linked to them, or all when none are linked."""
    linked = list(user.outlet_links.values_list('outlet_id', flat=True))
    qs = Outlet.objects.all()
    return qs.filter(id__in=linked) if linked else qs
