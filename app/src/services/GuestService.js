/**
 * Guest ordering from a table's QR code (/api/guest/tables/<code>/). No sign-in, so this uses
 * fetch rather than ApiClient (which adds the staff token and signs out on 401).
 */
const BASE_URL = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:8001').replace(/\/+$/, '');

export class GuestApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GuestApiError';
    this.status = status;
    this.body = body || {};
  }
}

const request = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(`${BASE_URL}/api/guest/tables/${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch (error) {
    throw new GuestApiError('No connection. Check your internet and try again.', 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fieldMessage = Object.values(body.fields || {}).flat()[0];
    throw new GuestApiError(body.detail || fieldMessage || `Something went wrong (${response.status}).`, response.status, body);
  }
  return body;
};

const guestService = {
  getMenu: (code) => request(`${encodeURIComponent(code)}/`),
  placeOrder: (code, order) => request(`${encodeURIComponent(code)}/orders/`, { method: 'POST', body: JSON.stringify(order) }),
};

export default guestService;
