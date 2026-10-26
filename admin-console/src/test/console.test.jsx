import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { session } from '../api';
import { suggestPrefix } from '../pages/NewClientPage';
import { generatePassword } from '../format';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const COUNTRIES = [
  { code: 'IN', name: 'India', default_currency: 'INR', default_timezone: 'Asia/Kolkata', tax_template: [{ name: 'CGST', rate: 2.5 }] },
  { code: 'AE', name: 'United Arab Emirates', default_currency: 'AED', default_timezone: 'Asia/Dubai', tax_template: [{ name: 'VAT', rate: 5 }] },
];
const PLANS = [{ code: 'growth', name: 'Growth', is_active: true }];

function routes(overrides = {}) {
  const calls = [];
  global.fetch = vi.fn((url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || 'GET'} ${u.pathname}`;
    calls.push({ key, url: u, body: init.body ? JSON.parse(init.body) : undefined });
    if (overrides[key]) return overrides[key](u, init);
    if (key === 'GET /api/platform/countries/') return json(200, COUNTRIES);
    if (key === 'GET /api/platform/plans/') return json(200, PLANS);
    if (key === 'GET /api/platform/tenants/') return json(200, { count: 0, results: [] });
    if (key === 'GET /api/platform/login-id-available/') {
      return json(200, { login_id: u.searchParams.get('login_id'), valid: true, available: true });
    }
    return json(404, { detail: 'not mocked' });
  });
  return calls;
}

const renderApp = (path = '/') => render(
  <ChakraProvider>
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>
  </ChakraProvider>,
);

const signedIn = () => session.save('token', { id: 1, email: 'owner@appdesko.com', name: 'Owner', role: 'owner' });

beforeEach(() => session.clear());

describe('sign-in', () => {
  it('shows one message for any wrong credential and clears the code', async () => {
    routes({ 'POST /api/platform/auth/login/': () => json(401, { code: 'invalid_credentials', detail: 'x' }) });
    renderApp();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'owner@appdesko.com');
    await user.type(screen.getByLabelText(/^password/i), 'wrong');
    const code = screen.getByLabelText(/authenticator code/i);
    await user.type(code, '12a3456');
    expect(code).toHaveValue('123456');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Wrong email, password or authenticator code.')).toBeInTheDocument();
    expect(code).toHaveValue('');
  });

  it('opens the client list after signing in', async () => {
    routes({
      'POST /api/platform/auth/login/': () => json(200, { access: 'tok', user: { id: 1, email: 'o@a.com', name: 'Owner', role: 'owner' } }),
    });
    renderApp();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'o@a.com');
    await user.type(screen.getByLabelText(/^password/i), 'pw');
    await user.type(screen.getByLabelText(/authenticator code/i), '123456');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('No clients yet. Create the first one.')).toBeInTheDocument();
    expect(session.token()).toBe('tok');
  });
});

describe('new client', () => {
  it('fills the outlet, prefix and login ID from the name and sends the form', async () => {
    signedIn();
    const calls = routes({
      'POST /api/platform/tenants/': () => json(201, { id: 101, name: 'Spice Garden', status: 'pending' }),
    });
    renderApp('/clients/new');
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'India' });
    await user.type(screen.getByLabelText(/business name/i), 'Spice Garden');
    expect(screen.getByLabelText(/first outlet name/i)).toHaveValue('Spice Garden');
    expect(screen.getByLabelText(/login prefix/i)).toHaveValue('sg');
    expect(screen.getByLabelText(/^login id/i)).toHaveValue('sg_admin');
    expect(screen.getByText(/INR · Asia\/Kolkata · Taxes: CGST 2.5%/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create client/i }));
    expect(await screen.findByText(/Enter a valid email/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/administrator email/i), 'admin@spice.example');
    await waitFor(() => expect(screen.getByText('Available.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /create client/i }));

    expect(await screen.findByText('Spice Garden created')).toBeInTheDocument();
    const sent = calls.find((c) => c.key === 'POST /api/platform/tenants/').body;
    expect(sent).toMatchObject({
      name: 'Spice Garden', country: 'IN', plan: 'growth', outlet_name: 'Spice Garden', login_prefix: 'sg',
      admin_login_id: 'sg_admin', admin_email: 'admin@spice.example',
    });
    expect(screen.getByText(sent.admin_password)).toBeInTheDocument();
  });

  it('blocks a login ID another client uses', async () => {
    signedIn();
    routes({
      'GET /api/platform/login-id-available/': (u) => json(200, { login_id: u.searchParams.get('login_id'), valid: true, available: false }),
    });
    renderApp('/clients/new');
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'India' });
    await user.type(screen.getByLabelText(/business name/i), 'Spice Garden');
    await user.type(screen.getByLabelText(/administrator email/i), 'admin@spice.example');
    await new Promise((r) => { setTimeout(r, 450); });
    await user.click(screen.getByRole('button', { name: /create client/i }));
    expect(await screen.findByText('This login ID is already used by a client.')).toBeInTheDocument();
  });

  it('shows the server field errors', async () => {
    signedIn();
    routes({
      'POST /api/platform/tenants/': () => json(400, { code: 'invalid', detail: 'Invalid input.', fields: { login_prefix: ['Another client already uses this prefix.'] } }),
    });
    renderApp('/clients/new');
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'India' });
    await user.type(screen.getByLabelText(/business name/i), 'Spice Garden');
    await user.type(screen.getByLabelText(/administrator email/i), 'admin@spice.example');
    await waitFor(() => expect(screen.getByText('Available.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /create client/i }));
    expect(await screen.findByText('Another client already uses this prefix.')).toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('suggests a prefix from the name', () => {
    expect(suggestPrefix('Spice Garden')).toBe('sg');
    expect(suggestPrefix('Brewhouse')).toBe('brewho');
    expect(suggestPrefix("Joe's Cafe & Bar")).toBe('jcb');
  });

  it('makes passwords with upper, lower and digits', () => {
    for (let i = 0; i < 50; i += 1) {
      const p = generatePassword();
      expect(p).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{12}$/);
    }
  });
});

it('sends signed-out users back to sign-in when the token expires', async () => {
  signedIn();
  routes({ 'GET /api/platform/tenants/': () => json(401, { code: 'not_authenticated', detail: 'x' }) });
  renderApp('/clients');
  expect(await screen.findByText('Your session ended. Please sign in again.')).toBeInTheDocument();
});
