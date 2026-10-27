import cashCounterService from './CashCounterService';
import ApiClient from './ApiClient';

jest.mock('./ApiClient', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }));

const fail = (status) => Promise.reject(Object.assign(new Error('x'), { response: { status } }));

beforeEach(() => jest.clearAllMocks());

test('lists counters across pages', async () => {
  ApiClient.get
    .mockResolvedValueOnce({ data: { results: [{ id: 1, name: 'Counter 1' }], next: 'https://api.example.com/api/accounting/cash-counters/?page=2' } })
    .mockResolvedValueOnce({ data: { results: [{ id: 2, name: 'Bar' }], next: null } });
  await expect(cashCounterService.listCounters()).resolves.toEqual({ available: true, counters: [{ id: 1, name: 'Counter 1' }, { id: 2, name: 'Bar' }] });
  expect(ApiClient.get.mock.calls[1][0]).toBe('/api/accounting/cash-counters/?page=2');
});

test('counters switched off for the hotel → unavailable, not an error', async () => {
  ApiClient.get.mockImplementation(() => fail(403));
  await expect(cashCounterService.listCounters()).resolves.toEqual({ available: false, counters: [] });
  ApiClient.get.mockImplementation(() => fail(500));
  await expect(cashCounterService.listCounters()).rejects.toThrow();
});

test('current shift: null when none', async () => {
  ApiClient.get.mockResolvedValueOnce({ data: null });
  await expect(cashCounterService.getCurrentShift()).resolves.toBeNull();
  ApiClient.get.mockResolvedValueOnce({ data: { id: 5, status: 'open' } });
  await expect(cashCounterService.getCurrentShift()).resolves.toEqual({ id: 5, status: 'open' });
});

test('refresh a shift: detail first, then the current shift, else keep what we have', async () => {
  ApiClient.get.mockResolvedValueOnce({ data: { id: 5, totals: { expected_cash: '10.00' } } });
  await expect(cashCounterService.refreshShift({ id: 5 })).resolves.toEqual({ id: 5, totals: { expected_cash: '10.00' } });
  expect(ApiClient.get).toHaveBeenLastCalledWith('/api/accounting/cash-register/5/');
  ApiClient.get.mockImplementationOnce(() => fail(403)).mockResolvedValueOnce({ data: { id: 5, opening_balance: '50.00' } });
  await expect(cashCounterService.refreshShift({ id: 5 })).resolves.toEqual({ id: 5, opening_balance: '50.00' });
  ApiClient.get.mockImplementationOnce(() => fail(403)).mockImplementationOnce(() => fail(500));
  await expect(cashCounterService.refreshShift({ id: 5, x: 1 })).resolves.toEqual({ id: 5, x: 1 });
});

test('open defaults are asked per counter', async () => {
  ApiClient.get.mockResolvedValueOnce({ data: { opening_balance: '1500.00', shift_template: { id: 2 } } });
  await expect(cashCounterService.getOpenDefaults(3)).resolves.toEqual({ opening_balance: '1500.00', shift_template: { id: 2 } });
  expect(ApiClient.get).toHaveBeenCalledWith('/api/accounting/cash-register/open_defaults/', { params: { counter_id: 3 } });
});

test('open and close send the counter, opening cash and the count', async () => {
  ApiClient.post.mockResolvedValue({ data: { id: 5 } });
  await cashCounterService.openShift({ counterId: 3, shiftTemplateId: 1, openingBalance: '2000.00' });
  expect(ApiClient.post).toHaveBeenCalledWith('/api/accounting/cash-register/open/', {
    counter_id: 3, shift_template_id: 1, opening_balance: '2000.00', notes: '',
  });
  await cashCounterService.openShift({ counterId: 3, openingBalance: '0.00' });
  expect(ApiClient.post).toHaveBeenLastCalledWith('/api/accounting/cash-register/open/', { counter_id: 3, opening_balance: '0.00', notes: '' });
  await cashCounterService.closeShift(5, { physicalCount: '15480.00', notes: 'Rs 20 short' });
  expect(ApiClient.post).toHaveBeenLastCalledWith('/api/accounting/cash-register/5/close/', { physical_count: '15480.00', notes: 'Rs 20 short' });
});
