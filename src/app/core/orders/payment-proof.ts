/**
 * GCash payment-proof helpers for the Orders UI.
 *
 * The backend owns proof uploads (`POST /api/orders/:id/payment-proof`) and
 * admin decisions (`POST /api/admin/orders/:id/payment[-proof]`). These
 * helpers only read the live Firestore order snapshot so the page can show
 * the screenshot/status and decide which actions are safe to offer. They
 * never write payment state.
 *
 * Firestore documents may carry the canonical nested `paymentProof` record,
 * the `gcashProof` alias, or the flat `paymentProofUrl`/`proofUrl`/
 * `gcashProofUrl` aliases, so all are read. Missing, malformed or expired
 * image URLs are surfaced as an empty/unavailable image instead of breaking
 * the order row.
 */
import { PaymentProof, PaymentDecisionRecord, Order } from '@shared/models/order.model';
import { resolveProductImageSrc } from '@shared/core/products/product-image';

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = nonEmptyString(value);
    if (text) {
      return text;
    }
  }
  return '';
}

/**
 * The submitted GCash proof for an order, supporting the canonical nested
 * `paymentProof` record plus the historical aliases. Returns `null` when no
 * proof URL was stored.
 */
export function paymentProofOf(order: Order): PaymentProof | null {
  const nested = order.paymentProof ?? order.gcashProof;
  if (nested !== null && typeof nested === 'object') {
    const record = nested as unknown as Record<string, unknown>;
    const url = firstNonEmpty(record['url'], record['imageUrl']);
    if (url) {
      return {
        url,
        publicId: nonEmptyString(record['publicId']),
        mimeType: nonEmptyString(record['mimeType']),
        size:
          typeof record['size'] === 'number' && Number.isFinite(record['size'])
            ? record['size']
            : 0,
        submittedBy: nonEmptyString(record['submittedBy']),
        submittedAt:
          (record['submittedAt'] as PaymentProof['submittedAt']) ?? null,
      };
    }
  }

  const flatUrl = firstNonEmpty(
    order.paymentProofUrl,
    order.proofUrl,
    order.gcashProofUrl
  );
  if (flatUrl) {
    return {
      url: flatUrl,
      publicId: nonEmptyString(order.paymentProofPublicId),
      mimeType: nonEmptyString(order.paymentProofMimeType),
      size:
        typeof order.paymentProofSize === 'number' &&
        Number.isFinite(order.paymentProofSize)
          ? order.paymentProofSize
          : 0,
      submittedBy: nonEmptyString(order.paymentProofSubmittedBy),
      submittedAt: order.paymentProofSubmittedAt ?? null,
    };
  }

  return null;
}

/** Whether the customer has submitted a proof record (URL present). */
export function hasSubmittedPaymentProof(order: Order): boolean {
  return paymentProofOf(order) !== null;
}

/**
 * Resolves a stored proof URL into an `<img src>` value. Only displayable
 * schemes are accepted; malformed/unavailable/expired URLs resolve to `''`
 * and the page shows an "unavailable" fallback. Legacy backend-relative
 * `/uploads/...` paths are resolved against the API origin.
 */
export function resolvePaymentProofUrl(
  url: string | null | undefined
): string {
  const value = nonEmptyString(url);
  if (!value) {
    return '';
  }
  if (
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /^blob:/i.test(value)
  ) {
    return value;
  }
  if (value.startsWith('/uploads/')) {
    return resolveProductImageSrc(value);
  }
  return '';
}

/** `<img src>` for the order's proof, or `''` when none/unsupported. */
export function paymentProofImageSrc(order: Order): string {
  const proof = paymentProofOf(order);
  return proof ? resolvePaymentProofUrl(proof.url) : '';
}

/** Submission time of the proof, or `null` when not recorded. */
export function paymentProofSubmittedAt(order: Order): Order['createdAt'] {
  return paymentProofOf(order)?.submittedAt ?? null;
}

/**
 * Whether a GCash proof is waiting for an admin review: the order uses
 * GCash, payment is `VERIFYING`, and a proof record exists. COD orders and
 * already-decided payments never qualify.
 */
export function isAwaitingProofVerification(order: Order): boolean {
  return (
    String(order.paymentMethod ?? '').toUpperCase() === 'GCASH' &&
    String(order.paymentStatus ?? '').toUpperCase() === 'VERIFYING' &&
    hasSubmittedPaymentProof(order)
  );
}

/**
 * Any rejection explanation stored on the payment decision/order. The
 * current backend does not require a reason, but existing/added reason
 * fields are preserved and displayed rather than discarded.
 */
export function paymentProofRejectionReason(order: Order): string | null {
  const decision = order.paymentDecision as
    | (PaymentDecisionRecord & Record<string, unknown>)
    | null
    | undefined;
  const rawOrder = order as unknown as Record<string, unknown>;
  const reason = firstNonEmpty(
    decision?.['reason'],
    decision?.['rejectionReason'],
    rawOrder['paymentRejectionReason'],
    rawOrder['paymentProofRejectionReason'],
    rawOrder['rejectionReason']
  );
  return reason || null;
}
