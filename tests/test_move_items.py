"""Moving items from one table's order to another table."""
from .test_merge_tables import add, floor, merge  # noqa: F401  (floor is a fixture)
from .test_orders import POS, place, shop, table_status  # noqa: F401  (shop is a fixture)


def move(api, order, table, *lines):
    return api.post(f"{POS}/orders/{order['id']}/move_items/", {
        'destination_table_id': table['id'],
        'items': [{'order_item_id': line['id'], 'quantity': qty} for line, qty in lines]}, format='json')


def test_part_of_a_line_moves_to_a_free_table_as_a_new_order(floor):
    api, outlet, (t1, t2, _), paneer, naan = floor
    order = place(api, outlet, t1, (paneer, 3, 'less spicy'), (naan, 2, ''))
    api.post(f"{POS}/orders/{order['id']}/send_kot/", {}, format='json')
    paneer_line = order['items'][0]

    r = move(api, order, t2, (paneer_line, 2))
    assert r.status_code == 200, r.data
    source, moved = r.data['source_order'], r.data['destination_order']
    assert [(i['menu_item_name'], i['quantity']) for i in source['items']] == [('Paneer Tikka', 1), ('Butter Naan', 2)]
    assert moved['table_number'] == '2' and moved['id'] != order['id']
    line = moved['items'][0]
    assert (line['menu_item_name'], line['quantity'], line['special_instructions']) == ('Paneer Tikka', 2, 'less spicy')
    # Already in the kitchen: it keeps its KOT, and the new order isn't "pending"
    assert line['kot_number'] is not None and line['status'] == paneer_line['status']
    assert moved['status'] == 'confirmed'
    # Both bills recalculated: 250 + 120 = 370 + 5% GST; 500 + 5% GST
    assert (source['subtotal'], source['total_amount']) == ('370.00', '389.00')
    assert (moved['subtotal'], moved['tax_amount'], moved['total_amount']) == ('500.00', '25.00', '525.00')
    assert table_status(api, t2) == 'occupied'


def test_moving_everything_onto_an_open_order_closes_the_source(floor):
    api, outlet, (t1, t2, _), paneer, naan = floor
    first = place(api, outlet, t1, (paneer, 1, ''))
    second = place(api, outlet, t2, (naan, 1, ''))

    r = move(api, first, t2, (first['items'][0], 1))
    assert r.status_code == 200, r.data
    source, target = r.data['source_order'], r.data['destination_order']
    assert target['id'] == second['id']
    assert sorted(i['menu_item_name'] for i in target['items']) == ['Butter Naan', 'Paneer Tikka']
    assert target['total_amount'] == '326.00'  # 310 + 5%
    assert source['status'] == 'merged' and source['total_amount'] == '0.00'
    assert table_status(api, t1) == 'available'


def test_moving_to_a_table_merged_into_a_bill_keeps_that_tables_name(floor):
    api, outlet, (t1, t2, t3), paneer, naan = floor
    place(api, outlet, t1, (paneer, 1, ''))
    bill = merge(api, t1, t2).data
    third = place(api, outlet, t3, (naan, 2, ''))

    r = move(api, third, t2, (third['items'][0], 2))
    assert r.status_code == 200, r.data
    target = r.data['destination_order']
    assert target['id'] == bill['id']
    assert [(i['menu_item_name'], i['table_number']) for i in target['items']] == [('Paneer Tikka', '1'), ('Butter Naan', '2')]


def test_checks(floor):
    api, outlet, (t1, t2, _), paneer, naan = floor
    order = place(api, outlet, t1, (paneer, 2, ''))
    line = order['items'][0]
    other = place(api, outlet, t2, (naan, 1, ''))

    assert move(api, order, t2, (line, 3)).status_code == 400            # more than the line has
    assert move(api, order, t1, (line, 1)).status_code == 409            # the same table
    assert move(api, order, t2, (other['items'][0], 1)).status_code == 400  # a line of another order
    # A bill with a discount isn't changed
    assert api.post(f"{POS}/orders/{order['id']}/apply_discount/", {'type': 'percent', 'value': '10', 'reason': 'Regular'},
                    format='json').status_code == 200
    r = move(api, order, t2, (line, 1))
    assert r.status_code == 409 and 'discount' in r.data['detail'].lower()
    assert api.get(f"{POS}/orders/{order['id']}/").data['items'][0]['quantity'] == 2
