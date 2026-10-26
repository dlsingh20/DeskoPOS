"""
Database-level client isolation, applied after every `migrate`.

Django models stay ordinary; this adds what Django can't express:
  * UNIQUE (tenant_id, id) on every table in the app schema
  * a composite FK (tenant_id, x_id) next to each Django FK between app
    tables, so a row can't reference another client's row
  * Row Level Security (enabled and forced) with a tenant_isolation policy
  * the pos_api / pos_platform roles and their grants
  * SQL functions used before a client is known (sign-in)
Everything is idempotent, so it is safe to run on every migrate.
"""
from django.db import connection

ROLES_SQL = """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_api') THEN
    CREATE ROLE pos_api NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_platform') THEN
    CREATE ROLE pos_platform NOLOGIN BYPASSRLS;
  END IF;
  -- The connecting user switches to these roles with SET LOCAL ROLE
  IF NOT pg_has_role(current_user, 'pos_api', 'MEMBER') THEN
    EXECUTE format('GRANT pos_api TO %I', current_user);
  END IF;
  IF NOT pg_has_role(current_user, 'pos_platform', 'MEMBER') THEN
    EXECUTE format('GRANT pos_platform TO %I', current_user);
  END IF;
END $$;
"""

FUNCTIONS_SQL = """
CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::bigint
$$;

-- The signed-in client's own record; pos_api can't read platform.tenants
-- Dropped first: CREATE OR REPLACE can't change the columns it returns
DROP FUNCTION IF EXISTS app.current_tenant();
CREATE FUNCTION app.current_tenant()
RETURNS TABLE (id bigint, name text, status text, country_code text, currency_code text,
               locale text, timezone text, language text, plan_features jsonb, feature_overrides jsonb,
               currency_symbol text, currency_decimals smallint, tax_id_label text, max_outlets int,
               tax_reg_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, platform AS $$
  SELECT t.id, t.name, t.status, t.country_id, t.currency_id, t.locale, t.timezone, t.language,
         coalesce(p.features, '{}'::jsonb), t.feature_overrides,
         cur.symbol, cur.decimals, co.tax_id_label, p.max_outlets, t.tax_reg_number
  FROM platform.tenants t
  LEFT JOIN platform.plans p ON p.id = t.plan_id
  JOIN platform.currencies cur ON cur.code = t.currency_id
  JOIN platform.countries co ON co.code = t.country_id
  WHERE t.id = app.current_tenant_id()
$$;

-- Sign-in: the login ID alone finds the client (one login page for everyone)
CREATE OR REPLACE FUNCTION app.lookup_login(p_login text)
RETURNS TABLE (tenant_id bigint, tenant_status text, user_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app, platform AS $$
  SELECT u.tenant_id, t.status, u.id
  FROM app.users u JOIN platform.tenants t ON t.id = u.tenant_id
  WHERE lower(u.username) = lower(p_login)
$$;

-- Is a login ID free across all clients? (Super Admin and Users screens)
CREATE OR REPLACE FUNCTION app.login_id_taken(p_login text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app AS $$
  SELECT EXISTS (SELECT 1 FROM app.users WHERE lower(username) = lower(p_login))
$$;

REVOKE ALL ON FUNCTION app.current_tenant(), app.lookup_login(text), app.login_id_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_tenant_id(), app.current_tenant(), app.lookup_login(text), app.login_id_taken(text)
  TO pos_api, pos_platform;
"""

TENANT_GUARDS_SQL = """
DO $$
DECLARE
  r record;
BEGIN
  -- 1. UNIQUE (tenant_id, id) and RLS on every client table
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    WHERE n.nspname = 'app' AND c.relkind = 'r'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.relname || '_tenant_id_id_uniq'
                   AND conrelid = format('app.%I', r.relname)::regclass) THEN
      EXECUTE format('ALTER TABLE app.%I ADD CONSTRAINT %I UNIQUE (tenant_id, id)', r.relname, r.relname || '_tenant_id_id_uniq');
    END IF;
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', r.relname);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'app' AND tablename = r.relname AND policyname = 'tenant_isolation') THEN
      EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id = app.current_tenant_id()) '
                     'WITH CHECK (tenant_id = app.current_tenant_id())', r.relname);
    END IF;
  END LOOP;

  -- 2. Composite FK beside each single-column FK between two client tables
  FOR r IN
    SELECT con.conname, src.relname AS src_table, att.attname AS src_col, dst.relname AS dst_table
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace sn ON sn.oid = src.relnamespace
    JOIN pg_class dst ON dst.oid = con.confrelid
    JOIN pg_namespace dn ON dn.oid = dst.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1
      AND sn.nspname = 'app' AND dn.nspname = 'app'
      AND att.attname <> 'tenant_id'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = con.confrelid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left(r.conname, 56) || '_tenant'
                   AND conrelid = format('app.%I', r.src_table)::regclass) THEN
      EXECUTE format('ALTER TABLE app.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id, %I) REFERENCES app.%I (tenant_id, id) DEFERRABLE INITIALLY DEFERRED',
                     r.src_table, left(r.conname, 56) || '_tenant', r.src_col, r.dst_table);
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA app, platform TO pos_api, pos_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO pos_api, pos_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO pos_api, pos_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform TO pos_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA platform TO pos_platform;
GRANT SELECT ON platform.currencies, platform.countries, platform.permissions, platform.plans TO pos_api;
"""

# Written once, never changed by the client API
APPEND_ONLY_TABLES = ['audit_log']


def apply(using_connection=None):
    conn = using_connection or connection
    with conn.cursor() as cursor:
        cursor.execute(ROLES_SQL)
        cursor.execute(FUNCTIONS_SQL)
        cursor.execute(TENANT_GUARDS_SQL)
        for table in APPEND_ONLY_TABLES:
            cursor.execute(f'REVOKE UPDATE, DELETE ON app.{table} FROM pos_api')
