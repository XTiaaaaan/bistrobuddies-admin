import { Order } from '@shared/models/order.model';
import { hasCollectedPayment } from './payment-decision';
import {
  canCompleteRefund,
  canStartRefund,
  isCancelledPaidOrder,
  refundActionHint,
  refundAmount,
  refundStatusColor,
  refundStatusLabel,
  refundStatusOf,
  showRefundStatus,
} from './refund';

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
    gcashDetails: {
      accountName: 'Juan dela Cruz',
      accountNumber: '09171234567',
    },
    orderStatus: 'PENDING',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

/** A cancelled order whose payment was confirmed before the cancellation. */
function paidCancelled(overrides: Partial<Order> = {}): Order {
  return makeOrder({ orderStatus: 'CANCELLED', ...overrides });
}

describe('refund status reading', () => {
  it('reads the backend values exactly', () => {
    expect(refundStatusOf(paidCancelled())).toBe('NOT_REFUNDED');
    expect(
      refundStatusOf(paidCancelled({ refund: { status: 'REFUND_PENDING' } }))
    ).toBe('REFUND_PENDING');
    expect(
      refundStatusOf(paidCancelled({ refund: { status: 'REFUNDED' } }))
    ).toBe('REFUNDED');
  });

  it('normalizes historical orders and malformed values to NOT_REFUNDED', () => {
    const historic = paidCancelled();
    delete historic.refund;
    expect(refundStatusOf(historic)).toBe('NOT_REFUNDED');
    expect(
      refundStatusOf(paidCancelled({ refund: { status: 'SOMETHING_ELSE' } }))
    ).toBe('NOT_REFUNDED');
    expect(refundStatusOf(paidCancelled({ refund: null }))).toBe('NOT_REFUNDED');
  });
});

describe('refund eligibility', () => {
  it('allows opening a refund only for cancelled PAID orders not yet refunded', () => {
    expect(canStartRefund(paidCancelled())).toBe(true);
  });

  it('hides the refund action for non-cancelled orders', () => {
    for (const orderStatus of [
      'PENDING',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'COMPLETED',
    ] as const) {
      expect(canStartRefund(makeOrder({ orderStatus }))).toBe(false);
      expect(canCompleteRefund(makeOrder({ orderStatus }))).toBe(false);
    }
  });

  it('hides the refund action for unpaid or undecided payments', () => {
    for (const paymentStatus of [
      'PENDING',
      'VERIFYING',
      'REJECTED',
      'SOMETHING_ELSE',
    ]) {
      const order = paidCancelled({ paymentStatus, gcashDetails: null });
      expect(canStartRefund(order)).toBe(false);
      expect(canCompleteRefund(order)).toBe(false);
    }
  });

  it('offers the pending action once, the complete action only while pending', () => {
    expect(canStartRefund(paidCancelled())).toBe(true);
    expect(canCompleteRefund(paidCancelled())).toBe(false);

    const pending = paidCancelled({ refund: { status: 'REFUND_PENDING' } });
    expect(canStartRefund(pending)).toBe(false);
    expect(canCompleteRefund(pending)).toBe(true);

    // REFUNDED is final: never startable, never completable.
    const refunded = paidCancelled({ refund: { status: 'REFUNDED' } });
    expect(canStartRefund(refunded)).toBe(false);
    expect(canCompleteRefund(refunded)).toBe(false);
  });

  it('recognizes cancelled paid orders as the refundable group', () => {
    expect(isCancelledPaidOrder(paidCancelled())).toBe(true);
    expect(isCancelledPaidOrder(makeOrder())).toBe(false);
    expect(isCancelledPaidOrder(paidCancelled({ paymentStatus: 'VERIFYING' }))).toBe(
      false
    );
  });

  it('explains why no action applies', () => {
    expect(refundActionHint(paidCancelled())).toBeNull();
    expect(
      refundActionHint(paidCancelled({ refund: { status: 'REFUND_PENDING' } }))
    ).toBeNull();
    expect(
      refundActionHint(paidCancelled({ refund: { status: 'REFUNDED' } }))
    ).toMatch(/already been refunded/i);
    expect(refundActionHint(makeOrder())).toMatch(/cancelled orders/i);
    expect(refundActionHint(paidCancelled({ paymentStatus: 'REJECTED' }))).toMatch(
      /not confirmed/i
    );
  });
});

describe('cancelled COD refund rules', () => {
  /** A cancelled COD order whose cash was never collected. */
  function cancelledUnpaidCod(overrides: Partial<Order> = {}): Order {
    return paidCancelled({
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      gcashDetails: null,
      ...overrides,
    });
  }

  it('does not display or offer a refund for a cancelled unpaid COD order', () => {
    const order = cancelledUnpaidCod();

    expect(isCancelledPaidOrder(order)).toBe(false);
    expect(showRefundStatus(order)).toBe(false);
    expect(canStartRefund(order)).toBe(false);
    expect(canCompleteRefund(order)).toBe(false);
    expect(refundActionHint(order)).toMatch(/not confirmed/i);
  });

  it('hides legacy misleading refund fields without rewriting them', () => {
    const legacy = cancelledUnpaidCod({
      refund: {
        status: 'REFUND_PENDING',
        amount: 215,
        requestedAt: '2026-10-20T08:00:00.000Z',
      },
    });

    expect(refundStatusOf(legacy)).toBe('REFUND_PENDING');
    expect(showRefundStatus(legacy)).toBe(false);
    expect(canStartRefund(legacy)).toBe(false);
    expect(canCompleteRefund(legacy)).toBe(false);
    // The historical values are still readable for inspection.
    expect(legacy.refund?.amount).toBe(215);
    expect(legacy.refund?.requestedAt).toBe('2026-10-20T08:00:00.000Z');
  });

  it('keeps refund handling for a cancelled COD order with collected cash', () => {
    const paid = cancelledUnpaidCod({ paymentStatus: 'PAID' });

    expect(isCancelledPaidOrder(paid)).toBe(true);
    expect(showRefundStatus(paid)).toBe(true);
    expect(canStartRefund(paid)).toBe(true);
    expect(refundAmount(paid)).toBe(215);

    const pending = cancelledUnpaidCod({
      paymentStatus: 'PAID',
      refund: { status: 'REFUND_PENDING', amount: 215 },
    });
    expect(showRefundStatus(pending)).toBe(true);
    expect(canCompleteRefund(pending)).toBe(true);
  });

  it('recognizes collected cash from the persisted payment audit history', () => {
    const legacyPaid = cancelledUnpaidCod({
      paymentStatus: 'CANCELLED',
      paymentAudit: [
        {
          from: 'PENDING',
          to: 'PAID',
          actorUid: 'admin-1',
          actorRole: 'admin',
        },
      ],
    });

    expect(isCancelledPaidOrder(legacyPaid)).toBe(true);
    expect(showRefundStatus(legacyPaid)).toBe(true);
    expect(canStartRefund(legacyPaid)).toBe(true);
  });

  it('does not infer payment from the cancelled order status alone', () => {
    const order = cancelledUnpaidCod({
      paymentStatus: 'CANCELLED',
      paymentAudit: [
        {
          from: 'PENDING',
          to: 'CANCELLED',
          actorUid: 'admin-1',
          actorRole: 'admin',
        },
      ],
    });

    expect(hasCollectedPayment(order)).toBe(false);
    expect(isCancelledPaidOrder(order)).toBe(false);
    expect(showRefundStatus(order)).toBe(false);
  });
});

describe('cancelled GCash refund rules', () => {
  it('keeps the existing paid GCash refund workflow', () => {
    const paid = paidCancelled({ paymentMethod: 'GCASH' });
    expect(showRefundStatus(paid)).toBe(true);
    expect(canStartRefund(paid)).toBe(true);
  });

  it('does not display a refund for a cancelled unpaid GCash order', () => {
    const unpaid = paidCancelled({
      paymentMethod: 'GCASH',
      paymentStatus: 'VERIFYING',
      refund: { status: 'REFUND_PENDING' },
    });

    expect(showRefundStatus(unpaid)).toBe(false);
    expect(canStartRefund(unpaid)).toBe(false);
    expect(canCompleteRefund(unpaid)).toBe(false);
  });
});

describe('refund history preservation', () => {
  it('preserves recorded refund facts for a genuinely paid order', () => {
    const refund = {
      status: 'REFUNDED',
      amount: 215,
      requestedAt: '2026-10-20T08:00:00.000Z',
      completedAt: '2026-10-21T08:00:00.000Z',
      requestedBy: 'admin-1',
      completedBy: 'admin-1',
    };
    const order = paidCancelled({
      refund,
      refundAudit: [
        {
          from: 'NOT_REFUNDED',
          to: 'REFUND_PENDING',
          actorUid: 'admin-1',
          actorRole: 'admin',
        },
        {
          from: 'REFUND_PENDING',
          to: 'REFUNDED',
          actorUid: 'admin-1',
          actorRole: 'admin',
        },
      ],
    });

    expect(showRefundStatus(order)).toBe(true);
    expect(refundStatusOf(order)).toBe('REFUNDED');
    expect(refundAmount(order)).toBe(215);
    expect(order.refund).toEqual(refund);
    expect(order.refundAudit).toHaveLength(2);

    const legacyStatus = paidCancelled({
      paymentStatus: 'REFUNDED',
      refund,
    });
    expect(showRefundStatus(legacyStatus)).toBe(true);
    expect(refundStatusOf(legacyStatus)).toBe('REFUNDED');
    expect(refundAmount(legacyStatus)).toBe(215);
  });
});

describe('refund display', () => {
  it('displays the backend status values without inventing new ones', () => {
    expect(refundStatusLabel('NOT_REFUNDED')).toBe('Not refunded');
    expect(refundStatusLabel('REFUND_PENDING')).toBe('Refund pending');
    expect(refundStatusLabel('REFUNDED')).toBe('Refunded');
    // Unknown stored values pass through instead of being silently renamed.
    expect(refundStatusLabel('WEIRD')).toBe('WEIRD');
  });

  it('colors pending as warning, refunded as success, default as muted', () => {
    expect(refundStatusColor('NOT_REFUNDED')).toBe('medium');
    expect(refundStatusColor('REFUND_PENDING')).toBe('warning');
    expect(refundStatusColor('REFUNDED')).toBe('success');
  });

  it('shows the status for recorded refunds and for cancelled paid orders', () => {
    expect(showRefundStatus(paidCancelled())).toBe(true);
    expect(
      showRefundStatus(paidCancelled({ refund: { status: 'REFUND_PENDING' } }))
    ).toBe(true);
    expect(showRefundStatus(paidCancelled({ refund: { status: 'REFUNDED' } }))).toBe(
      true
    );
    // Not relevant for active orders or cancelled unpaid ones.
    expect(showRefundStatus(makeOrder())).toBe(false);
    expect(
      showRefundStatus(paidCancelled({ paymentStatus: 'PENDING', gcashDetails: null }))
    ).toBe(false);
  });

  it('uses the recorded amount once opened and the paid total before that', () => {
    expect(refundAmount(paidCancelled())).toBe(215);
    expect(
      refundAmount(
        paidCancelled({
          refund: { status: 'REFUND_PENDING', amount: 215 },
        })
      )
    ).toBe(215);
    // A completed refund keeps its recorded amount.
    expect(
      refundAmount(paidCancelled({ refund: { status: 'REFUNDED', amount: 215 } }))
    ).toBe(215);
    expect(
      refundAmount(paidCancelled({ refund: { status: 'REFUND_PENDING' } }))
    ).toBeNull();
    expect(refundAmount(paidCancelled({ total: 0 }))).toBeNull();
  });
});
