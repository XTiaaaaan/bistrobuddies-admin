/**
 * Manual refund helpers for the Orders UI.
 *
 * When a cancelled order had a confirmed payment, the admin returns the
 * money out-of-band (e.g. through their own GCash app) and records the
 * actual outcome here. Refund state is backend-owned: the admin site opens a
 * pending refund (`{ action: "PENDING" }`) and later completes it
 * (`{ action: "COMPLETE", confirmed: true }`) through
 * `POST /api/admin/orders/:id/refund` — see
 * `../bistrobuddies-backend/docs/API_CONTRACT.md` §4 "Manual refunds".
 *
 * These helpers only *read* the Firestore order snapshot so the page can
 * decide what to display and which actions to offer. Nothing here writes
 * refund state, and a refund never changes `orderStatus` or `paymentStatus`.
 */
import { Order, RefundStatus } from '@shared/models/order.model';
import { isCancelledOrder } from './order-status';
import { hasCollectedPayment } from './payment-decision';

/**
 * The normalized refund status for an order: the backend's actual values
 * (`NOT_REFUNDED`, `REFUND_PENDING`, `REFUNDED`). Historical orders without
 * the `refund` field (and documents with a malformed value, which the
 * backend also reads as its default) read as `NOT_REFUNDED`.
 */
export function refundStatusOf(order: Order): RefundStatus {
  const status = order.refund?.status;
  return status === 'REFUND_PENDING' || status === 'REFUNDED'
    ? status
    : 'NOT_REFUNDED';
}

/**
 * Whether this order is cancelled with evidence that money was collected.
 * Only the persisted payment status/history is trusted; cancellation itself
 * never implies that the customer paid.
 */
export function isCancelledPaidOrder(order: Order): boolean {
  return isCancelledOrder(order.orderStatus) && hasCollectedPayment(order);
}

/**
 * Whether the admin may open a new pending refund for this order right now.
 * Per the backend contract only a CANCELLED order whose payment is PAID and
 * which has not had a refund recorded yet (`NOT_REFUNDED`) accepts
 * `action: "PENDING"`; anything else is refused with
 * `409 order_not_refundable` / `409 refund_already_completed`.
 */
export function canStartRefund(order: Order): boolean {
  return isCancelledPaidOrder(order) && refundStatusOf(order) === 'NOT_REFUNDED';
}

/**
 * Whether the admin may mark the refund completed (money actually returned
 * to the customer). Per the backend contract this requires the order to be
 * CANCELLED with a PAID payment and a refund currently in
 * `REFUND_PENDING`; completing a refund that was never opened is refused
 * with `409 invalid_refund_transition`. `REFUNDED` is final.
 */
export function canCompleteRefund(order: Order): boolean {
  return (
    isCancelledPaidOrder(order) && refundStatusOf(order) === 'REFUND_PENDING'
  );
}

/**
 * The PHP amount recorded for the refund once opened, or the stored order
 * `total` (the refundable amount derived server-side from the paid order
 * snapshot) while the refund has not been opened yet. `null` when the order
 * carries no usable amount.
 */
export function refundAmount(order: Order): number | null {
  const recorded = order.refund?.amount;
  if (typeof recorded === 'number' && Number.isFinite(recorded)) {
    return recorded;
  }
  if (refundStatusOf(order) !== 'NOT_REFUNDED') {
    return null;
  }
  const total = order.total;
  return typeof total === 'number' && Number.isFinite(total) && total > 0
    ? total
    : null;
}

/**
 * Human-readable label for a refund status using the backend's actual
 * values; unknown values pass through upper-cased so nothing is silently
 * rewritten.
 */
export function refundStatusLabel(status: unknown): string {
  switch (String(status ?? '').toUpperCase()) {
    case 'NOT_REFUNDED':
      return 'Not refunded';
    case 'REFUND_PENDING':
      return 'Refund pending';
    case 'REFUNDED':
      return 'Refunded';
    default:
      return String(status ?? 'NOT_REFUNDED').toUpperCase();
  }
}

/** Badge color for a refund status (Ionic color names). */
export function refundStatusColor(status: unknown): string {
  switch (String(status ?? '').toUpperCase()) {
    case 'REFUND_PENDING':
      return 'warning';
    case 'REFUNDED':
      return 'success';
    default:
      return 'medium';
  }
}

/**
 * Whether the refund status is worth displaying for this order. A refund
 * status is only meaningful when persisted payment records show money was
 * actually collected, so cancelled unpaid COD orders (including legacy
 * documents with stale `refund` fields) never display one. Recorded refunds
 * for genuinely paid orders are preserved and shown as stored, and cancelled
 * paid orders show `NOT_REFUNDED` because they can still be refunded.
 */
export function showRefundStatus(order: Order): boolean {
  if (!hasCollectedPayment(order)) {
    return false;
  }
  return refundStatusOf(order) !== 'NOT_REFUNDED' || isCancelledPaidOrder(order);
}

/**
 * Explanation of why no refund action applies to this order, or `null` when
 * an action is available right now. Used for both the in-page note and to
 * block invalid calls at the handler level.
 */
export function refundActionHint(order: Order): string | null {
  if (!isCancelledPaidOrder(order)) {
    if (order.orderStatus === 'CANCELLED') {
      return 'This order was cancelled but its payment is not confirmed (PAID), so no refund is possible.';
    }
    return 'Only cancelled orders with a confirmed (PAID) payment can be refunded.';
  }
  switch (refundStatusOf(order)) {
    case 'REFUND_PENDING':
      return null; // canCompleteRefund — the pending refund can be completed.
    case 'REFUNDED':
      return 'This order has already been refunded and cannot be refunded again.';
    default:
      return null; // canStartRefund — a refund can be opened.
  }
}
