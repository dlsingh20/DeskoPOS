import ApiClient from './ApiClient';

// Roles / departments that usually receive table tips; listed first in pickers
const WAITER_PATTERN = /waiter|server|steward|captain|f\s*&\s*b|food|restaurant|service/i;

const toRelative = (next) => {
  const url = new URL(next, window.location.origin);
  return `${url.pathname}${url.search}`;
};

/**
 * Staff Service - POS staff (waiter / tip attribution, server names in History and Reports).
 *
 * Reads GET /api/pos/api/staff/?active=all, which cashiers can read. Older backends fall back to
 * /api/auth/users/ (often admin-only).
 */
class StaffService {
  constructor() {
    this.cache = null;
  }

  async _loadAll() {
    const people = [];
    try {
      let url = '/api/pos/api/staff/?active=all&page_size=500';
      for (let page = 0; url && page < 10; page += 1) {
        const response = await ApiClient.get(url);
        const data = response.data;
        people.push(...(Array.isArray(data) ? data : (data.results || [])));
        url = !Array.isArray(data) && data.next ? toRelative(data.next) : null;
      }
      return people.map((p) => ({
        id: p.id,
        name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.username || `Staff #${p.id}`,
        role: p.role || p.pos_role || '',
        isActive: p.is_active !== false,
      }));
    } catch (error) {
      if (![404, 405, 501].includes(error?.response?.status)) throw error;
    }

    let url = '/api/auth/users/?page_size=200';
    for (let page = 0; url && page < 5; page += 1) {
      const response = await ApiClient.get(url);
      const data = response.data;
      people.push(...(Array.isArray(data) ? data : (data.results || [])));
      url = !Array.isArray(data) && data.next ? toRelative(data.next) : null;
    }
    return people.map((user) => ({
      id: user.id,
      name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username,
      role: user.role || user.profile?.role || user.department || user.profile?.department || '',
      isActive: user.is_active !== false,
    }));
  }

  /**
   * Everyone, including staff who left (for names on old bills).
   * @returns {Promise<Array<{id, name, role, isActive, isWaiter}>>}
   */
  async getAllStaff({ forceRefresh = false } = {}) {
    if (this.cache && !forceRefresh) return this.cache;
    const people = await this._loadAll();
    this.cache = people
      .map((p) => ({ ...p, isWaiter: WAITER_PATTERN.test(p.role) }))
      .sort((a, b) => (b.isWaiter - a.isWaiter) || a.name.localeCompare(b.name));
    return this.cache;
  }

  /**
   * Active staff, waiters first (pickers).
   * @returns {Promise<Array<{id, name, role, isWaiter}>>}
   */
  async getActiveStaff(options = {}) {
    return (await this.getAllStaff(options)).filter((p) => p.isActive);
  }
}

const staffService = new StaffService();
export default staffService;
