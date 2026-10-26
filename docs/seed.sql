-- =============================================================================
-- Reference data and client provisioning. Run after schema.sql.
-- =============================================================================

INSERT INTO platform.currencies (code, name, symbol, decimals) VALUES
  ('INR', 'Indian Rupee', '₹', 2),
  ('AED', 'UAE Dirham', 'AED', 2),
  ('SAR', 'Saudi Riyal', 'SAR', 2),
  ('QAR', 'Qatari Riyal', 'QAR', 2),
  ('OMR', 'Omani Rial', 'OMR', 3),
  ('KWD', 'Kuwaiti Dinar', 'KD', 3),
  ('BHD', 'Bahraini Dinar', 'BD', 3),
  ('USD', 'US Dollar', '$', 2),
  ('CAD', 'Canadian Dollar', 'CA$', 2),
  ('GBP', 'Pound Sterling', '£', 2),
  ('EUR', 'Euro', '€', 2),
  ('AUD', 'Australian Dollar', 'A$', 2),
  ('NZD', 'New Zealand Dollar', 'NZ$', 2),
  ('SGD', 'Singapore Dollar', 'S$', 2),
  ('MYR', 'Malaysian Ringgit', 'RM', 2),
  ('THB', 'Thai Baht', '฿', 2),
  ('IDR', 'Indonesian Rupiah', 'Rp', 0),
  ('PHP', 'Philippine Peso', '₱', 2),
  ('LKR', 'Sri Lankan Rupee', 'Rs', 2),
  ('NPR', 'Nepalese Rupee', 'Rs', 2),
  ('BDT', 'Bangladeshi Taka', '৳', 2),
  ('ZAR', 'South African Rand', 'R', 2),
  ('KES', 'Kenyan Shilling', 'KSh', 2),
  ('NGN', 'Nigerian Naira', '₦', 2),
  ('EGP', 'Egyptian Pound', 'E£', 2),
  ('JPY', 'Japanese Yen', '¥', 0)
ON CONFLICT (code) DO NOTHING;

-- tax_template: taxes created for a new client in that country. They are
-- starting points for a typical restaurant, not tax advice: rates differ by
-- state, product and licence (US sales tax is per city, so it starts at 0),
-- and the client edits them in Product Management -> Taxes. Countries with no
-- general consumption tax on restaurant food start with none.
INSERT INTO platform.countries (code, name, default_currency, default_locale, default_timezone, tax_id_label, tax_template) VALUES
  ('IN', 'India', 'INR', 'en-IN', 'Asia/Kolkata', 'GSTIN', '[{"name": "CGST", "code": "CGST", "type": "percentage", "rate": 2.5, "reporting_code": "SAC 996331"}, {"name": "SGST", "code": "SGST", "type": "percentage", "rate": 2.5, "reporting_code": "SAC 996331"}]'),
  ('AE', 'United Arab Emirates', 'AED', 'en-AE', 'Asia/Dubai', 'TRN', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 5}]'),
  ('SA', 'Saudi Arabia', 'SAR', 'ar-SA', 'Asia/Riyadh', 'VAT No', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 15}]'),
  ('QA', 'Qatar', 'QAR', 'en-QA', 'Asia/Qatar', 'Tax ID', '[]'),
  ('OM', 'Oman', 'OMR', 'en-OM', 'Asia/Muscat', 'VATIN', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 5}]'),
  ('KW', 'Kuwait', 'KWD', 'en-KW', 'Asia/Kuwait', 'Tax ID', '[]'),
  ('BH', 'Bahrain', 'BHD', 'en-BH', 'Asia/Bahrain', 'VAT No', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 10}]'),
  ('US', 'United States', 'USD', 'en-US', 'America/New_York', 'EIN', '[{"name": "Sales Tax", "code": "ST", "type": "percentage", "rate": 0}]'),
  ('CA', 'Canada', 'CAD', 'en-CA', 'America/Toronto', 'BN', '[{"name": "GST", "code": "GST", "type": "percentage", "rate": 5}]'),
  ('GB', 'United Kingdom', 'GBP', 'en-GB', 'Europe/London', 'VAT No', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 20}]'),
  ('IE', 'Ireland', 'EUR', 'en-IE', 'Europe/Dublin', 'VAT No', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 13.5}]'),
  ('DE', 'Germany', 'EUR', 'de-DE', 'Europe/Berlin', 'USt-IdNr', '[{"name": "MwSt", "code": "MWST", "type": "percentage", "rate": 19}]'),
  ('FR', 'France', 'EUR', 'fr-FR', 'Europe/Paris', 'N° TVA', '[{"name": "TVA", "code": "TVA", "type": "percentage", "rate": 10}]'),
  ('ES', 'Spain', 'EUR', 'es-ES', 'Europe/Madrid', 'NIF', '[{"name": "IVA", "code": "IVA", "type": "percentage", "rate": 10}]'),
  ('IT', 'Italy', 'EUR', 'it-IT', 'Europe/Rome', 'P.IVA', '[{"name": "IVA", "code": "IVA", "type": "percentage", "rate": 10}]'),
  ('NL', 'Netherlands', 'EUR', 'nl-NL', 'Europe/Amsterdam', 'BTW-id', '[{"name": "BTW", "code": "BTW", "type": "percentage", "rate": 9}]'),
  ('AU', 'Australia', 'AUD', 'en-AU', 'Australia/Sydney', 'ABN', '[{"name": "GST", "code": "GST", "type": "percentage", "rate": 10}]'),
  ('NZ', 'New Zealand', 'NZD', 'en-NZ', 'Pacific/Auckland', 'GST No', '[{"name": "GST", "code": "GST", "type": "percentage", "rate": 15}]'),
  ('SG', 'Singapore', 'SGD', 'en-SG', 'Asia/Singapore', 'GST Reg No', '[{"name": "GST", "code": "GST", "type": "percentage", "rate": 9}]'),
  ('MY', 'Malaysia', 'MYR', 'en-MY', 'Asia/Kuala_Lumpur', 'SST No', '[{"name": "Service Tax", "code": "SST", "type": "percentage", "rate": 6}]'),
  ('TH', 'Thailand', 'THB', 'th-TH', 'Asia/Bangkok', 'Tax ID', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 7}]'),
  ('ID', 'Indonesia', 'IDR', 'id-ID', 'Asia/Jakarta', 'NPWP', '[{"name": "PB1", "code": "PB1", "type": "percentage", "rate": 10}]'),
  ('PH', 'Philippines', 'PHP', 'en-PH', 'Asia/Manila', 'TIN', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 12}]'),
  ('LK', 'Sri Lanka', 'LKR', 'en-LK', 'Asia/Colombo', 'VAT No', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 18}]'),
  ('NP', 'Nepal', 'NPR', 'en-NP', 'Asia/Kathmandu', 'PAN', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 13}]'),
  ('BD', 'Bangladesh', 'BDT', 'en-BD', 'Asia/Dhaka', 'BIN', '[]'),
  ('ZA', 'South Africa', 'ZAR', 'en-ZA', 'Africa/Johannesburg', 'VAT No', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 15}]'),
  ('KE', 'Kenya', 'KES', 'en-KE', 'Africa/Nairobi', 'KRA PIN', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 16}]'),
  ('NG', 'Nigeria', 'NGN', 'en-NG', 'Africa/Lagos', 'TIN', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 7.5}]'),
  ('EG', 'Egypt', 'EGP', 'ar-EG', 'Africa/Cairo', 'Tax Reg No', '[{"name": "VAT", "code": "VAT", "type": "percentage", "rate": 14}]'),
  ('JP', 'Japan', 'JPY', 'ja-JP', 'Asia/Tokyo', 'T-Number', '[{"name": "Consumption Tax", "code": "CT", "type": "percentage", "rate": 10}]')
ON CONFLICT (code) DO NOTHING;

-- Same keys as the current app (src/utils/posAccess.js), plus the new ones
INSERT INTO platform.permissions (key, group_name, label, approvable, admin_only, sort_order) VALUES
  ('bill.settle',        'Billing',           'Settle bills',                                        false, false, 10),
  ('bill.reprint',       'Billing',           'Reprint bills',                                       false, false, 20),
  ('bill.refund',        'Billing',           'Refund a paid bill',                                  true,  false, 25),
  ('discount.unlimited', 'Billing',           'Discounts above the cashier limit',                   true,  false, 30),
  ('payment.credit',     'Billing',           'Credit Pay (bill to be paid later)',                  true,  false, 40),
  ('order.void_items',   'Orders',            'Reduce or remove items already sent to the kitchen', true,  false, 50),
  ('order.cancel',       'Orders',            'Cancel an order',                                     true,  false, 55),
  ('cash.movement',      'Cash',              'Cash in / cash out at the counter',                   true,  false, 60),
  ('history.full',       'History & reports', 'Full history (any date)',                             false, false, 70),
  ('history.export',     'History & reports', 'Export history to Excel',                             false, false, 80),
  ('reports.view',       'History & reports', 'Reports',                                             false, false, 90),
  ('inventory.manage',   'Setup',             'Inventory, recipes and stock',                        false, false, 95),
  ('settings.manage',    'Setup',             'Tables, products, taxes and print settings',          false, false, 100),
  ('users.manage',       'Setup',             'Users & roles',                                       false, true,  110)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform.plans (code, name, max_outlets, max_users, max_devices, features) VALUES
  ('starter',    'Starter',    1,    10,   3,    '{"inventory": false, "qr_ordering": false, "aggregators": false, "multi_outlet": false}'),
  ('growth',     'Growth',     3,    40,   10,   '{"inventory": true,  "qr_ordering": true,  "aggregators": false, "multi_outlet": true}'),
  ('enterprise', 'Enterprise', NULL, NULL, NULL, '{"inventory": true,  "qr_ordering": true,  "aggregators": true,  "multi_outlet": true}')
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Provision a new client: called by the Super Admin console (as pos_platform).
-- Creates the client (status pending), its settings, the four system roles
-- with their default permissions, payment methods, the country's taxes, a
-- first outlet with a cash counter and print settings, and the Administrator
-- (must change the password at first sign-in). Returns the new Client ID.
-- The API hashes the password (argon2id) before calling this.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.provision_tenant(
  p_name             text,
  p_business_type    text,
  p_country          char(2),
  p_outlet_name      text,
  p_admin_username   text,
  p_admin_pw_hash    text,
  p_admin_email      text,
  p_plan_code        text,
  p_created_by       bigint,
  p_currency         char(3) DEFAULT NULL,
  p_timezone         text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  c          platform.countries;
  v_tenant   bigint;
  v_outlet   bigint;
  v_role     bigint;
  v_admin    bigint;
  r          record;
  t          jsonb;
BEGIN
  SELECT * INTO c FROM platform.countries WHERE code = p_country;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown country %', p_country; END IF;

  INSERT INTO platform.tenants (name, business_type, country_code, currency_code, locale, timezone, plan_id, created_by)
  VALUES (p_name, p_business_type, p_country, coalesce(p_currency, c.default_currency), c.default_locale,
          coalesce(p_timezone, c.default_timezone),
          (SELECT id FROM platform.plans WHERE code = p_plan_code), p_created_by)
  RETURNING id INTO v_tenant;

  -- Everything below is client data: act as that client so RLS checks pass
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  INSERT INTO app.tenant_settings (tenant_id) VALUES (v_tenant);

  FOR r IN SELECT * FROM (VALUES
      ('administrator', 'Administrator', true),
      ('manager',       'Manager',       true),
      ('cashier',       'Cashier',       true),
      ('waiter',        'Waiter',        false)) AS x(key, name, can_login)
  LOOP
    INSERT INTO app.roles (tenant_id, key, name, can_login, is_system)
    VALUES (v_tenant, r.key, r.name, r.can_login, true) RETURNING id INTO v_role;

    INSERT INTO app.role_permissions (tenant_id, role_id, permission_key)
    SELECT v_tenant, v_role, p.key FROM platform.permissions p
    WHERE CASE r.key
      WHEN 'administrator' THEN true
      WHEN 'manager'       THEN NOT p.admin_only
      WHEN 'cashier'       THEN p.key IN ('bill.settle', 'bill.reprint')
      ELSE false
    END;

    IF r.key = 'administrator' THEN
      INSERT INTO app.users (tenant_id, username, email, first_name, role_id, password_hash, must_change_password)
      VALUES (v_tenant, p_admin_username, p_admin_email, 'Administrator', v_role, p_admin_pw_hash, true)
      RETURNING id INTO v_admin;
    END IF;
  END LOOP;

  INSERT INTO app.payment_methods (tenant_id, code, label, kind, needs_reference, opens_drawer, sort_order) VALUES
    (v_tenant, 'cash',       'Cash',       'cash',      false, true,  10),
    (v_tenant, 'card',       'Card',       'card',      true,  false, 20),
    (v_tenant, 'upi',        'UPI',        'wallet',    true,  false, 30),
    (v_tenant, 'credit_pay', 'Credit Pay', 'pay_later', false, false, 90);

  FOR t IN SELECT * FROM jsonb_array_elements(c.tax_template) LOOP
    INSERT INTO app.taxes (tenant_id, name, code, type, rate, reporting_code)
    VALUES (v_tenant, t->>'name', t->>'code', t->>'type', (t->>'rate')::numeric, t->>'reporting_code');
  END LOOP;

  INSERT INTO app.outlets (tenant_id, code, name, type)
  VALUES (v_tenant, 'MAIN', p_outlet_name, CASE WHEN p_business_type IN ('cafe','bar','qsr','bakery','cloud_kitchen') THEN p_business_type ELSE 'restaurant' END)
  RETURNING id INTO v_outlet;
  INSERT INTO app.cash_counters (tenant_id, outlet_id, name) VALUES (v_tenant, v_outlet, 'Counter 1');
  INSERT INTO app.print_settings (tenant_id, outlet_id, header)
  VALUES (v_tenant, v_outlet, jsonb_build_object('name', p_outlet_name));

  INSERT INTO platform.tenant_status_history (tenant_id, from_status, to_status, reason, changed_by)
  VALUES (v_tenant, NULL, 'pending', 'Created', p_created_by);
  INSERT INTO platform.platform_audit_log (platform_user_id, tenant_id, action, details)
  VALUES (p_created_by, v_tenant, 'tenant.create', jsonb_build_object('admin_username', p_admin_username, 'plan', p_plan_code));

  RETURN v_tenant;
END $$;

-- Activate / suspend / close a client. Suspending or closing also signs out
-- every user of that client (refresh tokens revoked).
CREATE OR REPLACE FUNCTION platform.set_tenant_status(
  p_tenant bigint, p_status text, p_reason text, p_changed_by bigint
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_from text;
BEGIN
  SELECT status INTO v_from FROM platform.tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown client %', p_tenant; END IF;
  IF v_from = p_status THEN RETURN; END IF;
  IF v_from = 'closed' THEN RAISE EXCEPTION 'Client % is closed', p_tenant; END IF;

  UPDATE platform.tenants SET
    status = p_status,
    activated_at = CASE WHEN p_status = 'active' THEN coalesce(activated_at, now()) ELSE activated_at END,
    suspended_at = CASE WHEN p_status = 'suspended' THEN now() WHEN p_status = 'active' THEN NULL ELSE suspended_at END,
    suspended_reason = CASE WHEN p_status = 'suspended' THEN p_reason WHEN p_status = 'active' THEN NULL ELSE suspended_reason END,
    closed_at = CASE WHEN p_status = 'closed' THEN now() ELSE closed_at END
  WHERE id = p_tenant;

  IF p_status IN ('suspended', 'closed') THEN
    PERFORM set_config('app.tenant_id', p_tenant::text, true);
    UPDATE app.auth_sessions SET revoked_at = now() WHERE tenant_id = p_tenant AND revoked_at IS NULL;
  END IF;

  INSERT INTO platform.tenant_status_history (tenant_id, from_status, to_status, reason, changed_by)
  VALUES (p_tenant, v_from, p_status, p_reason, p_changed_by);
  INSERT INTO platform.platform_audit_log (platform_user_id, tenant_id, action, details)
  VALUES (p_changed_by, p_tenant, 'tenant.' || p_status, jsonb_build_object('from', v_from, 'reason', p_reason));
END $$;

REVOKE ALL ON FUNCTION platform.provision_tenant FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.set_tenant_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.provision_tenant, platform.set_tenant_status TO pos_platform;
