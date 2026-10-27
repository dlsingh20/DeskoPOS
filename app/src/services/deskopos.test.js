/**
 * The app in DeskoPOS mode (REACT_APP_BACKEND=deskopos): sign-in user shape and token renewal.
 */
import { isManagedPosUser, resolveAccess } from '../utils/posAccess';

const ME = {
  id: 7,
  login_id: 'sg_cash',
  first_name: 'Ravi',
  last_name: '',
  role: { key: 'cashier', name: 'Cashier' },
  permissions: ['bill.settle', 'reports.view'],
  must_change_password: false,
  client: { id: 101, name: 'Spice Garden', currency: 'INR' },
  outlets: [{ id: 1, code: 'MAIN', name: 'Spice Garden Main' }],
};

/** Loads ApiClient fresh in DeskoPOS mode, answering requests with `respond(config)` */
const loadClient = (respond) => {
  let api;
  jest.isolateModules(() => {
    process.env.REACT_APP_BACKEND = 'deskopos';
    api = require('./ApiClient').default;
  });
  delete process.env.REACT_APP_BACKEND;
  const seen = [];
  api.client.defaults.adapter = async (config) => {
    seen.push(config);
    const [status, data] = respond(config);
    const response = { status, data, headers: {}, config, statusText: '' };
    if (status >= 400) {
      const error = new Error(`Request failed with status code ${status}`);
      error.config = config;
      error.response = response;
      throw error;
    }
    return response;
  };
  return { api, seen };
};

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('signed-in user', () => {
  it('reads role and permissions from the DeskoPOS payload', () => {
    const { fromDeskoposMe } = require('./UserService');
    const user = fromDeskoposMe(ME);
    expect(user.username).toBe('sg_cash');
    const access = resolveAccess(user);
    expect(access.role).toBe('cashier');
    expect(access.canLogin).toBe(true);
    expect([...access.permissions].sort()).toEqual(['bill.settle', 'reports.view']);
    expect(access.overrides).toEqual({ 'bill.reprint': false, 'reports.view': true });
  });

  it('gives Administrators everything, including user management', () => {
    const { fromDeskoposMe } = require('./UserService');
    const access = resolveAccess(fromDeskoposMe({ ...ME, role: { key: 'administrator' }, permissions: ['users.manage'] }));
    expect(access.role).toBe('administrator');
    expect(access.permissions.has('users.manage')).toBe(true);
    expect(access.permissions.has('settings.manage')).toBe(true);
  });
});

describe('ApiClient in DeskoPOS mode', () => {
  it('does not send the hotel header', async () => {
    localStorage.setItem('hotel_id', '1');
    localStorage.setItem('access_token', 'a1');
    const { api, seen } = loadClient(() => [200, ME]);
    await api.get('/api/auth/me/');
    expect(seen[0].headers['X-Hotel-Context']).toBeUndefined();
    expect(seen[0].headers.Authorization).toBe('Bearer a1');
  });

  it('renews an expired access token once and retries', async () => {
    localStorage.setItem('access_token', 'old');
    localStorage.setItem('refresh_token', 'r1');
    const { api, seen } = loadClient((config) => {
      if (config.url === '/api/auth/token/refresh/') return [200, { access: 'new', refresh: 'r2' }];
      return config.headers.Authorization === 'Bearer new' ? [200, ME] : [401, { code: 'token_expired' }];
    });
    const [a, b] = await Promise.all([api.get('/api/auth/me/'), api.get('/api/auth/users/')]);
    expect(a.data.login_id).toBe('sg_cash');
    expect(b.status).toBe(200);
    expect(seen.filter((c) => c.url === '/api/auth/token/refresh/')).toHaveLength(1);
    expect(JSON.parse(seen.find((c) => c.url === '/api/auth/token/refresh/').data)).toEqual({ refresh: 'r1' });
    expect(localStorage.getItem('access_token')).toBe('new');
    expect(localStorage.getItem('refresh_token')).toBe('r2');
  });

  it('signs out when the session cannot be renewed', async () => {
    localStorage.setItem('access_token', 'old');
    localStorage.setItem('refresh_token', 'revoked');
    const { api } = loadClient(() => [401, { code: 'session_revoked' }]);
    const signOut = jest.spyOn(api, 'handleAuthError').mockImplementation(() => {});
    await expect(api.get('/api/auth/me/')).rejects.toThrow('401');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('never renews for a wrong password at sign-in', async () => {
    localStorage.setItem('refresh_token', 'r1');
    const { api, seen } = loadClient(() => [401, { code: 'invalid_credentials', detail: 'Wrong login ID or password.' }]);
    await expect(api.login('sg_cash', 'nope')).rejects.toThrow('401');
    expect(seen).toHaveLength(1);
  });
});

describe('shared print settings', () => {
  const { defaultPrintSettings, fromServerPrintSettings, toServerPrintSettings } = require('./PrintSettingsService');

  test('round-trip through the server body keeps the settings and this device\'s QR options', () => {
    const local = { ...defaultPrintSettings('IN'), qrOrders: { mode: 'accept', handleOnThisDevice: true, sound: false } };
    const edited = {
      ...local,
      billFormat: 'thermal58',
      kotCopies: 2,
      header: { ...local.header, name: 'Spice Garden', taxId: '29ABCDE1234F1Z5', licence: '11223344556677' },
    };
    const body = toServerPrintSettings(edited);
    expect(body).toMatchObject({ bill_format: 'thermal58', kot_copies: 2, header: { tax_id: '29ABCDE1234F1Z5', tax_id_label: 'GSTIN' } });
    expect(body.qr_orders_mode).toBeUndefined();
    expect(fromServerPrintSettings({ ...body, saved: true }, local)).toEqual(edited);
  });

  test('a server body without tax labels keeps the device\'s labels', () => {
    const local = defaultPrintSettings('AE');
    const body = { ...toServerPrintSettings(local), tax: null };
    expect(fromServerPrintSettings(body, local).tax).toEqual(local.tax);
  });
});

describe('Users & Roles', () => {
  const SERVER_USER = {
    id: 9, login_id: 'sg_cash', first_name: 'Asha', last_name: '', email: null, phone: '', role: 'cashier',
    is_active: true, last_login_at: null, can_login: true, outlet_ids: [],
    permission_overrides: { 'reports.view': true, 'bill.reprint': false }, permissions: ['bill.settle', 'reports.view'],
  };

  /** UserService and ApiClient loaded together in DeskoPOS mode */
  const loadUsers = (respond) => {
    let api;
    let users;
    jest.isolateModules(() => {
      process.env.REACT_APP_BACKEND = 'deskopos';
      api = require('./ApiClient').default;
      users = require('./UserService').default;
    });
    delete process.env.REACT_APP_BACKEND;
    const seen = [];
    api.client.defaults.adapter = async (config) => {
      seen.push({ ...config, body: config.data ? JSON.parse(config.data) : null });
      return { status: 200, data: respond(config), headers: {}, config, statusText: '' };
    };
    return { users, seen };
  };

  it('lists users with their role and access changes', async () => {
    localStorage.setItem('access_token', 'a1');
    const { users } = loadUsers(() => ({ count: 1, next: null, results: [SERVER_USER] }));
    const [user] = await users.listUsers();
    const access = resolveAccess(user);
    expect(user.username).toBe('sg_cash');
    expect(access.role).toBe('cashier');
    expect(access.overrides).toEqual({ 'bill.reprint': false, 'reports.view': true });
    expect(isManagedPosUser(user)).toBe(true);
  });

  it('creates and edits users in the service\'s format', async () => {
    localStorage.setItem('access_token', 'a1');
    const { users, seen } = loadUsers(() => SERVER_USER);
    const form = {
      firstName: ' Asha ', lastName: '', username: 'sg_cash', email: '', phone: '', role: 'cashier',
      password: 'Cashier-pass-1', overrides: { 'reports.view': true, 'bill.reprint': false, 'bill.settle': true },
    };
    await users.createUser(form);
    expect(seen[0].body).toEqual({
      login_id: 'sg_cash', first_name: 'Asha', last_name: '', email: null, phone: '', role: 'cashier',
      password: 'Cashier-pass-1', permission_overrides: { 'reports.view': true, 'bill.reprint': false },
    });

    await users.createUser({ ...form, username: 'sg_wait', role: 'waiter', overrides: {} });
    expect(seen[1].body.password).toBeUndefined();

    await users.updateUser(9, { ...form, role: 'manager', email: 'a@spice.example', overrides: {} });
    expect(seen[2].method).toBe('patch');
    expect(seen[2].url).toBe('/api/auth/users/9/');
    expect(seen[2].body).toMatchObject({ role: 'manager', email: 'a@spice.example', permission_overrides: {} });

    await users.setTemporaryPassword(9, 'Temp-pass-77');
    expect(seen[3].url).toBe('/api/auth/users/9/set-password/');
    expect(seen[3].body).toEqual({ password: 'Temp-pass-77' });
  });
});

describe('numbered KOTs', () => {
  const { buildKOTData } = require('../utils/fineDineUtils');
  const { buildKotModel, renderKotHtml } = require('../utils/printTemplates');
  const ORDER = { id: 5, order_number: '261027001', table_number: '4', type: 'dine_in', restaurant: 1, status: 'confirmed' };

  it('prints the KOT number when every line is on the same KOT', () => {
    const order = { ...ORDER, items: [
      { id: 1, menu_item_name: 'Paneer Tikka', quantity: 1, kot_number: 1, status: 'pending' },
      { id: 2, menu_item_name: 'Butter Naan', quantity: 4, kot_number: 2, status: 'pending' },
    ] };
    expect(buildKOTData(order).kotNumber).toBeNull();
    expect(buildKOTData(order, [order.items[1]]).kotNumber).toBe(2);
    const added = buildKOTData(order, [{ menu_item_name: 'Lassi', quantity: 2 }], 3);
    expect(added.kotNumber).toBe(3);
    expect(renderKotHtml([buildKotModel(added)])).toContain('KOT #3 - NEW ITEMS');
  });

  it('asks the service for the next KOT, and treats "nothing to send" as no KOT', async () => {
    localStorage.setItem('access_token', 'a1');
    let api;
    let orders;
    jest.isolateModules(() => {
      process.env.REACT_APP_BACKEND = 'deskopos';
      api = require('./ApiClient').default;
      orders = require('./OrderService').default;
    });
    delete process.env.REACT_APP_BACKEND;
    const answers = [
      [200, { order_id: 5, kot_number: 2, items: [{ id: 2, menu_item_name: 'Butter Naan', quantity: 4 }] }],
      [409, { code: 'nothing_to_send', detail: 'There are no new items to send to the kitchen.' }],
    ];
    const seen = [];
    api.client.defaults.adapter = async (config) => {
      seen.push(config);
      const [status, data] = answers.shift();
      const response = { status, data, headers: {}, config, statusText: '' };
      if (status >= 400) throw Object.assign(new Error('failed'), { config, response });
      return response;
    };
    expect((await orders.sendKot(5)).kot_number).toBe(2);
    expect(seen[0].url).toBe('/api/pos/api/orders/5/send_kot/');
    expect(await orders.sendKot(5)).toBeNull();
  });
});

describe('refunds in History', () => {
  const { classifyBill, summarizeBills } = require('../utils/historyUtils');
  const { refundablePayments } = require('../utils/refunds');
  const BILL = {
    id: 8, order_number: '261027004', status: 'completed', total_amount: '1242.00', subtotal: '1100.00', tax_amount: '142.00',
    closed_at: '2026-10-27T10:00:00Z',
    payments: [
      { id: 1, method: 'cash', amount: '1000.00', refunded_amount: '500.00', status: 'partially_refunded' },
      { id: 2, method: 'credit_card', amount: '242.00', refunded_amount: '242.00', status: 'refunded' },
    ],
    refunds: [{ id: 1, credit_note_number: 'CN/MAIN/26-27/000001', amount: '742.00', reason: 'service' }],
  };

  it('keeps a part-refunded bill paid and shows the refund on its own', () => {
    const bill = classifyBill(BILL);
    expect(bill.state).toBe('paid');
    expect(bill.paid).toBe(1242);
    expect(bill.balance).toBe(0);
    expect(bill.refunded).toBe(742);
    const summary = summarizeBills([bill]);
    expect(summary.partRefunds).toBe(742);
    expect(summary.total).toBe(1242);
  });

  it('offers only what is left on cash, card and UPI payments', () => {
    const left = refundablePayments([
      ...BILL.payments,
      { id: 3, method: 'mobile_payment', amount: '100.00', refunded_amount: '0.00', status: 'completed' },
      { id: 4, method: 'room_charge', amount: '50.00', refunded_amount: '0.00', status: 'completed' },
    ]);
    expect(left.map((p) => [p.payment.id, p.left])).toEqual([[1, 500], [3, 100]]);
  });

  it('leaves older payments without a refunded amount as before', () => {
    const bill = classifyBill({ ...BILL, payments: [{ id: 1, method: 'cash', amount: '1242.00', status: 'completed' }], refunds: undefined });
    expect([bill.state, bill.paid, bill.refunded]).toEqual(['paid', 1242, 0]);
  });
});
