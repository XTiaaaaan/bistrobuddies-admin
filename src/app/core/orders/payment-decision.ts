/**
 * Manual GCash payment-verification helpers for the Orders UI.
 *
 * The backend owns all payment state (`../bistrobuddies-backend`
 * `docs/API_CONTRACT.md` §4): customers submit `{ accountName,
 * accountNumber }` via `POST /api/orders/:id/gcash-details`, which moves a
 * GCash order to `VERIFYING`, and admins record `{ decision: "PAID" |
 * "REJECTED" }` via `POST /api/admin/orders/:id/payment`. Recording a
 * decision never changes the fulfilment field `orderStatus`.
 *
 * These helpers only *read* the Firestore order snapshot so the page can
 * decide what to display and which actions to offer. Nothing here writes
 * payment state.
 */
import { Order, PaymentDecision } from '@shared/models/order.model';
import { hasSubmittedPaymentProof } from './payment-proof';

/** Payment methods that carry customer-submitted GCash details. */
export function isGcashOrder(order: Order): boolean {
  return String(order.paymentMethod ?? '').toUpperCase() === 'GCASH';
}

/** Submitted GCash account name, or `''` when none was submitted. */
export function gcashAccountName(order: Order): string {
  const name = order.gcashDetails?.accountName;
  return typeof name === 'string' ? name.trim() : '';
}

/** Submitted GCash mobile number, or `''` when none was submitted. */
export function gcashAccountNumber(order: Order): string {
  const number = order.gcashDetails?.accountNumber;
  return typeof number === 'string' ? number.trim() : '';
}

/**
 * Whether the order carries usable submitted GCash details. `false` is the
 * normal state for COD orders, GCash orders still
 * waiting for the customer, and historical orders pre-dating the GCash
 * fields.
 */
export function hasSubmittedGcashDetails(order: Order): boolean {
  return (
    isGcashOrder(order) &&
    gcashAccountName(order) !== '' &&
    gcashAccountNumber(order) !== ''
  );
}

/** Upper-cased payment status for comparisons. */
export function paymentStatusOf(order: Order): string {
  return String(order.paymentStatus ?? '').toUpperCase();
}

/**
 * Whether the admin may record `decision` for this order right now. Per the
 * backend contract only a `VERIFYING` GCash order with submitted details
 * accepts a decision; approval (`PAID`) additionally requires the uploaded
 * payment proof. `PAID` is final, `REJECTED` needs a customer resubmission
 * first (which returns the order to `VERIFYING`), and non-GCash orders are
 * rejected with `invalid_payment_method`.
 */
export function canDecidePayment(
  order: Order,
  decision: PaymentDecision
): boolean {
  if (decision !== 'PAID' && decision !== 'REJECTED') {
    return false;
  }
  if (
    !hasSubmittedGcashDetails(order) ||
    paymentStatusOf(order) !== 'VERIFYING'
  ) {
    return false;
  }
  return decision === 'REJECTED' || hasSubmittedPaymentProof(order);
}

/** Whether the Confirm Payment button applies to this order. */
export function canConfirmPayment(order: Order): boolean {
  return canDecidePayment(order, 'PAID');
}

/** Whether the Reject Payment button applies to this order. */
export function canRejectPayment(order: Order): boolean {
  return canDecidePayment(order, 'REJECTED');
}

/**
 * Human-readable note explaining why no payment decision is offered, or
 * `null` when the order is ready for a decision. Returns `null` for
 * non-GCash orders too — the page shows those a method-specific note instead.
 */
export function paymentDecisionHint(order: Order): string | null {
  if (!isGcashOrder(order)) {
    return null;
  }
  switch (paymentStatusOf(order)) {
    case 'PAID':
      return 'Payment already confirmed — no further action needed.';
    case 'REJECTED':
      return 'Payment was rejected. The order returns here automatically if the customer resubmits GCash details.';
    case 'VERIFYING':
      if (!hasSubmittedGcashDetails(order)) {
        return 'Waiting for the customer to submit GCash details.';
      }
      return hasSubmittedPaymentProof(order)
        ? null
        : 'GCash details received, but the payment screenshot has not been uploaded yet. Approval requires proof; rejection is still possible.';
    default:
      // The backend moves an order to VERIFYING in the same transaction that
      // stores the details, so details with any other status only happen
      // mid-flight — the live order listener resolves it on its own.
      return hasSubmittedGcashDetails(order)
        ? 'Payment details received — refresh if this looks stale.'
        : 'No GCash details submitted yet. Actions appear once the customer submits them.';
  }
}

/** Note shown for orders that can never receive a GCash payment decision. */
export function nonGcashPaymentNote(order: Order): string {
  return String(order.paymentMethod ?? '').toUpperCase() === 'COD'
    ? 'Cash on delivery — no online payment to verify.'
    : 'Only GCash orders can receive a payment decision.';
}
