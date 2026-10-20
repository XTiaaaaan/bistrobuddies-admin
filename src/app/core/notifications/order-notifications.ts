/**
 * New-order and GCash-proof alert detection for the admin in-app bell.
 *
 * Alerts are derived from the admin-only live `orders` Firestore listener.
 * The first snapshot only establishes a baseline, so orders that already
 * existed when the page loaded are never announced as new. Every later
 * snapshot is diffed against the ids/proofs already seen, making repeated
 * emissions (status updates, payment decisions, reconnects) idempotent.
 */
import { Order } from '@shared/models/order.model';
import { formatPhp, shortId } from '@shared/core/format/format';
import {
  isAwaitingProofVerification,
  paymentProofOf,
} from '@shared/core/orders/payment-proof';

export type AdminNotificationKind = 'NEW_ORDER' | 'PAYMENT_PROOF';

export interface AdminNotificationSeed {
  /** Stable id so the same event can never produce two alerts. */
  id: string;
  kind: AdminNotificationKind;
  orderId: string;
  title: string;
  body: string;
}

export interface OrderNotificationState {
  initialized: boolean;
  seenOrderIds: ReadonlySet<string>;
  seenProofKeys: ReadonlySet<string>;
}

export interface OrderNotificationScan {
  state: OrderNotificationState;
  notifications: AdminNotificationSeed[];
}

export function createOrderNotificationState(): OrderNotificationState {
  return {
    initialized: false,
    seenOrderIds: new Set<string>(),
    seenProofKeys: new Set<string>(),
  };
}

/**
 * Fingerprint of a GCash proof awaiting verification. The Cloudinary
 * `publicId` is stable across unrelated order updates; the stored URL and
 * submission time are fallbacks for legacy/flat proof records.
 */
export function proofNotificationKey(order: Order): string | null {
  if (!isAwaitingProofVerification(order)) {
    return null;
  }
  const proof = paymentProofOf(order);
  if (!proof) {
    return null;
  }
  const fingerprint = proof.publicId || proof.url || '';
  const submittedAt =
    typeof proof.submittedAt === 'string' ||
    typeof proof.submittedAt === 'number'
      ? String(proof.submittedAt)
      : '';
  return `${order.id}:${fingerprint || submittedAt}`;
}

function customerName(order: Order): string {
  return order.customerSnapshot?.name?.trim() || 'A customer';
}

function newOrderNotification(order: Order): AdminNotificationSeed {
  return {
    id: `new-order:${order.id}`,
    kind: 'NEW_ORDER',
    orderId: order.id,
    title: 'New order',
    body: `${customerName(order)} placed order ${shortId(order.id)} (${formatPhp(
      order.total
    )}).`,
  };
}

function paymentProofNotification(order: Order): AdminNotificationSeed {
  return {
    id: `payment-proof:${order.id}:${
      proofNotificationKey(order) ?? ''
    }`,
    kind: 'PAYMENT_PROOF',
    orderId: order.id,
    title: 'GCash proof submitted',
    body: `${customerName(order)} submitted payment proof for order ${shortId(
      order.id
    )} (${formatPhp(order.total)}). Review it before confirming payment.`,
  };
}

/**
 * Compares one Firestore snapshot with the previous state. The first call
 * seeds the baseline and returns no alerts.
 */
export function detectOrderNotifications(
  state: OrderNotificationState,
  orders: readonly Order[]
): OrderNotificationScan {
  const seenOrderIds = new Set(state.seenOrderIds);
  const seenProofKeys = new Set(state.seenProofKeys);
  const notifications: AdminNotificationSeed[] = [];

  if (!state.initialized) {
    for (const order of orders) {
      if (!order.id) {
        continue;
      }
      seenOrderIds.add(order.id);
      const key = proofNotificationKey(order);
      if (key) {
        seenProofKeys.add(key);
      }
    }
    return {
      state: { initialized: true, seenOrderIds, seenProofKeys },
      notifications,
    };
  }

  for (const order of orders) {
    if (!order.id) {
      continue;
    }
    if (!seenOrderIds.has(order.id)) {
      seenOrderIds.add(order.id);
      notifications.push(newOrderNotification(order));
    }
    const proofKey = proofNotificationKey(order);
    if (proofKey && !seenProofKeys.has(proofKey)) {
      seenProofKeys.add(proofKey);
      notifications.push(paymentProofNotification(order));
    }
  }

  return {
    state: { initialized: true, seenOrderIds, seenProofKeys },
    notifications,
  };
}
