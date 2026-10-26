"""Loads schema.sql + seed.sql into a fresh database and checks the design's guarantees.

Usage (no PostgreSQL install needed; pgserver ships one):
    pip install pgserver "psycopg[binary]"
    python test_schema.py <empty-data-dir> <folder with schema.sql and seed.sql>
"""
import sys
import pgserver
import psycopg
from psycopg import errors

data_dir, docs = sys.argv[1], sys.argv[2]
srv = pgserver.get_server(data_dir, cleanup_mode=None)
base = srv.get_uri()

with psycopg.connect(base, autocommit=True) as c:
    c.execute("DROP DATABASE IF EXISTS posdesign")
    c.execute("DROP ROLE IF EXISTS pos_api")
    c.execute("DROP ROLE IF EXISTS pos_platform")
    c.execute("CREATE DATABASE posdesign")

uri = base.rsplit('/', 1)[0] + '/posdesign'
results = []


def check(name, ok):
    results.append((name, ok))
    print(('PASS ' if ok else 'FAIL ') + name)


def expect_error(conn, sql, params, err):
    try:
        with conn.transaction():
            conn.execute(sql, params)
        return False
    except err:
        return True


with psycopg.connect(uri, autocommit=True) as c:
    for f in ('schema.sql', 'seed.sql'):
        c.execute(open(f'{docs}/{f}', encoding='utf-8').read())
    print('schema + seed loaded')
    n = c.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('app','platform') AND table_type='BASE TABLE'").fetchone()[0]
    print(f'{n} tables')

    c.execute("INSERT INTO platform.platform_users (email, full_name, password_hash, role) VALUES ('owner@appdesko.com','Owner','x','owner')")
    t1 = c.execute("SELECT platform.provision_tenant('Spice Garden','restaurant','IN','Spice Garden MG Road','sg_admin','hash1','a@spice.in','growth',1)").fetchone()[0]
    t2 = c.execute("SELECT platform.provision_tenant('Beans Cafe','cafe','AE','Beans JLT','bc_admin','hash2',NULL,'starter',1)").fetchone()[0]
    check('client IDs start at 101', (t1, t2) == (101, 102))
    check('new client starts pending', c.execute("SELECT status FROM platform.tenants WHERE id=%s", (t1,)).fetchone()[0] == 'pending')
    c.execute("SELECT platform.set_tenant_status(%s,'active','Paid',1)", (t1,))
    c.execute("SELECT platform.set_tenant_status(%s,'active','Paid',1)", (t2,))
    check('login IDs are unique across all clients', expect_error(
        c, "SELECT platform.provision_tenant('Copycat','cafe','GB','Copycat','SG_Admin','h',NULL,'starter',1)", None, errors.UniqueViolation))
    check('Copycat rolled back, next client gets 103 or later', c.execute("SELECT count(*) FROM platform.tenants WHERE name='Copycat'").fetchone()[0] == 0)

    # Act as the POS API (subject to RLS), signed in to client 101
    c.execute("SET ROLE pos_api")
    # Sign-in: no client known yet; the login ID alone finds it
    login = c.execute("SELECT tenant_id, tenant_status, can_login FROM app.lookup_login('BC_ADMIN')").fetchone()
    check('lookup_login finds the client from the login ID', login == (t2, 'active', True))
    check('without a client set, no rows are visible', c.execute("SELECT count(*) FROM app.users").fetchone()[0] == 0)
    c.execute("SELECT set_config('app.tenant_id', %s, false)", (str(t1),))
    check('client sees only its own users', c.execute("SELECT array_agg(DISTINCT tenant_id) FROM app.users").fetchone()[0] == [t1])
    check('client sees its own country taxes', sorted(r[0] for r in c.execute("SELECT name FROM app.taxes")) == ['CGST', 'SGST'])
    ct = c.execute("SELECT id, currency_code, status FROM app.current_tenant()").fetchone()
    check('current_tenant() returns own record', ct == (t1, 'INR', 'active'))
    check('pos_api cannot read the client list', expect_error(c, "SELECT * FROM platform.tenants", None, errors.InsufficientPrivilege))
    check('cannot write rows for another client', expect_error(
        c, "INSERT INTO app.categories (tenant_id, name) VALUES (%s, 'X')", (t2,), errors.InsufficientPrivilege))

    outlet = c.execute("SELECT id FROM app.outlets").fetchone()[0]
    cat = c.execute("INSERT INTO app.categories (tenant_id, name) VALUES (%s,'Mains') RETURNING id", (t1,)).fetchone()[0]
    c.execute("INSERT INTO app.category_taxes (tenant_id, category_id, tax_id) SELECT %s, %s, id FROM app.taxes", (t1, cat))
    prod = c.execute("INSERT INTO app.products (tenant_id, category_id, name, base_price) VALUES (%s,%s,'Dal Makhani',320) RETURNING id", (t1, cat)).fetchone()[0]

    # Client 102's category id, read as the platform
    c.execute("RESET ROLE")
    cat2 = c.execute("INSERT INTO app.categories (tenant_id, name) VALUES (%s,'Coffee') RETURNING id", (t2,)).fetchone()[0]
    c.execute("SET ROLE pos_api")
    check("cannot point at another client's row (composite FK)", expect_error(
        c, "INSERT INTO app.products (tenant_id, category_id, name) VALUES (%s,%s,'Hack')", (t1, cat2), errors.ForeignKeyViolation))
    check("another client's rows are invisible", c.execute("SELECT count(*) FROM app.categories WHERE id=%s", (cat2,)).fetchone()[0] == 0)

    # Order -> KOT -> settle -> refund, the way the API would do it in one transaction each
    admin = c.execute("SELECT id FROM app.users WHERE username='sg_admin'").fetchone()[0]
    with c.transaction():
        seq = c.execute("""INSERT INTO app.number_sequences (tenant_id, outlet_id, kind, period_key, last_value)
                           VALUES (%s,%s,'order','2026-10-26',1)
                           ON CONFLICT (tenant_id, outlet_id, kind, period_key) DO UPDATE SET last_value = app.number_sequences.last_value + 1
                           RETURNING last_value""", (t1, outlet)).fetchone()[0]
        order = c.execute("""INSERT INTO app.orders (tenant_id, outlet_id, order_number, business_date, type, created_by, currency_code, customer_name, customer_phone)
                             VALUES (%s,%s,%s,'2026-10-26','dine_in',%s,'INR','R. Kumar','+919876543210') RETURNING id""",
                          (t1, outlet, str(seq), admin)).fetchone()[0]
        item = c.execute("""INSERT INTO app.order_items (tenant_id, order_id, product_id, product_name, quantity, unit_price, gross_amount, taxable_amount, tax_amount, line_total, special_instructions)
                            VALUES (%s,%s,%s,'Dal Makhani',2,320,640,640,32,672,'Less spicy') RETURNING id""", (t1, order, prod)).fetchone()[0]
        for name in ('CGST', 'SGST'):
            c.execute("""INSERT INTO app.order_item_taxes (tenant_id, order_item_id, tax_name, tax_code, type, rate, taxable_amount, tax_amount)
                         VALUES (%s,%s,%s,%s,'percentage',2.5,640,16)""", (t1, item, name, name))
    bd = c.execute("SELECT tax_code, tax_amount FROM app.v_order_tax_breakdown WHERE order_id=%s ORDER BY 1", (order,)).fetchall()
    check('tax breakdown view sums each tax', [(r[0], float(r[1])) for r in bd] == [('CGST', 16.0), ('SGST', 16.0)])

    counter = c.execute("SELECT id FROM app.cash_counters").fetchone()[0]
    shift = c.execute("""INSERT INTO app.shifts (tenant_id, outlet_id, cash_counter_id, cashier_id, business_date, opening_balance, opened_by)
                         VALUES (%s,%s,%s,%s,'2026-10-26',2000,%s) RETURNING id""", (t1, outlet, counter, admin, admin)).fetchone()[0]
    check('only one open shift per counter', expect_error(
        c, """INSERT INTO app.shifts (tenant_id, outlet_id, cash_counter_id, cashier_id, business_date, opened_by)
              VALUES (%s,%s,%s,%s,'2026-10-26',%s)""", (t1, outlet, counter, admin, admin), errors.UniqueViolation))
    cash = c.execute("SELECT id FROM app.payment_methods WHERE code='cash'").fetchone()[0]
    pay = c.execute("""INSERT INTO app.payments (tenant_id, outlet_id, order_id, payment_method_id, method_kind, amount, amount_received, change_returned, shift_id, received_by)
                       VALUES (%s,%s,%s,%s,'cash',672,700,28,%s,%s) RETURNING id""", (t1, outlet, order, cash, shift, admin)).fetchone()[0]
    c.execute("UPDATE app.orders SET status='completed', invoice_number='MAIN/26-27/000001', closed_at=now(), closed_by=%s, shift_id=%s WHERE id=%s", (admin, shift, order))
    ref = c.execute("""INSERT INTO app.refunds (tenant_id, order_id, credit_note_number, amount, reason, refunded_by, shift_id)
                       VALUES (%s,%s,'CN/26-27/000001',100,'food_quality',%s,%s) RETURNING id""", (t1, order, admin, shift)).fetchone()[0]
    c.execute("INSERT INTO app.refund_lines (tenant_id, refund_id, payment_id, amount) VALUES (%s,%s,%s,100)", (t1, ref, pay))
    c.execute("UPDATE app.payments SET refunded_amount = 100, status='partially_refunded' WHERE id=%s", (pay,))
    check('refund cannot exceed the payment', expect_error(
        c, "UPDATE app.payments SET refunded_amount = 700 WHERE id=%s", (pay,), errors.CheckViolation))
    check("refund reason 'other' needs a note", expect_error(
        c, "INSERT INTO app.refunds (tenant_id, order_id, credit_note_number, amount, reason, refunded_by) VALUES (%s,%s,'CN2',1,'other',%s)",
        (t1, order, admin), errors.CheckViolation))
    c.execute("INSERT INTO app.audit_log (tenant_id, actor_id, action, entity_type, entity_id) VALUES (%s,%s,'bill.refund','order',%s)", (t1, admin, order))
    check('audit log is append-only for the API', expect_error(c, "DELETE FROM app.audit_log", None, errors.InsufficientPrivilege))
    check('invoice numbers are unique per outlet', expect_error(
        c, """INSERT INTO app.orders (tenant_id, outlet_id, order_number, business_date, type, created_by, currency_code, invoice_number)
              VALUES (%s,%s,'99','2026-10-26','takeaway',%s,'INR','MAIN/26-27/000001')""", (t1, outlet, admin), errors.UniqueViolation))

    # Suspending a client signs everyone out
    c.execute("INSERT INTO app.auth_sessions (tenant_id, user_id, token_hash, expires_at) VALUES (%s,%s,'tok',now()+interval '1 day')", (t1, admin))
    c.execute("RESET ROLE")
    c.execute("SELECT platform.set_tenant_status(%s,'suspended','Unpaid invoice',1)", (t1,))
    check('suspend revokes sessions', c.execute("SELECT revoked_at IS NOT NULL FROM app.auth_sessions WHERE token_hash='tok'").fetchone()[0])
    check('status history kept', c.execute("SELECT array_agg(to_status ORDER BY id) FROM platform.tenant_status_history WHERE tenant_id=%s", (t1,)).fetchone()[0] == ['pending', 'active', 'suspended'])

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
