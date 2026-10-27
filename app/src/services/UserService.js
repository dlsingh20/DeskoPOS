import axios from 'axios';
import ApiClient from './ApiClient';
import { IS_DESKOPOS } from './backend';
import { POS_ROLES, encodeDepartment, canApprove, displayName, toGrantRevoke } from '../utils/posAccess';

const BASE = '/api/auth';

/**
 * A DeskoPOS /api/auth/me/ payload in the shape the app reads for hotel users:
 * `username` and `pos_access` ({role, permissions}); the client and outlets come along as they are.
 */
export const fromDeskoposMe = (me) => ({
  ...me,
  username: me.login_id,
  is_active: true,
  pos_access: { role: me.role?.key, permissions: me.permissions, can_login: true },
});

/**
 * A DeskoPOS user (GET /api/auth/users/) in the shape the Users & Roles screen reads:
 * `username`, `last_login` and `pos_access` with the effective permissions.
 */
export const fromDeskoposUser = (user) => ({
  ...user,
  username: user.login_id,
  last_login: user.last_login_at,
  pos_access: {
    role: user.role,
    permissions: user.permissions,
    can_login: user.can_login,
    restaurant_ids: user.outlet_ids?.length ? user.outlet_ids : null,
  },
});

/** Only the differences from the role's defaults */
const changedOverrides = (role, overrides = {}) => {
  const { grant, revoke } = toGrantRevoke(role, overrides);
  return Object.fromEntries([...grant.map((key) => [key, true]), ...revoke.map((key) => [key, false])]);
};

const toRelative = (next) => {
  const url = new URL(next, window.location.origin);
  return `${url.pathname}${url.search}`;
};

/** Field errors from a DRF response as one readable line */
export const describeApiError = (error, fallback = 'The request failed.') => {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;
  if (typeof data === 'string') return data.slice(0, 300);
  if (data.detail) return String(data.detail);
  const parts = [];
  const walk = (value, prefix) => {
    if (Array.isArray(value)) parts.push(`${prefix ? `${prefix}: ` : ''}${value.join(' ')}`);
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k === 'non_field_errors' ? prefix : k));
    else if (value) parts.push(`${prefix ? `${prefix}: ` : ''}${value}`);
  };
  walk(data, '');
  return parts.join(' · ') || fallback;
};

/**
 * Hotel user accounts, as used by the POS Users & Roles screen.
 */
class UserService {
  async getMe() {
    const response = await ApiClient.get(`${BASE}/me/`);
    return IS_DESKOPOS ? fromDeskoposMe(response.data) : response.data;
  }

  /** Own password (DeskoPOS); other devices are signed out */
  async changePassword(currentPassword, newPassword) {
    try {
      await ApiClient.post(`${BASE}/change-password/`, {
        current_password: currentPassword,
        new_password: newPassword,
      }, { skipAuthRedirect: true });
    } catch (error) {
      throw new Error(describeApiError(error, 'Could not change the password.'));
    }
  }

  /** Every user of the hotel (follows pagination) */
  async listUsers() {
    const users = [];
    let url = `${BASE}/users/?page_size=200`;
    for (let page = 0; url && page < 10; page += 1) {
      const response = await ApiClient.get(url);
      const data = response.data;
      users.push(...(Array.isArray(data) ? data : (data.results || [])));
      url = !Array.isArray(data) && data.next ? toRelative(data.next) : null;
    }
    return IS_DESKOPOS ? users.map(fromDeskoposUser) : users;
  }

  /**
   * @param {Object} form - { firstName, lastName, username, email, phone, role, password, overrides }
   */
  /**
   * Creates POS staff with their POS role in `pos_access`. Waiters get no password (can_login false).
   */
  async createUser(form) {
    const role = POS_ROLES[form.role];
    const password = role.canLogin ? form.password : null;
    if (IS_DESKOPOS) {
      const response = await ApiClient.post(`${BASE}/users/`, {
        login_id: form.username.trim(),
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim(),
        role: form.role,
        ...(password ? { password } : {}),
        permission_overrides: changedOverrides(form.role, form.overrides),
      });
      return fromDeskoposUser(response.data);
    }
    const hotel = parseInt(ApiClient.getHotelContext(), 10);
    const body = {
      username: form.username.trim(),
      email: form.email.trim(),
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      password,
      confirm_password: password,
      profile: {
        role: role.hotelRole,
        phone: form.phone.trim(),
        ...(Number.isFinite(hotel) ? { hotel } : {}),
      },
      pos_access: {
        role: form.role,
        permissions: toGrantRevoke(form.role, form.overrides),
      },
    };
    const response = await ApiClient.post(`${BASE}/users/`, body);
    return response.data;
  }

  /**
   * Name and contact changes (PATCH user), then role and access (PUT pos-access).
   * Older backends without pos-access get the role in the profile "department" text instead.
   */
  async updateUser(id, form) {
    if (IS_DESKOPOS) {
      const response = await ApiClient.patch(`${BASE}/users/${id}/`, {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim(),
        role: form.role,
        permission_overrides: changedOverrides(form.role, form.overrides),
      });
      return fromDeskoposUser(response.data);
    }
    const details = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      profile: { phone: form.phone.trim() },
    };
    await ApiClient.patch(`${BASE}/users/${id}/`, details);

    try {
      const response = await ApiClient.put(`${BASE}/users/${id}/pos-access/`, {
        role: form.role,
        permissions: toGrantRevoke(form.role, form.overrides),
      });
      return response.data;
    } catch (error) {
      if (![404, 405, 501].includes(error?.response?.status)) throw error;
      const role = POS_ROLES[form.role];
      const department = encodeDepartment(form.role, form.overrides);
      const response = await ApiClient.patch(`${BASE}/users/${id}/`, {
        role: role.hotelRole,
        department,
        profile: { role: role.hotelRole, department, phone: form.phone.trim() },
      });
      return response.data;
    }
  }

  async setActive(id, isActive) {
    const response = await ApiClient.post(`${BASE}/users/${id}/set_active/`, { is_active: isActive });
    return response.data;
  }

  async deleteUser(id) {
    await ApiClient.delete(`${BASE}/users/${id}/`);
  }

  /**
   * DeskoPOS: an Administrator sets a temporary password; the user must change it at the next
   * sign-in, and their open sessions end.
   */
  async setTemporaryPassword(id, password) {
    await ApiClient.post(`${BASE}/users/${id}/set-password/`, { password });
  }

  /** Emails the user a reset link (the server always answers 200) */
  async sendPasswordReset(usernameOrEmail) {
    await ApiClient.post(`${BASE}/password-reset/`, { email_or_username: usernameOrEmail });
  }

  /**
   * Manager approval through POST /api/pos/api/approvals/ (password or 4-6 digit PIN).
   * Returns a single-use approval_id for the follow-up request. Falls back to the
   * client-side check on backends without the endpoint.
   *
   * @param {Object} request - { username, secret, permission, orderId, context }
   * @returns {Promise<{id, name, username, approvalId}>}
   */
  async requestApproval({ username, secret, permission, orderId = null, context = {} }) {
    const send = (secretType) => ApiClient.post(`/api/pos/api/approvals/`, {
      permission,
      approver_username: username,
      approver_secret: secret,
      secret_type: secretType,
      order_id: orderId,
      context,
    }, { skipAuthRedirect: true });

    const looksLikePin = /^\d{4,6}$/.test(secret);
    let response;
    try {
      response = await send(looksLikePin ? 'pin' : 'password');
    } catch (error) {
      const status = error?.response?.status;
      if ([404, 405, 501].includes(status)) {
        const approver = await this.verifyApprover(username, secret, permission);
        return { ...approver, approvalId: null };
      }
      // A numeric password: try again as a password
      if (looksLikePin && (status === 400 || status === 401)) {
        try {
          response = await send('password');
        } catch (retryError) {
          throw new Error(describeApiError(retryError, 'Wrong username, password or PIN.'));
        }
      } else if (status === 401) {
        throw new Error('Wrong username, password or PIN.');
      } else {
        throw new Error(describeApiError(error, 'Could not check the approval.'));
      }
    }
    const data = response.data || {};
    return {
      id: data.approver?.id ?? null,
      name: data.approver?.name || username,
      username,
      approvalId: data.approval_id || null,
    };
  }

  /**
   * Checks a manager's credentials for an approval, without touching the signed-in session.
   * Uses a separate HTTP client so a wrong password does not log the cashier out.
   * Used only when the backend has no approvals endpoint.
   *
   * @returns {Promise<{id, name, username}>} the approver
   */
  async verifyApprover(username, password, permission) {
    const http = axios.create({ baseURL: ApiClient.baseURL, timeout: 20000, headers: { 'Content-Type': 'application/json' } });
    const hotel = ApiClient.getHotelContext();
    const headers = hotel ? { 'X-Hotel-Context': hotel } : {};

    let token;
    try {
      const response = await http.post(`${BASE}/token/`, { username, password }, { headers });
      token = response.data?.access;
    } catch (error) {
      if (error.response?.status === 400 || error.response?.status === 401) throw new Error('Wrong username or password.');
      throw new Error(describeApiError(error, 'Could not check the approval.'));
    }
    if (!token) throw new Error('Could not check the approval.');

    // Read the approver's own record (role and POS access) with their token
    const me = await http.get(`${BASE}/me/`, { headers: { ...headers, Authorization: `Bearer ${token}` } })
      .then((r) => r.data)
      .catch(() => null);
    if (!me) throw new Error('Could not read the approver\'s account.');
    if (!canApprove(me, permission)) throw new Error(`${displayName(me)} cannot approve this. A Manager or Administrator must approve.`);
    return { id: me.id, name: displayName(me), username: me.username };
  }
}

const userService = new UserService();
export default userService;
