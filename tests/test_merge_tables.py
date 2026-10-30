"""Merged tables: one bill, each table keeps ordering and its KOTs keep its name."""
import pytest

from .test_orders import POS, place, shop, table_status  # noqa: F401  (shop is a fixture)
from .test_payments import cash, open_counter, settle


@pytest.fixture
def floor(shop):  # noqa: F811
    """Spice Garden with Tables 1, 2 and 3."""
    api, outlet, table1, paneer, naan = shop
    table2 = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '2'}, format='json').data
    table3 = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '3'}, format='json').data
    return api, outlet, (table1, table2, table3), paneer, naan


def merge(api, target, *sources):
    return api.post(f'{POS}/orders/merge/', {'target_table_id': target['id'],
                                             'source_table_ids': [t['id'] for t in sources]}, format='json')


def add(api, order, item, quantity, table=None):
    r = api.post(f'{POS}/order-items/', {'order': order['id'], 'menu_item': item['id'], 'quantity': quantity,
                                         'table': table['id'] if table else None}, format='json')
    assert r.status_code == 201, r.data
    return r.data


def test_merging_combines_the_bill_and_keeps_each_tables_lines(floor):
    api, outlet, (t1, t2, t3), paneer, naan = floor
    first = place(api, outlet, t1, (paneer, 1, ''))
    api.post(f"{POS}/orders/{first['id']}/send_kot/", {}, format='json')
    second = place(api, outlet, t2, (naan, 2, ''), guest_count=2)

    r = merge(api, t1, t2, t3)
    assert r.status_code == 200, r.data
    bill = r.data
    assert bill['id'] == first['id'] and bill['table_number'] == '1'
    assert [t['table_number'] for t in bill['linked_tables']] == ['2', '3']
    assert [(i['menu_item_name'], i['table_number']) for i in bill['items']] == [('Paneer Tikka', '1'), ('Butter Naan', '2')]
    assert (bill['subtotal'], bill['total_amount']) == ('370.00', '389.00')  # 370 + 5% GST, rounded to the rupee
    assert bill['guest_count'] == 2 and bill['status'] == 'confirmed'
    assert all(table_status(api, t) == 'occupied' for t in (t1, t2, t3))

    gone = api.get(f"{POS}/orders/{second['id']}/").data
    assert gone['status'] == 'merged' and gone['merged_into'] == first['id'] and gone['items'] == []
    listed = api.get(f'{POS}/orders/', {'restaurant_id': outlet['id']}).data['results']
    assert second['id'] not in [o['id'] for o in listed]  # not a bill of its own
    # Each merged table finds the shared order, and can't start another one
    assert [o['id'] for o in api.get(f'{POS}/orders/', {'table_id': t3['id']}).data['results']] == [first['id']]
    again = api.post(f'{POS}/orders/', {'restaurant': outlet['id'], 'table': t3['id'], 'items': []}, format='json')
    assert again.status_code == 409 and again.data['code'] == 'table_has_order' and again.data['order_id'] == first['id']


def test_each_table_gets_its_own_kot(floor):
    api, outlet, (t1, t2, t3), paneer, naan = floor
    bill = place(api, outlet, t1, (paneer, 1, ''))
    merge(api, t1, t2, t3)
    add(api, bill, naan, 2, table=t2)
    add(api, bill, paneer, 1, table=t3)
    add(api, bill, naan, 1)  # the bill's own table

    sent = api.post(f"{POS}/orders/{bill['id']}/send_kot/", {}, format='json').data
    kots = {k['table_number']: [(i['menu_item_name'], i['quantity']) for i in k['items']] for k in sent['kots']}
    assert kots == {'1': [('Paneer Tikka', 1), ('Butter Naan', 1)], '2': [('Butter Naan', 2)], '3': [('Paneer Tikka', 1)]}
    assert sorted(k['kot_number'] for k in sent['kots']) == [1, 2, 3]
    assert all(i['table_number'] and i['kot_number'] for i in sent['items'])
    reprint = api.post(f"{POS}/orders/{bill['id']}/send_kot/",
                       {'reprint_kot_number': next(k['kot_number'] for k in sent['kots'] if k['table_number'] == '2')},
                       format='json').data
    assert reprint['kots'][0]['table_number'] == '2'

    stranger = api.post(f'{POS}/tables/', {'restaurant': outlet['id'], 'table_number': '9'}, format='json').data
    r = api.post(f'{POS}/order-items/', {'order': bill['id'], 'menu_item': naan['id'], 'quantity': 1,
                                         'table': stranger['id']}, format='json')
    assert r.status_code == 400


def test_one_payment_frees_every_merged_table(floor):
    api, outlet, (t1, t2, t3), paneer, naan = floor
    place(api, outlet, t1, (paneer, 1, ''))
    place(api, outlet, t2, (naan, 1, ''))
    bill = merge(api, t1, t2, t3).data
    open_counter(api, api)
    r = settle(api, bill, [cash(bill['amount_due'])])
    assert r.status_code == 200, r.data
    assert r.data['order']['invoice_number']
    assert all(table_status(api, t) == 'available' for t in (t1, t2, t3))
    # The tables take new orders again
    place(api, outlet, t2, (naan, 1, ''))


def test_target_without_an_order_takes_over_the_oldest_bill(floor):
    api, outlet, (t1, t2, t3), paneer, naan = floor
    first = place(api, outlet, t2, (paneer, 1, ''))
    place(api, outlet, t3, (naan, 1, ''))
    bill = merge(api, t1, t2, t3).data
    assert bill['id'] == first['id'] and bill['table_number'] == '1'
    assert sorted(t['table_number'] for t in bill['linked_tables']) == ['2', '3']
    assert sorted((i['menu_item_name'], i['table_number']) for i in bill['items']) == [
        ('Butter Naan', '3'), ('Paneer Tikka', '2')]


def test_merging_refuses_paid_or_discounted_orders_and_empty_tables(floor):
    api, outlet, (t1, t2, t3), paneer, naan = floor
    assert merge(api, t1, t2).data['code'] == 'no_open_order'
    assert merge(api, t1).status_code == 400
    place(api, outlet, t1, (paneer, 1, ''))
    second = place(api, outlet, t2, (naan, 3, ''))
    r = api.post(f"{POS}/orders/{second['id']}/apply_discount/", {'type': 'fixed', 'value': '10', 'reason': 'Regular', 'expected_subtotal': '180.00'},
                 format='json')
    assert r.status_code == 200, r.data
    refused = merge(api, t1, t2)
    assert refused.status_code == 409 and refused.data['code'] == 'has_discount'
    assert api.get(f"{POS}/orders/{second['id']}/").data['status'] == 'pending'  # nothing changed


def test_unmerging_gives_the_table_its_lines_back(floor):
    api, outlet, (t1, t2, t3), paneer, naan = floor
    bill = place(api, outlet, t1, (paneer, 1, ''))
    merge(api, t1, t2, t3)
    add(api, bill, naan, 2, table=t2)
    api.post(f"{POS}/orders/{bill['id']}/send_kot/", {}, format='json')

    holder = api.post(f"{POS}/orders/{bill['id']}/unmerge/", {'table_id': t1['id']}, format='json')
    assert holder.status_code == 409 and holder.data['code'] == 'bill_table'
    r = api.post(f"{POS}/orders/{bill['id']}/unmerge/", {'table_id': t2['id']}, format='json')
    assert r.status_code == 200, r.data
    assert [i['menu_item_name'] for i in r.data['order']['items']] == ['Paneer Tikka']
    assert [t['table_number'] for t in r.data['order']['linked_tables']] == ['3']
    own = r.data['new_order']
    assert own['table_number'] == '2' and own['status'] == 'confirmed'
    assert [(i['menu_item_name'], i['table_number'], i['kot_number']) for i in own['items']] == [('Butter Naan', '2', 2)]

    # A table that never ordered just leaves the bill
    r = api.post(f"{POS}/orders/{bill['id']}/unmerge/", {'table_id': t3['id']}, format='json')
    assert r.status_code == 200 and r.data['new_order'] is None and r.data['order']['linked_tables'] == []
    assert table_status(api, t3) == 'available' and table_status(api, t2) == 'occupied'


def test_cancelling_a_merged_bill_frees_every_table(floor):
    api, outlet, (t1, t2, t3), paneer, _ = floor
    bill = place(api, outlet, t1, (paneer, 1, ''))
    merge(api, t1, t2)
    r = api.post(f"{POS}/orders/{bill['id']}/cancel/", {'reason': 'Left'}, format='json')
    assert r.status_code == 200, r.data
    assert table_status(api, t1) == table_status(api, t2) == 'available'
