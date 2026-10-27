/**
 * POS roles and permissions.
 *
 * Accounts are the hotel's users (/api/auth/users/). The server has no POS roles yet, so the
 * POS role and any per-user access changes are stored in the profile's `department` field:
 *
 *   "POS Cashier"                  - role defaults
 *   "POS Cashier [+rp,-rb]"        - defaults plus reports, minus reprint
 *
 * The hotel `role` is set alongside it (manager for POS Managers, front_desk_agent otherwise).
 * Hotel admins are POS Administrators. This is enforced only in the app until the backend
 * adds POS roles and checks them on each endpoint (see docs/USERS_AND_ROLES.md).
 */

export const POS_ROLES = {
  administrator: { key: 'administrator', label: 'Administrator', canLogin: true, hotelRole: 'admin', managed: false },
  manager: { key: 'manager', label: 'Manager', canLogin: true, hotelRole: 'manager', managed: true },
  cashier: { key: 'cashier', label: 'Cashier', canLogin: true, hotelRole: 'front_desk_agent', managed: true },
  waiter: { key: 'waiter', label: 'Waiter', canLogin: false, hotelRole: 'front_desk_agent', managed: true },
};

/** Roles an Administrator can create and edit in the POS */
export const MANAGED_ROLES = ['manager', 'cashier', 'waiter'];

/**
 * Permission catalogue. `code` is the short form stored in the department field.
 * `approvable`: a user without it can still go ahead with a manager's approval.
 */
export const PERMISSIONS = [
  { key: 'bill.settle', code: 'st', group: 'Billing', label: 'Settle bills', approvable: false },
  { key: 'bill.reprint', code: 'rb', group: 'Billing', label: 'Reprint bills', approvable: false },
  { key: 'bill.refund', code: 'rf', group: 'Billing', label: 'Refund paid bills', approvable: true },
  { key: 'discount.unlimited', code: 'du', group: 'Billing', label: 'Discounts above the cashier limit', approvable: true },
  { key: 'payment.credit', code: 'cp', group: 'Billing', label: 'Credit Pay (bill to be paid later)', approvable: true },
  { key: 'order.void_items', code: 'vi', group: 'Orders', label: 'Reduce or remove items already sent to the kitchen', approvable: true },
  { key: 'history.full', code: 'hf', group: 'History & reports', label: 'Full history (any date)', approvable: false },
  { key: 'history.export', code: 'hx', group: 'History & reports', label: 'Export history to Excel', approvable: false },
  { key: 'reports.view', code: 'rp', group: 'History & reports', label: 'Reports', approvable: false },
  { key: 'settings.manage', code: 'sm', group: 'Setup', label: 'Tables, menu and print settings', approvable: false },
];

/** Only Administrators; never granted through per-user changes */
export const ADMIN_ONLY = ['users.manage'];

const ALL = PERMISSIONS.map((p) => p.key);

export const ROLE_DEFAULTS = {
  administrator: [...ALL, ...ADMIN_ONLY],
  manager: [...ALL],
  cashier: ['bill.settle', 'bill.reprint'],
  waiter: [],
};

/** Highest discount a user without `discount.unlimited` may give without approval */
export const CASHIER_DISCOUNT_LIMIT = (() => {
  const value = parseFloat(process.env.REACT_APP_CASHIER_DISCOUNT_LIMIT);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 10;
})();

export const DEPARTMENT_MAX_LENGTH = 100;
const PREFIX = 'POS ';
const byCode = new Map(PERMISSIONS.map((p) => [p.code, p.key]));
const byKey = new Map(PERMISSIONS.map((p) => [p.key, p.code]));

/**
 * Department text for a POS role plus per-user changes.
 * @param {string} role - manager | cashier | waiter
 * @param {Object} overrides - { [permissionKey]: true | false }, only differences from the defaults are kept
 */
export const encodeDepartment = (role, overrides = {}) => {
  const info = POS_ROLES[role];
  if (!info || !info.managed) throw new Error(`Unknown POS role: ${role}`);
  const defaults = new Set(ROLE_DEFAULTS[role]);
  const changes = Object.entries(overrides)
    .filter(([key, value]) => byKey.has(key) && value !== defaults.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${value ? '+' : '-'}${byKey.get(key)}`);
  return `${PREFIX}${info.label}${changes.length ? ` [${changes.join(',')}]` : ''}`;
};

/** Parses department text; null when it is not a POS role */
export const parseDepartment = (department) => {
  const match = /^POS (Manager|Cashier|Waiter)(?:\s*\[([^\]]*)\])?\s*$/i.exec(String(department || '').trim());
  if (!match) return null;
  const role = match[1].toLowerCase();
  const overrides = {};
  (match[2] || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((token) => {
    const key = byCode.get(token.slice(1));
    if (key && (token[0] === '+' || token[0] === '-')) overrides[key] = token[0] === '+';
  });
  return { role, overrides };
};

const profileField = (user, field) => user?.[field] ?? user?.profile?.[field] ?? '';

/** POS access block from the server (`pos_access` on the user), parsed when sent as a JSON string */
export const getPosAccess = (user) => {
  let value = user?.pos_access ?? user?.profile?.pos_access ?? null;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (error) {
      value = null;
    }
  }
  return value && typeof value === 'object' && POS_ROLES[value.role] ? value : null;
};

const KNOWN = new Set(PERMISSIONS.map((p) => p.key));

/**
 * Effective POS access for a hotel user.
 * Source, in order: hotel admin -> Administrator; the server's `pos_access`; the older
 * "POS Cashier [..]" department text; otherwise hotel managers as Manager, everyone else as Cashier.
 */
export const resolveAccess = (user) => {
  if (!user) return null;
  const hotelRole = profileField(user, 'role');
  const server = getPosAccess(user);
  const parsed = server ? null : parseDepartment(profileField(user, 'department'));

  let role;
  let overrides = {};
  let assigned = true;
  let permissions;
  let serverLimit = null;
  if (hotelRole === 'admin' || user.is_superuser || server?.role === 'administrator') {
    role = 'administrator';
    permissions = new Set(ROLE_DEFAULTS.administrator);
  } else if (server) {
    role = server.role;
    const defaults = new Set(ROLE_DEFAULTS[role]);
    permissions = new Set((Array.isArray(server.permissions) ? server.permissions : ROLE_DEFAULTS[role]).filter((k) => KNOWN.has(k)));
    KNOWN.forEach((key) => {
      if (permissions.has(key) !== defaults.has(key)) overrides[key] = permissions.has(key);
    });
    const limit = parseFloat(server.discount_limit_percent);
    serverLimit = Number.isFinite(limit) ? limit : null;
  } else {
    if (parsed) ({ role, overrides } = parsed);
    else {
      assigned = false;
      role = ['manager', 'finance_manager'].includes(hotelRole) ? 'manager' : 'cashier';
    }
    permissions = new Set(ROLE_DEFAULTS[role]);
    if (role !== 'administrator') {
      Object.entries(overrides).forEach(([key, value]) => (value ? permissions.add(key) : permissions.delete(key)));
    }
  }

  return {
    role,
    roleLabel: POS_ROLES[role].label,
    canLogin: POS_ROLES[role].canLogin && server?.can_login !== false && user.is_active !== false,
    assigned,
    overrides,
    permissions,
    restaurantIds: Array.isArray(server?.restaurant_ids) ? server.restaurant_ids : null,
    discountLimit: permissions.has('discount.unlimited') ? 100 : (serverLimit ?? CASHIER_DISCOUNT_LIMIT),
    source: server ? 'server' : parsed ? 'department' : 'default',
  };
};

/** Permission changes from a role's defaults, in the pos-access API shape */
export const toGrantRevoke = (role, overrides = {}) => {
  const defaults = new Set(ROLE_DEFAULTS[role] || []);
  const grant = [];
  const revoke = [];
  Object.entries(overrides).forEach(([key, value]) => {
    if (!KNOWN.has(key)) return;
    if (value && !defaults.has(key)) grant.push(key);
    if (!value && defaults.has(key)) revoke.push(key);
  });
  return { grant: grant.sort(), revoke: revoke.sort() };
};

/** Whether this user may approve an action that needs `permission` */
export const canApprove = (user, permission) => {
  const access = resolveAccess(user);
  return !!access && access.canLogin && ['administrator', 'manager'].includes(access.role) && access.permissions.has(permission);
};

/** True when a hotel user is POS staff that the POS manages (not hotel staff, not admins) */
export const isManagedPosUser = (user) => profileField(user, 'role') !== 'admin'
  && (MANAGED_ROLES.includes(getPosAccess(user)?.role) || !!parseDepartment(profileField(user, 'department')));

export const displayName = (user) => [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.username || '';

/**
 * Start of the History window for users without full history:
 * the last cash counter close if it happened today, otherwise the start of today.
 * @param {Date} todayStart - start of today in the restaurant's time zone
 * @param {string|null} lastClosedAt - closed_at of the last closed cash register
 */
export const restrictedHistoryStart = (todayStart, lastClosedAt, now = new Date()) => {
  const closed = lastClosedAt ? new Date(lastClosedAt) : null;
  if (closed && !Number.isNaN(closed.getTime()) && closed > todayStart && closed <= now) return closed;
  return todayStart;
};
