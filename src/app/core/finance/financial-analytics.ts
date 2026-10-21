import { Order } from '@shared/models/order.model';
import { toDate } from '@shared/core/format/format';
import { isCancelledOrder } from '@shared/core/orders/order-status';
import { paymentStatusOf } from '@shared/core/orders/payment-decision';

export type FinancialPeriod = 'day' | 'month' | 'year';

const COLLECTED_PAYMENT_STATUSES: ReadonlySet<string> = new Set([
  'PAID',
  'SUCCEEDED',
  'CAPTURED',
  'COMPLETED',
]);

export interface DateRange {
  start: Date;
  end: Date;
}

export interface FinancialSummary {
  revenue: number;
  paidOrderCount: number;
  undatedRevenue: number;
  undatedOrderCount: number;
  cancelledOrderCount: number;
}

export interface RevenueBucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
  revenue: number;
  paidOrderCount: number;
}

export function isCodOrder(order: Order): boolean {
  return String(order.paymentMethod ?? '').toUpperCase() === 'COD';
}

export function isCompletedCodOrder(order: Order): boolean {
  return isCodOrder(order) && order.orderStatus === 'COMPLETED';
}

export function isCollectedRevenueOrder(order: Order): boolean {
  if (isCancelledOrder(order.orderStatus)) {
    return false;
  }
  if (isCompletedCodOrder(order)) {
    return true;
  }
  return COLLECTED_PAYMENT_STATUSES.has(paymentStatusOf(order));
}

export function collectedRevenueAmount(order: Order): number | null {
  const total = order.total;
  return typeof total === 'number' && Number.isFinite(total) && total >= 0
    ? total
    : null;
}

export function revenueDate(order: Order): Date | null {
  if (!isCollectedRevenueOrder(order)) {
    return null;
  }

  const decision = order.paymentDecision;
  if (decision && String(decision.decision ?? '').toUpperCase() === 'PAID') {
    const decidedAt = toDate(decision.decidedAt);
    if (decidedAt) {
      return decidedAt;
    }
  }

  if (isCompletedCodOrder(order)) {
    return toDate(order.updatedAt);
  }

  return null;
}

export function startOfPeriod(
  period: FinancialPeriod,
  anchor: Date
): Date {
  const start = new Date(anchor.getTime());
  start.setHours(0, 0, 0, 0);
  if (period === 'month') {
    start.setDate(1);
  } else if (period === 'year') {
    start.setMonth(0, 1);
  }
  return start;
}

export function addPeriods(
  period: FinancialPeriod,
  anchor: Date,
  amount: number
): Date {
  const start = startOfPeriod(period, anchor);
  switch (period) {
    case 'day':
      return new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + amount
      );
    case 'month':
      return new Date(start.getFullYear(), start.getMonth() + amount, 1);
    case 'year':
      return new Date(start.getFullYear() + amount, 0, 1);
  }
}

export function periodRange(
  period: FinancialPeriod,
  anchor: Date
): DateRange {
  const start = startOfPeriod(period, anchor);
  return { start, end: addPeriods(period, start, 1) };
}

export function isWithinRange(date: Date, range: DateRange): boolean {
  return date.getTime() >= range.start.getTime() &&
    date.getTime() < range.end.getTime();
}

function uniqueOrders(orders: readonly Order[]): Order[] {
  const unique = new Map<string, Order>();
  let missingId = 0;
  for (const order of orders) {
    const id =
      typeof order.id === 'string' && order.id !== ''
        ? order.id
        : `__missing_id_${missingId++}`;
    if (!unique.has(id)) {
      unique.set(id, order);
    }
  }
  return [...unique.values()];
}

export function summarizeCollectedRevenue(
  orders: readonly Order[],
  range: DateRange
): FinancialSummary {
  const summary: FinancialSummary = {
    revenue: 0,
    paidOrderCount: 0,
    undatedRevenue: 0,
    undatedOrderCount: 0,
    cancelledOrderCount: 0,
  };

  for (const order of uniqueOrders(orders)) {
    if (isCancelledOrder(order.orderStatus)) {
      summary.cancelledOrderCount += 1;
      continue;
    }
    if (!isCollectedRevenueOrder(order)) {
      continue;
    }
    const amount = collectedRevenueAmount(order);
    if (amount === null) {
      continue;
    }
    const paidAt = revenueDate(order);
    if (!paidAt) {
      summary.undatedRevenue += amount;
      summary.undatedOrderCount += 1;
      continue;
    }
    if (!isWithinRange(paidAt, range)) {
      continue;
    }
    summary.revenue += amount;
    summary.paidOrderCount += 1;
  }

  return summary;
}

function bucketPeriod(period: FinancialPeriod): FinancialPeriod {
  return period === 'year' ? 'month' : 'day';
}

function bucketLabel(period: FinancialPeriod, date: Date): string {
  if (period === 'year') {
    return date.toLocaleDateString('en-PH', { month: 'short' });
  }
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

function bucketKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function bucketStarts(
  period: FinancialPeriod,
  anchor: Date
): Date[] {
  const range = periodRange(period, anchor);
  if (period === 'day') {
    return [range.start];
  }

  const starts: Date[] = [];
  const bucket: FinancialPeriod = bucketPeriod(period);
  let cursor = range.start;
  while (cursor.getTime() < range.end.getTime()) {
    starts.push(cursor);
    cursor = addPeriods(bucket, cursor, 1);
  }
  return starts;
}

export function revenueBreakdown(
  orders: readonly Order[],
  period: FinancialPeriod,
  anchor: Date
): RevenueBucket[] {
  const bucket: FinancialPeriod = bucketPeriod(period);
  const buckets: RevenueBucket[] = bucketStarts(period, anchor).map(
    (start) => {
      const end = addPeriods(bucket, start, 1);
      return {
        key: bucketKey(start),
        label: bucketLabel(period, start),
        start,
        end,
        revenue: 0,
        paidOrderCount: 0,
      };
    }
  );

  for (const order of uniqueOrders(orders)) {
    if (!isCollectedRevenueOrder(order)) {
      continue;
    }
    const amount = collectedRevenueAmount(order);
    if (amount === null) {
      continue;
    }
    const paidAt = revenueDate(order);
    if (!paidAt) {
      continue;
    }
    const target = buckets.find((item) => isWithinRange(paidAt, item));
    if (target) {
      target.revenue += amount;
      target.paidOrderCount += 1;
    }
  }

  return buckets;
}

export function financialPeriodTitle(
  period: FinancialPeriod,
  anchor: Date
): string {
  const start = startOfPeriod(period, anchor);
  if (period === 'year') {
    return String(start.getFullYear());
  }
  if (period === 'month') {
    return start.toLocaleDateString('en-PH', {
      month: 'long',
      year: 'numeric',
    });
  }
  return start.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function financialPeriodRangeLabel(
  period: FinancialPeriod,
  anchor: Date
): string {
  const range = periodRange(period, anchor);
  if (period === 'day') {
    return `${range.start.toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
    })} – ${new Date(range.end.getTime() - 1).toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }

  const lastDay = new Date(range.end.getTime() - 1);
  const first = range.start.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
  const last = lastDay.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${first} – ${last}`;
}
