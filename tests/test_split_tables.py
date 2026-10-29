"""Split Table: a temporary table 4-1 next to table 4 for another party, with its own bill."""
from .test_merge_tables import merge
from .test_orders import POS, cashier, place, shop, table_status  # noqa: F401  (fixtures)
from .test_payments import cash, open_counter, settle


def split(api, table):
    return api.post(f"{POS}/tables/{table['id']}/split/", {}, format='json')


def numbers(api, outlet):
    return sorted(t['table_number'] for t in api.get(f'{POS}/tables/', {'restaurant_id': outlet['id']}).data['results'])


def test_splitting_a_running_table_adds_table_n_1_for_a_new_order(shop):  # noqa: F811
    api, outlet, table, paneer, naan = shop
    running = place(api, outlet, table, (paneer, 1, ''))

    r = split(api, table)
    assert r.status_code == 201, r.data
    half = r.data
    assert (half['table_number'], half['name'], half['split_from'], half['split_from_number']) == ('1-1', 'Table 1-1', table['id'], '1')
    assert half['status'] == 'available' and half['capacity'] == 4
    # The running order stays on Table 1; Table 1-1 takes its own order and bill
    assert api.get(f"{POS}/orders/{running['id']}/").data['table_number'] == '1'
    second = place(api, outlet, half, (naan, 2, ''))
    assert second['table_number'] == '1-1' and second['id'] != running['id']
    assert table_status(api, table) == table_status(api, half) == 'occupied'

    # Splitting again, or splitting the split table, makes the next number
    assert split(api, table).data['table_number'] == '1-2'
    assert split(api, half).data['table_number'] == '1-3'
    assert numbers(api, outlet) == ['1', '1-1', '1-2', '1-3']


def test_a_split_table_goes_away_once_its_bill_is_settled(shop):  # noqa: F811
    api, outlet, table, paneer, _ = shop
    half = split(api, table).data
    order = place(api, outlet, half, (paneer, 1, ''))
    open_counter(api, api)
    assert settle(api, order, [cash(order['total_amount'])]).status_code == 200
    assert numbers(api, outlet) == ['1']
    # The bill keeps its table in history, and the number is free for the next split
    assert api.get(f"{POS}/orders/{order['id']}/").data['table_number'] == '1-1'
    assert split(api, table).data['table_number'] == '1-1'


def test_removing_an_unused_split_table(shop, cashier):  # noqa: F811
    api, outlet, table, paneer, _ = shop
    half = split(cashier, table).data  # anyone taking orders can split
    busy = split(cashier, table).data
    place(api, outlet, busy, (paneer, 1, ''))

    refused = cashier.post(f"{POS}/tables/{busy['id']}/remove_split/", {}, format='json')
    assert refused.status_code == 409 and refused.data['code'] == 'table_occupied'
    not_split = cashier.post(f"{POS}/tables/{table['id']}/remove_split/", {}, format='json')
    assert not_split.status_code == 409 and not_split.data['code'] == 'not_split'
    assert cashier.post(f"{POS}/tables/{half['id']}/remove_split/", {}, format='json').status_code == 204
    assert numbers(api, outlet) == ['1', '1-2']


def test_a_split_table_can_join_a_merged_bill(shop):  # noqa: F811
    api, outlet, table, paneer, naan = shop
    bill = place(api, outlet, table, (paneer, 1, ''))
    half = split(api, table).data
    place(api, outlet, half, (naan, 1, ''))
    merged = merge(api, table, half)
    assert merged.status_code == 200 and [t['table_number'] for t in merged.data['linked_tables']] == ['1-1']
    open_counter(api, api)
    assert settle(api, bill, [cash(merged.data['amount_due'])]).status_code == 200
    assert numbers(api, outlet) == ['1'] and table_status(api, table) == 'available'
