import { Order } from '@shared/models/order.model';
import { formatPhp } from '@shared/core/format/format';
import {
  addPeriods,
  financialPeriodRangeLabel,
  financialPeriodTitle,
  isCollectedRevenueOrder,
  periodRange,
  revenueBreakdown,
  revenueDate,
  startOfPeriod,
  summarizeCollectedRevenue,
} from './financial-analytics';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    customerId: 'uid-1',
    customerSnapshot: null,
    addressSnapshot: null,
    items: [],
    subtotal: 198,
    deliveryFee: 17,
    total: 215,
    customerComment: '',
    paymentMethod: 'GCASH',
    paymentStatus: 'PAID',
    gcashDetails: null,
    orderStatus: 'COMPLETED',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-21T00:00:00.000Z',
    ...overrides,
  };
}

function paidGcash(paidAt: Date, overrides: Partial<Order> = {}): Order {
  return makeOrder({
    paymentStatus: 'PAID',
    paymentDecision: {
      decision: 'PAID',
      decidedBy: 'admin-1',
      decidedAt: paidAt.toISOString(),
    },
    ...overrides,
  });
}

function completedCod(
  decisionAt: Date | null,
  overrides: Partial<Order> = {}
): Order {
  return makeOrder({
    paymentMethod: 'COD',
    paymentStatus: decisionAt ? 'PAID' : 'PENDING',
    orderStatus: 'COMPLETED',
    paymentDecision: decisionAt
      ? {
          decision: 'PAID',
          decidedBy: 'admin-1',
          decidedAt: decisionAt.toISOString(),
        }
      : null,
    updatedAt: (decisionAt ?? new Date(2026, 9, 21, 12, 0, 0)).toISOString(),
    ...overrides,
  });
}

describe('revenue rules', () => {
  it('counts verified GCash payments only', () => {
    expect(isCollectedRevenueOrder(makeOrder())).toBe(true);
    for (const paymentStatus of ['PENDING', 'VERIFYING', 'REJECTED']) {
      expect(
        isCollectedRevenueOrder(
          makeOrder({ paymentStatus, orderStatus: 'COMPLETED' })
        )
      ).toBe(false);
    }
  });

  it('treats a delivered COD order as collected even before paymentStatus is PAID', () => {
    const order = completedCod(null);
    expect(isCollectedRevenueOrder(order)).toBe(true);
    expect(revenueDate(order)?.getTime()).toBe(
      new Date(2026, 9, 21, 12, 0, 0).getTime()
    );
  });

  it('does not count a COD order that has not been delivered', () => {
    expect(
      isCollectedRevenueOrder(
        makeOrder({
          paymentMethod: 'COD',
          paymentStatus: 'PENDING',
          orderStatus: 'OUT_FOR_DELIVERY',
        })
      )
    ).toBe(false);
  });

  it('excludes cancelled orders even when they were paid', () => {
    const cancelled = paidGcash(new Date(2026, 9, 21, 10, 0, 0), {
      orderStatus: 'CANCELLED',
    });
    expect(isCollectedRevenueOrder(cancelled)).toBe(false);

    const summary = summarizeCollectedRevenue(
      [
        cancelled,
        completedCod(null, { id: 'cancelled-cod', orderStatus: 'CANCELLED' }),
      ],
      periodRange('day', new Date(2026, 9, 21))
    );
    expect(summary.revenue).toBe(0);
    expect(summary.paidOrderCount).toBe(0);
    expect(summary.cancelledOrderCount).toBe(2);
  });

  it('uses the saved order total, including the delivery fee', () => {
    const order = paidGcash(new Date(2026, 9, 21, 10, 0, 0), {
      subtotal: 100,
      deliveryFee: 50,
      total: 150,
    });
    const summary = summarizeCollectedRevenue(
      [order],
      periodRange('day', new Date(2026, 9, 21))
    );
    expect(summary.revenue).toBe(150);
  });

  it('ignores collected orders without a usable saved total', () => {
    const base = new Date(2026, 9, 21, 10, 0, 0);
    const summary = summarizeCollectedRevenue(
      [
        paidGcash(base, { id: 'nan', total: Number.NaN }),
        paidGcash(base, { id: 'negative', total: -10 }),
        paidGcash(base, {
          id: 'missing',
          total: undefined as unknown as number,
        }),
      ],
      periodRange('day', new Date(2026, 9, 21))
    );
    expect(summary.revenue).toBe(0);
    expect(summary.paidOrderCount).toBe(0);
  });
});

describe('financial date boundaries', () => {
  it('includes the first and last millisecond of a day only', () => {
    const anchor = new Date(2026, 9, 21, 12, 0, 0);
    const range = periodRange('day', anchor);
    expect(range.start.getTime()).toBe(
      new Date(2026, 9, 21, 0, 0, 0, 0).getTime()
    );
    expect(range.end.getTime()).toBe(
      new Date(2026, 9, 22, 0, 0, 0, 0).getTime()
    );

    const summary = summarizeCollectedRevenue(
      [
        paidGcash(new Date(2026, 9, 21, 0, 0, 0, 0), {
          id: 'first',
          total: 100,
        }),
        paidGcash(new Date(2026, 9, 21, 23, 59, 59, 999), {
          id: 'last',
          total: 200,
        }),
        paidGcash(new Date(2026, 9, 20, 23, 59, 59, 999), {
          id: 'before',
          total: 400,
        }),
        paidGcash(new Date(2026, 9, 22, 0, 0, 0, 0), {
          id: 'after',
          total: 800,
        }),
      ],
      range
    );

    expect(summary.revenue).toBe(300);
    expect(summary.paidOrderCount).toBe(2);
  });

  it('uses calendar month boundaries', () => {
    const anchor = new Date(2026, 9, 15, 12, 0, 0);
    const summary = summarizeCollectedRevenue(
      [
        paidGcash(new Date(2026, 9, 1, 0, 0, 0, 0), {
          id: 'month-first',
          total: 100,
        }),
        paidGcash(new Date(2026, 9, 31, 23, 59, 59, 999), {
          id: 'month-last',
          total: 200,
        }),
        paidGcash(new Date(2026, 8, 30, 23, 59, 59, 999), {
          id: 'previous-month',
          total: 400,
        }),
        paidGcash(new Date(2026, 10, 1, 0, 0, 0, 0), {
          id: 'next-month',
          total: 800,
        }),
      ],
      periodRange('month', anchor)
    );

    expect(summary.revenue).toBe(300);
    expect(summary.paidOrderCount).toBe(2);
  });

  it('uses calendar year boundaries', () => {
    const anchor = new Date(2026, 5, 15, 12, 0, 0);
    const summary = summarizeCollectedRevenue(
      [
        paidGcash(new Date(2026, 0, 1, 0, 0, 0, 0), {
          id: 'year-first',
          total: 100,
        }),
        paidGcash(new Date(2026, 11, 31, 23, 59, 59, 999), {
          id: 'year-last',
          total: 200,
        }),
        paidGcash(new Date(2025, 11, 31, 23, 59, 59, 999), {
          id: 'previous-year',
          total: 400,
        }),
        paidGcash(new Date(2027, 0, 1, 0, 0, 0, 0), {
          id: 'next-year',
          total: 800,
        }),
      ],
      periodRange('year', anchor)
    );

    expect(summary.revenue).toBe(300);
    expect(summary.paidOrderCount).toBe(2);
  });

  it('moves anchors across day, month and year boundaries', () => {
    expect(
      addPeriods('day', new Date(2026, 9, 21), 1).getTime()
    ).toBe(new Date(2026, 9, 22).getTime());
    expect(
      addPeriods('month', new Date(2026, 11, 15), 1).getTime()
    ).toBe(new Date(2027, 0, 1).getTime());
    expect(
      addPeriods('year', new Date(2026, 5, 15), -1).getTime()
    ).toBe(new Date(2025, 0, 1).getTime());
  });
});

describe('payment dates', () => {
  it('dates GCash revenue by the admin payment decision, not order creation', () => {
    const order = paidGcash(new Date(2026, 9, 25, 9, 0, 0), {
      createdAt: new Date(2026, 9, 1, 9, 0, 0).toISOString(),
    });

    const createdInPeriod = summarizeCollectedRevenue(
      [order],
      periodRange('day', new Date(2026, 9, 1))
    );
    const paidInPeriod = summarizeCollectedRevenue(
      [order],
      periodRange('day', new Date(2026, 9, 25))
    );

    expect(createdInPeriod.revenue).toBe(0);
    expect(paidInPeriod.revenue).toBe(215);
  });

  it('uses the COD settlement decision date before the last update time', () => {
    const order = completedCod(new Date(2026, 9, 21, 9, 0, 0), {
      updatedAt: new Date(2026, 9, 28, 9, 0, 0).toISOString(),
    });

    expect(
      summarizeCollectedRevenue(
        [order],
        periodRange('day', new Date(2026, 9, 21))
      ).revenue
    ).toBe(215);
    expect(
      summarizeCollectedRevenue(
        [order],
        periodRange('day', new Date(2026, 9, 28))
      ).revenue
    ).toBe(0);
  });

  it('reports paid orders without a payment date instead of guessing', () => {
    const order = makeOrder({
      paymentStatus: 'PAID',
      paymentDecision: null,
    });
    const summary = summarizeCollectedRevenue(
      [order],
      periodRange('day', new Date(2026, 9, 21))
    );

    expect(summary.revenue).toBe(0);
    expect(summary.paidOrderCount).toBe(0);
    expect(summary.undatedRevenue).toBe(215);
    expect(summary.undatedOrderCount).toBe(1);
  });

  it('counts a repeated order id only once', () => {
    const paidAt = new Date(2026, 9, 21, 9, 0, 0);
    const summary = summarizeCollectedRevenue(
      [
        paidGcash(paidAt, { id: 'same-order', total: 100 }),
        paidGcash(paidAt, { id: 'same-order', total: 900 }),
      ],
      periodRange('day', paidAt)
    );

    expect(summary.revenue).toBe(100);
    expect(summary.paidOrderCount).toBe(1);
  });
});

describe('empty periods and breakdown consistency', () => {
  it('returns zero revenue and zero orders for an empty day', () => {
    const anchor = new Date(2026, 9, 21);
    const summary = summarizeCollectedRevenue(
      [],
      periodRange('day', anchor)
    );
    expect(summary).toEqual({
      revenue: 0,
      paidOrderCount: 0,
      undatedRevenue: 0,
      undatedOrderCount: 0,
      cancelledOrderCount: 0,
    });
    expect(formatPhp(summary.revenue)).toBe('₱0.00');

    const breakdown = revenueBreakdown([], 'day', anchor);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].revenue).toBe(0);
    expect(breakdown[0].paidOrderCount).toBe(0);
  });

  it('returns zero-filled day buckets for an empty month', () => {
    const anchor = new Date(2026, 1, 15);
    const breakdown = revenueBreakdown([], 'month', anchor);
    expect(breakdown).toHaveLength(28);
    expect(breakdown.every((bucket) => bucket.revenue === 0)).toBe(true);
    expect(
      breakdown.every((bucket) => bucket.paidOrderCount === 0)
    ).toBe(true);
  });

  it('returns zero-filled month buckets for an empty year', () => {
    const anchor = new Date(2026, 5, 15);
    const breakdown = revenueBreakdown([], 'year', anchor);
    expect(breakdown).toHaveLength(12);
    expect(breakdown.every((bucket) => bucket.revenue === 0)).toBe(true);
  });

  it('keeps monthly breakdown totals consistent with the period summary', () => {
    const anchor = new Date(2026, 9, 15);
    const orders = [
      paidGcash(new Date(2026, 9, 2, 8, 0, 0), { id: 'a', total: 100 }),
      paidGcash(new Date(2026, 9, 2, 18, 0, 0), { id: 'b', total: 200 }),
      paidGcash(new Date(2026, 9, 31, 23, 0, 0), { id: 'c', total: 300 }),
      makeOrder({ id: 'unpaid', paymentStatus: 'VERIFYING', total: 900 }),
    ];
    const summary = summarizeCollectedRevenue(
      orders,
      periodRange('month', anchor)
    );
    const breakdown = revenueBreakdown(orders, 'month', anchor);

    expect(
      breakdown.reduce((sum, bucket) => sum + bucket.revenue, 0)
    ).toBe(summary.revenue);
    expect(
      breakdown.reduce((sum, bucket) => sum + bucket.paidOrderCount, 0)
    ).toBe(summary.paidOrderCount);
    expect(breakdown[1].revenue).toBe(300);
    expect(breakdown[1].paidOrderCount).toBe(2);
    expect(breakdown[30].revenue).toBe(300);
  });

  it('keeps annual breakdown totals consistent with the period summary', () => {
    const anchor = new Date(2026, 5, 15);
    const orders = [
      paidGcash(new Date(2026, 0, 10, 8, 0, 0), { id: 'jan', total: 100 }),
      paidGcash(new Date(2026, 11, 10, 8, 0, 0), { id: 'dec', total: 200 }),
    ];
    const summary = summarizeCollectedRevenue(
      orders,
      periodRange('year', anchor)
    );
    const breakdown = revenueBreakdown(orders, 'year', anchor);

    expect(
      breakdown.reduce((sum, bucket) => sum + bucket.revenue, 0)
    ).toBe(summary.revenue);
    expect(breakdown[0].revenue).toBe(100);
    expect(breakdown[11].revenue).toBe(200);
  });
});

describe('period labels', () => {
  it('describes the selected period and range', () => {
    const day = new Date(2026, 9, 21, 15, 0, 0);
    expect(startOfPeriod('day', day).getTime()).toBe(
      new Date(2026, 9, 21).getTime()
    );
    expect(financialPeriodTitle('month', day)).toContain('2026');
    expect(financialPeriodTitle('year', day)).toBe('2026');
    expect(financialPeriodRangeLabel('day', day)).toMatch(
      /12:00 AM.*11:59 PM/
    );
    expect(financialPeriodRangeLabel('month', day)).toContain('2026');
  });
});
