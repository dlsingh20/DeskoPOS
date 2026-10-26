/**
 * Super Admin API client (/api/platform/...).
 * The token lives in sessionStorage: it lasts 60 minutes and ends with the tab.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001').replace(/\/$/, '');

const TOKEN_KEY = 'deskopos_admin_token';
const USER_KEY = 'deskopos_admin_user';

const store = {
  get(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, value); } catch { /* private mode: stays in memory only */ }
  },
  remove(key) {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};

let memoryToken = null;

export const session = {
  token: () => memoryToken || store.get(TOKEN_KEY),
  user: () => {
    try { return JSON.parse(store.get(USER_KEY) || 'null'); } catch { return null; }
  },
  save(token, user) {
    memoryToken = token;
    store.set(TOKEN_KEY, token);
    store.set(USER_KEY, JSON.stringify(user));
  },
  clear() {
    memoryToken = null;
    store.remove(TOKEN_KEY);
    store.remove(USER_KEY);
  },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.detail || `Request failed (${status})`);
    this.status = status;
    this.code = body?.code;
    this.fields = body?.fields || {};
  }
}

let unauthorizedHandler = () => {};
export const onUnauthorized = (fn) => { unauthorizedHandler = fn; };

export async function api(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = session.token();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { code: 'network', detail: `Can't reach the server at ${API_BASE}. Is it running?` });
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.status === 401 && token) {
    session.clear();
    unauthorizedHandler();
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

export const platform = {
  login: (email, password, totp) => api('/api/platform/auth/login/', { method: 'POST', body: { email, password, totp } }),
  tenants: (query) => api('/api/platform/tenants/', { query }),
  tenant: (id) => api(`/api/platform/tenants/${id}/`),
  createTenant: (body) => api('/api/platform/tenants/', { method: 'POST', body }),
  updateTenant: (id, body) => api(`/api/platform/tenants/${id}/`, { method: 'PATCH', body }),
  // action: activate | suspend | close
  setStatus: (id, action, reason = '') => api(`/api/platform/tenants/${id}/${action}/`, { method: 'POST', body: { reason } }),
  resetAdminPassword: (id, loginId, newPassword) => api(`/api/platform/tenants/${id}/reset-admin-password/`, {
    method: 'POST', body: { login_id: loginId, new_password: newPassword },
  }),
  loginIdAvailable: (loginId) => api('/api/platform/login-id-available/', { query: { login_id: loginId } }),
  plans: () => api('/api/platform/plans/'),
  countries: () => api('/api/platform/countries/'),
  audit: (query) => api('/api/platform/audit/', { query }),
};

/** Roles that may change clients; the others only read */
export const canManage = (user) => ['owner', 'admin'].includes(user?.role);
