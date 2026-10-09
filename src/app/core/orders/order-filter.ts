import { Order } from '@shared/models/order.model';
import { toDate } from '../format/format';

export type OrderDateRange = 'ALL' | 'TODAY' | '7' | '30';

export interface OrderFilterCriteria {
  /** Free-text search: order id, customer, address, comment, item names. */
  search: string;
  /** `ALL` or one order status. */
  orderStatus: string;
  /** `ALL` or one payment status. */
  paymentStatus: string;
  /** `ALL`, `COD` or `ONLINE`. */
  paymentMethod: string;
  dateRange: OrderDateRange;
}

export const EMPTY_ORDER_FILTER: OrderFilterCriteria = {
  search: '',
  orderStatus: 'ALL',
  paymentStatus: 'ALL',
  paymentMethod: 'ALL',
  dateRange: 'ALL',
};

export function hasActiveFilters(criteria: OrderFilterCriteria): boolean {
  return (
    criteria.search.trim() !== '' ||
    criteria.orderStatus !== 'ALL' ||
    criteria.paymentStatus !== 'ALL' ||
    criteria.paymentMethod !== 'ALL' ||
    criteria.dateRange !== 'ALL'
  );
}

/** Newest first. Orders without a usable date sort last. */
export function sortOrdersByDateDesc(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const left = toDate(a.createdAt)?.getTime() ?? 0;
    const right = toDate(b.createdAt)?.getTime() ?? 0;
    return right - left;
  });
}

function matchesSearch(order: Order, needle: string): boolean {
  if (!needle) {
    return true;
  }
  const customer = order.customerSnapshot;
  const address = order.addressSnapshot;
  const haystack = [
    order.id,
    order.orderStatus,
    order.paymentStatus,
    order.paymentMethod,
    order.customerComment,
    customer?.name,
    customer?.phone,
    customer?.email,
    address?.recipientName,
    address?.phone,
    address?.address,
    address?.city,
    address?.postalCode,
    ...(order.items ?? []).map((item) => item.productName),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

function matchesDateRange(order: Order, range: OrderDateRange, now: number): boolean {
  if (range === 'ALL') {
    return true;
  }
  const created = toDate(order.createdAt);
  if (!created) {
    return false;
  }
  if (range === 'TODAY') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return created.getTime() >= start.getTime();
  }
  const days = Number(range);
  return created.getTime() >= now - days * 24 * 60 * 60 * 1000;
}

/**
 * Applies the Orders page search box and filters. Filtering is purely
 * client-side over the Firestore `orders` snapshot — no status or payment
 * value is ever written by this function.
 */
export function filterOrders(
  orders: Order[],
  criteria: OrderFilterCriteria,
  now: number = Date.now()
): Order[] {
  const search = criteria.search.trim().toLowerCase();
  return orders.filter((order) => {
    if (!matchesSearch(order, search)) {
      return false;
    }
    if (
      criteria.orderStatus !== 'ALL' &&
      order.orderStatus !== criteria.orderStatus
    ) {
      return false;
    }
    if (
      criteria.paymentStatus !== 'ALL' &&
      order.paymentStatus !== criteria.paymentStatus
    ) {
      return false;
    }
    if (
      criteria.paymentMethod !== 'ALL' &&
      order.paymentMethod !== criteria.paymentMethod
    ) {
      return false;
    }
    return matchesDateRange(order, criteria.dateRange, now);
  });
}

/** Payment statuses present in the loaded data (for the filter dropdown). */
export function paymentStatusOptions(orders: Order[]): string[] {
  const values = new Set<string>();
  for (const order of orders) {
    if (order.paymentStatus) {
      values.add(order.paymentStatus);
    }
  }
  return [...values].sort();
}
