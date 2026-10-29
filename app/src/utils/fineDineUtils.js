/**
 * Fine Dine dashboard helpers
 * Shared rules for what counts as an active order, item counts and durations.
 */

// Orders in these states still occupy a table / are still being worked on.
// 'completed', 'outstanding', 'cancelled' and 'refunded' are closed.
export const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'served'];

export const DINE_IN_TYPES = ['dine_in'];
export const TAKEAWAY_TYPES = ['takeaway', 'pickup'];

// Only pending orders have not been sent to the kitchen yet
export const KITCHEN_PENDING_STATUS = 'pending';
export const KITCHEN_SENT_STATUS = 'confirmed';

export const isActiveOrder = (order) =>
  ACTIVE_ORDER_STATUSES.includes(order?.status?.toLowerCase());

export const isDineInOrder = (order) => DINE_IN_TYPES.includes(order?.type);

export const isTakeawayOrder = (order) => TAKEAWAY_TYPES.includes(order?.type);

export const isEditableOrder = (order) => isActiveOrder(order);

/** Items that still count toward the order (cancelled lines are ignored) */
export const getBillableItems = (order) =>
  (order?.items || []).filter((item) => item.status !== 'cancelled');

/** Total ordered units, including quantities */
export const getItemCount = (order) => {
  if (!order) return 0;
  if (Array.isArray(order.items)) {
    return getBillableItems(order).reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
  }
  return parseInt(order.total_items, 10) || 0;
};

export const getOrderStartTime = (order) => order?.order_time || order?.created_at || null;

/** Format elapsed time as 12m, 1h 23m or 1d 2h */
export const formatElapsed = (startTime, now = Date.now()) => {
  if (!startTime) return '';
  const start = new Date(startTime).getTime();
  if (Number.isNaN(start)) return '';
  const minutes = Math.max(0, Math.floor((now - start) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

/** Natural sort so tables read 1, 2, 3, 3-1, 4 ... 10 */
export const compareTables = (a, b) =>
  String(a.table_number ?? a.name ?? '').localeCompare(
    String(b.table_number ?? b.name ?? ''),
    undefined,
    { numeric: true, sensitivity: 'base' }
  );

export const getTableLabel = (table) => table?.table_number || table?.name || '';

/**
 * The number the service gives the next split of a table: 4 -> 4-1, then 4-2.
 * Splitting a split table (4-1) continues from its table (4-2). Preview only; the service decides.
 */
export const nextSplitNumber = (table, tables) => {
  const base = tables.find((t) => String(t.id) === String(table?.split_from)) || table;
  const prefix = `${getTableLabel(base)}-`;
  const taken = new Set(tables.map((t) => String(t.table_number || '').toLowerCase()));
  let n = 1;
  while (taken.has(`${prefix}${n}`.toLowerCase())) n += 1;
  return `${prefix}${n}`;
};

/** Tables merged into this order's bill (besides its own table) */
export const getLinkedTables = (order) => order?.linked_tables || [];

export const isMergedOrder = (order) => getLinkedTables(order).length > 0;

/** Every table the order is on: its own table first, then the merged ones */
export const getOrderTableIds = (order) =>
  [order?.table, ...getLinkedTables(order).map((t) => t.id)].filter((id) => id !== undefined && id !== null);

/** "1 + 2 + 3" for a merged bill, else the order's table number */
export const getOrderTablesLabel = (order) =>
  [order?.table_number, ...getLinkedTables(order).map((t) => t.table_number)].filter(Boolean).join(' + ');

/** Short order reference for compact UI, e.g. #042 */
export const getShortOrderNumber = (order) => {
  const number = order?.order_number?.toString() || '';
  return number ? `#${number.slice(-3).padStart(3, '0')}` : '';
};

/**
 * Group active dine-in orders by table id.
 * Orders are matched by table id, falling back to table number; a merged bill is listed
 * under every table merged into it. Each table maps to its orders sorted oldest first.
 */
export const groupOrdersByTable = (orders, tables) => {
  const byNumber = new Map((tables || []).map((t) => [String(t.table_number), t.id]));
  const grouped = {};

  (orders || []).forEach((order) => {
    const tableId = order.table ?? byNumber.get(String(order.table_number));
    if (tableId === undefined || tableId === null) return;
    [tableId, ...getLinkedTables(order).map((t) => t.id)].forEach((id) => {
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(order);
    });
  });

  Object.values(grouped).forEach((list) =>
    list.sort((a, b) => new Date(getOrderStartTime(a)) - new Date(getOrderStartTime(b)))
  );

  return grouped;
};

/**
 * Build KOT print data from an order.
 * Pass `items` to print only a subset (for example, items just added).
 */
/** The KOT number shared by every printed line, if they are all on one KOT */
const sharedKotNumber = (items) => {
  const numbers = new Set(items.map((item) => item.kot_number ?? null));
  return numbers.size === 1 ? [...numbers][0] : null;
};

/** The table every line was ordered from, if they share one (merged bills) */
const sharedTableNumber = (items) => {
  const numbers = new Set(items.map((item) => item.table_number || null));
  return numbers.size === 1 ? [...numbers][0] : null;
};

export const buildKOTData = (order, items = null, kotNumber = null) => {
  const lines = items || getBillableItems(order);
  const tableLabel = sharedTableNumber(lines) || order.table_number
    || (isTakeawayOrder(order) ? 'TAKEAWAY' : order.type?.replace('_', ' ').toUpperCase());
  return {
    orderNumber: order.order_number,
    order_number: order.order_number,
    tableNumber: tableLabel,
    table_number: order.table_number || '',
    timestamp: new Date(),
    restaurantId: order.restaurant,
    serverId: order.server ?? null,
    orderType: order.type,
    kitchenNotes: order.kitchen_notes || '',
    // Only some lines: these are items added to an order already in the kitchen
    isAddition: !!items,
    kotNumber: kotNumber ?? sharedKotNumber(lines),
    items: lines.map((item) => ({
      quantity: item.quantity,
      menu_item_name: item.menu_item_name || item.name,
      special_instructions: item.special_instructions || '',
    })),
  };
};

/**
 * KOT print data, one ticket per table the lines were ordered from, so each table of a
 * merged bill gets a KOT with its own name. Same arguments as buildKOTData.
 */
export const buildKOTTickets = (order, items = null, kotNumber = null) => {
  const lines = items || getBillableItems(order);
  const groups = new Map();
  lines.forEach((item) => {
    const key = item.table_number || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  if (groups.size <= 1) return [buildKOTData(order, items, kotNumber)];
  return [...groups.values()].map((group) => ({ ...buildKOTData(order, group), isAddition: !!items }));
};
