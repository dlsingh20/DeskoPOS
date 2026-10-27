import historyService from './HistoryService';
import ApiClient from './ApiClient';
import orderService from './OrderService';
import { getCloseTime } from '../utils/historyUtils';

jest.mock('./ApiClient', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('./OrderService', () => ({ __esModule: true, default: { getOrder: jest.fn() } }));

const from = new Date('2026-10-12T18:30:00Z'); // 13 Oct 00:00 in Kolkata
const to = new Date('2026-10-13T18:30:00Z'); // 14 Oct 00:00

/** Slim list entries, like GET /orders/ (OrderSimple): no closed_at, subtotal or tax */
const slim = (id, status, orderTime, payments = []) => ({ id, order_number: String(id), status, order_time: orderTime, total_amount: '100.00', items: [], payments });
const paid = (at) => [{ id: 1, method: 'cash', amount: '100.00', status: 'completed', processed_at: at }];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCloseTime', () => {
  test('closed_at, cancelled_at, last payment, last update', () => {
    expect(getCloseTime({ status: 'completed', closed_at: '2026-10-13T10:00:00Z', payments: paid('2026-10-13T09:00:00Z') })).toBe('2026-10-13T10:00:00Z');
    expect(getCloseTime({ status: 'cancelled', cancelled_at: '2026-10-13T08:00:00Z', updated_at: '2026-10-13T09:00:00Z' })).toBe('2026-10-13T08:00:00Z');
    expect(getCloseTime({ status: 'completed', payments: paid('2026-10-13T09:00:00Z'), updated_at: '2026-10-14T00:00:00Z' })).toBe('2026-10-13T09:00:00Z');
    expect(getCloseTime({ status: 'outstanding', updated_at: '2026-10-13T11:00:00Z' })).toBe('2026-10-13T11:00:00Z');
    expect(getCloseTime({ status: 'outstanding' })).toBeNull();
  });
});

describe('getClosedBills (by settlement date)', () => {
  test('includes bills ordered earlier but settled today; excludes bills settled on other days', async () => {
    ApiClient.get.mockResolvedValue({
      data: {
        results: [
          slim(1, 'completed', '2026-10-13T05:00:00Z', paid('2026-10-13T06:00:00Z')), // ordered and settled today
          slim(2, 'completed', '2026-10-11T10:00:00Z', paid('2026-10-13T07:00:00Z')), // opened 2 days ago, settled today
          slim(3, 'completed', '2026-10-12T10:00:00Z', paid('2026-10-12T11:00:00Z')), // settled yesterday
          slim(4, 'served', '2026-10-13T08:00:00Z'), // still open
          slim(5, 'cancelled', '2026-10-10T08:00:00Z'), // needs details to know when it closed
          slim(6, 'completed', '2026-09-30T10:00:00Z', paid('2026-10-13T07:00:00Z')), // older than the look-back
        ],
        next: null,
      },
    });
    orderService.getOrder.mockImplementation(async (id) => ({
      ...slim(id, id === 5 ? 'cancelled' : 'completed', '2026-10-13T00:00:00Z'),
      subtotal: '90.00', tax_amount: '10.00',
      ...(id === 5 ? { cancelled_at: '2026-10-13T09:00:00Z', order_time: '2026-10-10T08:00:00Z' } : {}),
      ...(id === 1 ? { payments: paid('2026-10-13T06:00:00Z'), closed_at: '2026-10-13T06:00:00Z' } : {}),
      ...(id === 2 ? { payments: paid('2026-10-13T07:00:00Z'), closed_at: '2026-10-13T07:00:00Z' } : {}),
    }));

    const { orders } = await historyService.getClosedBills({ restaurantId: 3, from, to });
    expect(orders.map((o) => o.id).sort()).toEqual([1, 2, 5]);

    const url = ApiClient.get.mock.calls[0][0];
    expect(url).toContain('date_from=2026-10-04'); // 7-day look-back, plus a day for time zones
    expect(orderService.getOrder).not.toHaveBeenCalledWith(3);
    expect(orderService.getOrder).not.toHaveBeenCalledWith(6);
  });
});
