import { getPosAccess, toGrantRevoke } from './posAccess';
import {
  CASHIER_DISCOUNT_LIMIT,
  DEPARTMENT_MAX_LENGTH,
  PERMISSIONS,
  canApprove,
  encodeDepartment,
  isManagedPosUser,
  parseDepartment,
  resolveAccess,
  restrictedHistoryStart,
} from './posAccess';

const user = (role, department = '', extra = {}) => ({ id: 1, username: 'u', role, department, is_active: true, ...extra });

describe('department encoding', () => {
  test('role only, and changes from the role defaults', () => {
    expect(encodeDepartment('cashier')).toBe('POS Cashier');
    expect(encodeDepartment('cashier', { 'reports.view': true, 'bill.reprint': false })).toBe('POS Cashier [-rb,+rp]');
    // Values equal to the defaults are not stored
    expect(encodeDepartment('cashier', { 'bill.settle': true })).toBe('POS Cashier');
    expect(() => encodeDepartment('administrator')).toThrow();
  });

  test('round trip and tolerant parsing', () => {
    const text = encodeDepartment('manager', { 'history.export': false });
    expect(parseDepartment(text)).toEqual({ role: 'manager', overrides: { 'history.export': false } });
    expect(parseDepartment('pos waiter')).toEqual({ role: 'waiter', overrides: {} });
    expect(parseDepartment('POS Cashier [+xx,+rp,bad]')).toEqual({ role: 'cashier', overrides: { 'reports.view': true } });
    expect(parseDepartment('Front Office')).toBeNull();
    expect(parseDepartment('')).toBeNull();
  });

  test('every permission granted still fits the department field', () => {
    const all = Object.fromEntries(PERMISSIONS.map((p) => [p.key, true]));
    expect(encodeDepartment('waiter', all).length).toBeLessThanOrEqual(DEPARTMENT_MAX_LENGTH);
  });
});

describe('resolveAccess', () => {
  test('hotel admin is Administrator with user management', () => {
    const a = resolveAccess(user('admin'));
    expect(a.role).toBe('administrator');
    expect(a.permissions.has('users.manage')).toBe(true);
    expect(a.discountLimit).toBe(100);
  });

  test('Manager has everything except user management', () => {
    const a = resolveAccess(user('manager', 'POS Manager'));
    expect(a.role).toBe('manager');
    expect(PERMISSIONS.every((p) => a.permissions.has(p.key))).toBe(true);
    expect(a.permissions.has('users.manage')).toBe(false);
  });

  test('Cashier defaults, limit and overrides', () => {
    const a = resolveAccess(user('front_desk_agent', 'POS Cashier'));
    expect([...a.permissions].sort()).toEqual(['bill.reprint', 'bill.settle']);
    expect(a.discountLimit).toBe(CASHIER_DISCOUNT_LIMIT);
    const b = resolveAccess(user('front_desk_agent', 'POS Cashier [+du,-rb]'));
    expect(b.permissions.has('discount.unlimited')).toBe(true);
    expect(b.permissions.has('bill.reprint')).toBe(false);
    expect(b.discountLimit).toBe(100);
  });

  test('overrides can never grant user management', () => {
    const a = resolveAccess(user('manager', 'POS Manager [+um]'));
    expect(a.permissions.has('users.manage')).toBe(false);
  });

  test('Waiters and deactivated users cannot sign in', () => {
    expect(resolveAccess(user('front_desk_agent', 'POS Waiter')).canLogin).toBe(false);
    expect(resolveAccess(user('front_desk_agent', 'POS Cashier', { is_active: false })).canLogin).toBe(false);
  });

  test('hotel staff without a POS role keep working (managers as Manager, others as Cashier)', () => {
    expect(resolveAccess(user('manager', 'Front Office'))).toMatchObject({ role: 'manager', assigned: false });
    expect(resolveAccess(user('front_desk_agent', ''))).toMatchObject({ role: 'cashier', assigned: false });
  });

  test('profile fields are read when not flattened', () => {
    expect(resolveAccess({ id: 2, profile: { role: 'front_desk_agent', department: 'POS Manager' } }).role).toBe('manager');
  });
});

describe('approvals and management', () => {
  test('only active Managers / Administrators with the permission can approve', () => {
    expect(canApprove(user('manager', 'POS Manager'), 'discount.unlimited')).toBe(true);
    expect(canApprove(user('admin'), 'payment.credit')).toBe(true);
    expect(canApprove(user('front_desk_agent', 'POS Cashier [+du]'), 'discount.unlimited')).toBe(false);
    expect(canApprove(user('manager', 'POS Manager [-cp]'), 'payment.credit')).toBe(false);
    expect(canApprove(user('manager', 'POS Manager', { is_active: false }), 'discount.unlimited')).toBe(false);
  });

  test('the POS manages POS staff only', () => {
    expect(isManagedPosUser(user('front_desk_agent', 'POS Cashier'))).toBe(true);
    expect(isManagedPosUser(user('housekeeper', 'Housekeeping'))).toBe(false);
    expect(isManagedPosUser(user('admin', 'POS Manager'))).toBe(false);
  });
});

describe('restricted history window', () => {
  const todayStart = new Date('2026-10-11T18:30:00Z');
  test('starts at the last cash counter close when it was today', () => {
    const now = new Date('2026-10-12T05:00:00Z');
    expect(restrictedHistoryStart(todayStart, '2026-10-12T02:00:00Z', now).toISOString()).toBe('2026-10-12T02:00:00.000Z');
    // A close time in the future (clock skew) is ignored
    expect(restrictedHistoryStart(todayStart, '2026-10-12T09:00:00Z', now)).toBe(todayStart);
  });
  test('falls back to the start of today', () => {
    expect(restrictedHistoryStart(todayStart, '2026-10-10T20:00:00Z')).toBe(todayStart);
    expect(restrictedHistoryStart(todayStart, null)).toBe(todayStart);
    expect(restrictedHistoryStart(todayStart, 'not a date')).toBe(todayStart);
  });
});

describe('server pos_access', () => {
  test('pos_access wins over the department text', () => {
    const a = resolveAccess({ id: 3, role: 'front_desk_agent', department: 'POS Manager', pos_access: { role: 'cashier', can_login: true, permissions: ['bill.settle', 'reports.view'], discount_limit_percent: '15.00', restaurant_ids: [3] } });
    expect(a).toMatchObject({ role: 'cashier', source: 'server', discountLimit: 15, restaurantIds: [3] });
    expect(a.overrides).toEqual({ 'bill.reprint': false, 'reports.view': true });
  });

  test('JSON string, waiter, unknown keys and administrator', () => {
    expect(getPosAccess({ pos_access: '{"role":"waiter","can_login":false,"permissions":[]}' })).toMatchObject({ role: 'waiter' });
    expect(resolveAccess({ id: 1, pos_access: { role: 'waiter', can_login: false } }).canLogin).toBe(false);
    expect(resolveAccess({ id: 1, pos_access: { role: 'manager', permissions: ['users.manage', 'reports.view'] } }).permissions.has('users.manage')).toBe(false);
    expect(resolveAccess({ id: 1, pos_access: { role: 'administrator' } }).permissions.has('users.manage')).toBe(true);
    expect(getPosAccess({ pos_access: 'not json' })).toBeNull();
  });

  test('managed users found by pos_access', () => {
    expect(isManagedPosUser({ role: 'front_desk_agent', pos_access: { role: 'waiter' } })).toBe(true);
    expect(isManagedPosUser({ role: 'housekeeper', pos_access: null })).toBe(false);
  });

  test('grant / revoke from per-user changes', () => {
    expect(toGrantRevoke('cashier', { 'reports.view': true, 'bill.reprint': false, 'bill.settle': true, 'users.manage': true }))
      .toEqual({ grant: ['reports.view'], revoke: ['bill.reprint'] });
  });
});
