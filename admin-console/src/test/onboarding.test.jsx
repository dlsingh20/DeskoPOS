import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { session } from '../api';
import { answerText } from '../pages/OnboardingDetailPage';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const SCHEMA = [
  { key: 'business', title: 'Business', fields: [
    { key: 'name', label: 'Business / brand name', type: 'text', required: true },
    { key: 'country', label: 'Country', type: 'select', required: true, options: [{ value: 'IN', label: 'India' }] },
  ] },
  { key: 'menu', title: 'Menu', fields: [{ key: 'files', label: 'Menu files', type: 'file', required: true }] },
  { key: 'taxes', title: 'Taxes', type: 'list', item: 'Tax', fields: [
    { key: 'name', label: 'Tax name', type: 'text', required: true },
    { key: 'rate', label: 'Rate %', type: 'number', required: true },
  ] },
];

const FORM = {
  id: 7, title: 'Spice Garden', status: 'submitted', contact_name: 'Ravi', contact_email: 'ravi@spice.example',
  link: 'https://api.example/irf/secret/', notes: '', created_at: '2026-10-30T10:00:00Z',
  last_saved_at: '2026-10-30T11:00:00Z', last_saved_by: 'client', submitted_at: '2026-10-30T11:00:00Z',
  schema: SCHEMA, problems: [],
  data: { business: { name: 'Spice Garden', country: 'IN' }, menu: {}, taxes: [{ name: 'CGST', rate: 2.5 }] },
  files: [{ id: 3, field: 'menu.files', name: 'menu.xlsx', size: 2048 }],
};

function routes(overrides = {}) {
  const calls = [];
  global.fetch = vi.fn((url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || 'GET'} ${u.pathname}`;
    calls.push({ key, body: init.body ? JSON.parse(init.body) : undefined });
    if (overrides[key]) return overrides[key](u, init);
    if (key === 'GET /api/platform/onboarding/') return json(200, { results: [FORM] });
    if (key === 'GET /api/platform/onboarding/7/') return json(200, FORM);
    return json(404, { detail: 'not mocked' });
  });
  return calls;
}

const renderApp = (path) => render(
  <ChakraProvider>
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>
  </ChakraProvider>,
);

beforeEach(() => {
  session.clear();
  session.save('token', { id: 1, email: 'owner@appdesko.com', name: 'Owner', role: 'owner' });
});

describe('onboarding forms', () => {
  it('lists forms and creates one from the client name', async () => {
    const calls = routes({ 'POST /api/platform/onboarding/': () => json(201, { ...FORM, id: 8, status: 'draft' }) });
    renderApp('/onboarding');
    expect(await screen.findByText('Spice Garden')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new form/i }));
    await user.click(screen.getByRole('button', { name: /create form/i }));
    expect(await screen.findByText(/enter the client's name/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/client \/ restaurant name/i), 'Beans Cafe');
    await user.click(screen.getByRole('button', { name: /create form/i }));
    await vi.waitFor(() => expect(calls.find((c) => c.key === 'POST /api/platform/onboarding/')?.body.title).toBe('Beans Cafe'));
  });

  it('shows the answers, the link and the review actions', async () => {
    const calls = routes({ 'POST /api/platform/onboarding/7/reopen/': () => json(200, { ...FORM, status: 'draft' }) });
    renderApp('/onboarding/7');
    expect(await screen.findByDisplayValue(FORM.link)).toBeInTheDocument();
    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText('CGST')).toBeInTheDocument();
    expect(screen.getByText('menu.xlsx')).toBeInTheDocument();
    expect(screen.getByText(/every required answer is filled in/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /reopen for client/i }));
    expect(await screen.findByText('Waiting for client')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /api/platform/onboarding/7/reopen/')).toBe(true);
  });

  it('lists missing answers', async () => {
    routes({ 'GET /api/platform/onboarding/7/': () => json(200, {
      ...FORM, status: 'draft', problems: [{ path: 'menu.files', label: 'Menu · Menu files', message: 'Attach a file' }],
    }) });
    renderApp('/onboarding/7');
    expect(await screen.findByText(/1 required answer is missing/i)).toBeInTheDocument();
    expect(screen.getByText('Menu · Menu files: Attach a file')).toBeInTheDocument();
  });

  it('creates the restaurant from a submitted form after a preview', async () => {
    const PREVIEW = {
      business: { name: 'Spice Garden', type: 'restaurant', country: 'India', currency: 'INR' },
      outlets: [{ name: 'Indiranagar', tables: 12, cash_counters: 1 }],
      taxes: [{ name: 'CGST', rate: 2.5, every_item: true }, { name: 'VAT', rate: 20, every_item: false }],
      people: [{ name: 'Ravi Kumar', role: 'administrator', login_id: 'ravi.admin', generated: false, can_login: true },
        { name: 'Vikram', role: 'waiter', login_id: 'vikram', generated: true, can_login: false }],
      payment_methods: ['cash', 'upi'],
      menu: { file: 'menu.xlsx', items: 42, categories: 6, problems: [], error: null },
      problems: [], warnings: ['VAT apply only to some items.'],
    };
    const calls = routes({
      'GET /api/platform/plans/': () => json(200, [{ code: 'growth', name: 'Growth', is_active: true }]),
      'POST /api/platform/onboarding/import/preview/': () => json(200, PREVIEW),
      'POST /api/platform/onboarding/import/': () => json(201, {
        tenant: { id: 105, name: 'Spice Garden', status: 'pending' },
        credentials: [{ name: 'Ravi Kumar', role: 'administrator', login_id: 'ravi.admin', password: 'Temp-Pass-123' },
          { name: 'Vikram', role: 'waiter', login_id: 'vikram', password: null }],
        summary: { ...PREVIEW, warnings: [] },
      }),
    });
    renderApp('/onboarding/7');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /create restaurant/i }));
    await user.click(await screen.findByRole('button', { name: /^check$/i }));
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('made up')).toBeInTheDocument();
    expect(screen.getByText('VAT apply only to some items.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^create restaurant$/i }));
    expect(await screen.findByText('Temp-Pass-123')).toBeInTheDocument();
    expect(screen.getByText(/client id 105/i)).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /api/platform/onboarding/import/').body.form_id).toBe(7);
  });

  it('formats answers by field type', () => {
    expect(answerText({ type: 'yesno' }, false)).toBe('No');
    expect(answerText({ type: 'multi', options: [{ value: 'upi', label: 'UPI' }] }, ['upi', 'x'])).toBe('UPI, x');
    expect(answerText({ type: 'lines' }, ['Main', 'Bar'])).toBe('Main, Bar');
    expect(answerText({ type: 'text' }, null)).toBe('');
  });
});
