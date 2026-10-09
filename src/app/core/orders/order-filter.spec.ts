import { Order } from '@shared/models/order.model';
import {
  EMPTY_ORDER_FILTER,
  OrderFilterCriteria,
  filterOrders,
  hasActiveFilters,
  paymentStatusOptions,
  sortOrdersByDateDesc,
} from './order-filter';

function timestamp(date: string): Order['createdAt'] {
  return { toDate: () => new Date(date) } as Order['createdAt'];
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    customerId: 'uid-1',
    customerSnapshot: {
      uid: 'uid-1',
      name: 'Juan dela Cruz',
      email: 'juan@example.com',
      phone: '09171234567',
    },
    addressSnapshot: {
      recipientName: 'Juan dela Cruz',
      phone: '09171234567',
      address: '123 Sampaloc Street',
      city: 'Manila',
    },
    items: [
      {
        productId: 'p1',
        productName: 'House Latte',
        imageUrl: '',
        size: 'small',
        sugar: 'Regular',
        quantity: 2,
        unitPrice: 99,
        subtotal: 198,
      },
    ],
    subtotal: 198,
    deliveryFee: 0,
    total: 198,
    customerComment: 'Please call on arrival',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    orderStatus: 'PENDING',
    createdAt: timestamp('2026-10-01T10:00:00.000Z'),
    updatedAt: null,
    ...overrides,
  };
}

function criteria(overrides: Partial<OrderFilterCriteria> = {}): OrderFilterCriteria {
  return { ...EMPTY_ORDER_FILTER, ...overrides };
}

/** A second order that shares no searchable text with the default one. */
function makeOtherOrder(overrides: Partial<Order> = {}): Order {
  return makeOrder({
    id: 'other',
    customerId: 'uid-2',
    customerSnapshot: {
      uid: 'uid-2',
      name: 'Maria Santos',
      email: 'maria@example.com',
      phone: '09180000000',
    },
    addressSnapshot: {
      recipientName: 'Maria Santos',
      phone: '09180000000',
      address: '456 Ermita Avenue',
      city: 'Manila',
    },
    items: [
      {
        productId: 'p2',
        productName: 'Cold Brew',
        imageUrl: '',
        size: 'medium',
        sugar: 'No Sugar',
        quantity: 1,
        unitPrice: 119,
        subtotal: 119,
      },
    ],
    subtotal: 119,
    total: 119,
    customerComment: 'Leave at the front desk',
    ...overrides,
  });
}

describe('filterOrders', () => {
  const now = new Date('2026-10-05T12:00:00.000Z').getTime();

  it('returns every order when no filter is active', () => {
    const orders = [makeOrder(), makeOrder({ id: 'order-2' })];
    expect(filterOrders(orders, criteria(), now)).toHaveLength(2);
  });

  it('searches order id, customer, address, comment and item names', () => {
    const orders = [makeOrder(), makeOtherOrder()];

    expect(filterOrders(orders, criteria({ search: 'ORDER-1' }), now)).toHaveLength(1);
    expect(filterOrders(orders, criteria({ search: 'juan' }), now)).toHaveLength(1);
    expect(filterOrders(orders, criteria({ search: '0917' }), now)).toHaveLength(1);
    expect(filterOrders(orders, criteria({ search: 'sampaloc' }), now)).toHaveLength(1);
    expect(filterOrders(orders, criteria({ search: 'call on arrival' }), now)).toHaveLength(1);
    expect(filterOrders(orders, criteria({ search: 'house latte' }), now)).toHaveLength(1);
    expect(filterOrders(orders, criteria({ search: 'zzz' }), now)).toHaveLength(0);
  });

  it('filters by order status, payment status and payment method', () => {
    const orders = [
      makeOrder(),
      makeOrder({ id: 'order-2', orderStatus: 'COMPLETED' }),
      makeOrder({ id: 'order-3', paymentStatus: 'PAID', paymentMethod: 'ONLINE' }),
    ];

    expect(
      filterOrders(orders, criteria({ orderStatus: 'COMPLETED' }), now).map((o) => o.id)
    ).toEqual(['order-2']);
    expect(
      filterOrders(orders, criteria({ paymentStatus: 'PAID' }), now).map((o) => o.id)
    ).toEqual(['order-3']);
    expect(
      filterOrders(orders, criteria({ paymentMethod: 'COD' }), now).map((o) => o.id)
    ).toEqual(['order-1', 'order-2']);
  });

  it('filters by date range and drops orders without a date', () => {
    const nowDate = new Date('2026-10-05T12:00:00.000Z');
    const referenceNow = nowDate.getTime();
    const startOfToday = new Date(nowDate);
    startOfToday.setHours(0, 0, 0, 0);

    const orders = [
      makeOrder({
        id: 'today',
        createdAt: timestamp(new Date(startOfToday.getTime() + 3_600_000).toISOString()),
      }),
      makeOrder({
        id: 'old',
        createdAt: timestamp(new Date(referenceNow - 10 * 86_400_000).toISOString()),
      }),
      makeOrder({ id: 'undated', createdAt: null }),
    ];

    expect(
      filterOrders(orders, criteria({ dateRange: 'TODAY' }), referenceNow).map((o) => o.id)
    ).toEqual(['today']);
    expect(
      filterOrders(orders, criteria({ dateRange: '7' }), referenceNow).map((o) => o.id)
    ).toEqual(['today']);
    expect(
      filterOrders(orders, criteria({ dateRange: '30' }), referenceNow).map((o) => o.id)
    ).toEqual(['today', 'old']);
    expect(filterOrders(orders, criteria({ dateRange: 'ALL' }), referenceNow)).toHaveLength(3);
  });

  it('combines search and filters', () => {
    const orders = [makeOrder(), makeOtherOrder({ id: 'order-2', orderStatus: 'COMPLETED' })];

    expect(
      filterOrders(
        orders,
        criteria({ search: 'juan', orderStatus: 'COMPLETED' }),
        now
      )
    ).toHaveLength(0);
    expect(
      filterOrders(orders, criteria({ search: 'juan', orderStatus: 'PENDING' }), now)
    ).toHaveLength(1);
  });

  it('does not modify the input array', () => {
    const orders = [makeOrder(), makeOrder({ id: 'order-2' })];
    filterOrders(orders, criteria({ search: 'juan' }), now);
    expect(orders).toHaveLength(2);
  });
});

describe('order list helpers', () => {
  it('sorts newest first and keeps undated orders last', () => {
    const orders = [
      makeOrder({ id: 'older', createdAt: timestamp('2026-09-01T10:00:00.000Z') }),
      makeOrder({ id: 'newer', createdAt: timestamp('2026-10-02T10:00:00.000Z') }),
      makeOrder({ id: 'undated', createdAt: null }),
    ];

    expect(sortOrdersByDateDesc(orders).map((o) => o.id)).toEqual([
      'newer',
      'older',
      'undated',
    ]);
  });

  it('detects active filters', () => {
    expect(hasActiveFilters(EMPTY_ORDER_FILTER)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_ORDER_FILTER, search: 'juan' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_ORDER_FILTER, orderStatus: 'PENDING' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_ORDER_FILTER, dateRange: '7' })).toBe(true);
  });

  it('lists the payment statuses present in the data', () => {
    const orders = [
      makeOrder(),
      makeOrder({ id: 'order-2', paymentStatus: 'PAID' }),
      makeOrder({ id: 'order-3', paymentStatus: 'PAID' }),
    ];
    expect(paymentStatusOptions(orders)).toEqual(['PAID', 'PENDING']);
  });
});
