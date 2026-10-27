import orderService from './OrderService';
import ApiClient from './ApiClient';

jest.mock('./ApiClient', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));

const notFound = () => Promise.reject(Object.assign(new Error('Not found'), { response: { status: 404 } }));

beforeEach(() => jest.clearAllMocks());

describe('cancelOrder', () => {
  test('uses POST /orders/{id}/cancel/ with reason and approval when the backend has it', async () => {
    ApiClient.post.mockResolvedValue({ data: { id: 5, status: 'cancelled' } });
    await orderService.cancelOrder(5, 'Test order', { approvalId: 'apr_1' });
    expect(ApiClient.post).toHaveBeenCalledWith('/api/pos/api/orders/5/cancel/', { reason: 'Test order', approval_id: 'apr_1' });
    expect(ApiClient.patch).not.toHaveBeenCalled();
  });

  test('older backends: status change, then the reason line added to the notes', async () => {
    ApiClient.post.mockImplementation(notFound);
    ApiClient.patch.mockResolvedValue({ data: { id: 5, status: 'cancelled' } });
    ApiClient.get.mockResolvedValue({ data: { id: 5, notes: 'Window seat' } });
    await orderService.cancelOrder(5, 'Test order', { auditLine: '[Cancel] Test order | By: Asha' });
    expect(ApiClient.patch).toHaveBeenNthCalledWith(1, '/api/pos/api/orders/5/update_status/', { status: 'cancelled' });
    const notes = ApiClient.patch.mock.calls[1][1].notes;
    expect(notes).toMatch(/^Window seat\n\[Cancel\] Test order \| By: Asha \| At: /);
  });

  test('other server errors are reported, not hidden by the fallback', async () => {
    ApiClient.post.mockRejectedValue({ response: { status: 409, data: { detail: 'Refund the payments before cancelling.' } } });
    await expect(orderService.cancelOrder(5, 'x')).rejects.toThrow('Refund the payments before cancelling.');
    expect(ApiClient.patch).not.toHaveBeenCalled();
  });
});
