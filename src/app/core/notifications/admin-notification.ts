import { Order } from '@shared/models/order.model';
import { toDate, shortId } from '../format/format';
import {
  isAwaitingProofVerification,
  paymentProofOf,
} from '../orders/payment-proof';

export type AdminNotificationKind = 'NEW_ORDER' | 'GCASH_PROOF';

export interface AdminNotification {
  id: string;
  kind: AdminNotificationKind;
  orderId: string;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}

export interface AdminNotificationState {
  initialized: boolean;
  orderIds: ReadonlySet<string>;
  proofKeys: ReadonlySet<string>;
}

export interface AdminNotificationUpdate {
  state: AdminNotificationState;
  notifications: AdminNotification[];
}

export const EMPTY_ADMIN_NOTIFICATION_STATE: AdminNotificationState = {
  initialized: false,
  orderIds: new Set<string>(),
  proofKeys: new Set<string>(),
};

export function paymentProofNotificationKey(order: Order): string | null {
  const proof = paymentProofOf(order);
  if (!proof) {
    return null;
  }
  const asset = proof.publicId?.trim() || proof.url?.trim() || '';
  if (!asset) {
    return null;
  }
  const submitted = toDate(proof.submittedAt)?.getTime() ?? '';
  return `${order.id}:${asset}:${submitted}`;
}

export function newOrderNotification(
  order: Order,
  now: number = Date.now()
): AdminNotification {
  const customer = order.customerSnapshot?.name?.trim() || 'a customer';
  return {
    id: `new-order:${order.id}`,
    kind: 'NEW_ORDER',
    orderId: order.id,
    title: 'New order',
    message: `${shortId(order.id)} was placed by ${customer}.`,
    createdAt: now,
    read: false,
  };
}

export function gcashProofNotification(
  order: Order,
  now: number = Date.now()
): AdminNotification {
  const key = paymentProofNotificationKey(order) ?? `gcash-proof:${order.id}`;
  return {
    id: `gcash-proof:${key}`,
    kind: 'GCASH_PROOF',
    orderId: order.id,
    title: 'Payment proof submitted',
    message: `GCash proof for ${shortId(order.id)} needs review.`,
    createdAt: now,
    read: false,
  };
}

export function reconcileAdminNotifications(
  state: AdminNotificationState,
  orders: readonly Order[],
  now: number = Date.now()
): AdminNotificationUpdate {
  const orderIds = new Set(state.orderIds);
  const proofKeys = new Set(state.proofKeys);
  const notifications: AdminNotification[] = [];
  const firstRun = !state.initialized;

  for (const order of orders) {
    if (!order?.id) {
      continue;
    }

    const isNewOrder = !orderIds.has(order.id);
    orderIds.add(order.id);

    const proofKey = paymentProofNotificationKey(order);
    if (proofKey && !proofKeys.has(proofKey)) {
      if (firstRun) {
        proofKeys.add(proofKey);
      } else if (isAwaitingProofVerification(order)) {
        proofKeys.add(proofKey);
        notifications.push(gcashProofNotification(order, now));
      }
    }

    if (!firstRun && isNewOrder) {
      notifications.push(newOrderNotification(order, now));
    }
  }

  return {
    state: { initialized: true, orderIds, proofKeys },
    notifications,
  };
}

export function unreadNotificationCount(
  notifications: readonly AdminNotification[]
): number {
  return notifications.reduce(
    (count, notification) => (notification.read ? count : count + 1),
    0
  );
}

export function mergeAdminNotifications(
  existing: readonly AdminNotification[],
  incoming: readonly AdminNotification[]
): AdminNotification[] {
  const byId = new Map<string, AdminNotification>();
  for (const notification of existing) {
    byId.set(notification.id, notification);
  }
  for (const notification of incoming) {
    if (!byId.has(notification.id)) {
      byId.set(notification.id, notification);
    }
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}
