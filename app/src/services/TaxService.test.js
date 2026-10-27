import taxService, { TaxesUnavailableError } from './TaxService';
import ApiClient from './ApiClient';

jest.mock('./ApiClient', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));

const notFound = () => Promise.reject(Object.assign(new Error('Not found'), { response: { status: 404 } }));

beforeEach(() => jest.clearAllMocks());

test('lists taxes across pages', async () => {
  ApiClient.get
    .mockResolvedValueOnce({ data: { results: [{ id: 1 }], next: 'https://api.example.com/api/pos/api/taxes/?page=2' } })
    .mockResolvedValueOnce({ data: { results: [{ id: 2 }], next: null } });
  await expect(taxService.listTaxes(7)).resolves.toEqual({ available: true, taxes: [{ id: 1 }, { id: 2 }] });
  expect(ApiClient.get.mock.calls[0][0]).toBe('/api/pos/api/taxes/?restaurant_id=7&page_size=200');
  expect(ApiClient.get.mock.calls[1][0]).toBe('/api/pos/api/taxes/?page=2');
});

test('servers without the taxes endpoint report unavailable', async () => {
  ApiClient.get.mockImplementation(notFound);
  await expect(taxService.listTaxes(7)).resolves.toEqual({ available: false, taxes: [] });
  ApiClient.post.mockImplementation(notFound);
  await expect(taxService.createTax(7, { name: 'VAT' })).rejects.toBeInstanceOf(TaxesUnavailableError);
});

test('create sends the restaurant; deactivate patches is_active', async () => {
  ApiClient.post.mockResolvedValue({ data: { id: 9 } });
  ApiClient.patch.mockResolvedValue({ data: { id: 9, is_active: false } });
  await taxService.createTax(7, { name: 'VAT' });
  expect(ApiClient.post).toHaveBeenCalledWith('/api/pos/api/taxes/', { name: 'VAT', restaurant: 7 });
  await taxService.setTaxActive(9, false);
  expect(ApiClient.patch).toHaveBeenCalledWith('/api/pos/api/taxes/9/', { is_active: false });
});
