import { Order, OrderStatus } from '@shared/models/order.model';
import { allowedNextStatuses, canTransition } from './order-status';

export type FulfillmentType = 'DELIVERY' | 'PICKUP';

type FulfillmentOrder = Pick<
  Order,
  'orderStatus' | 'fulfillmentType' | 'addressSnapshot'
>;

export function resolveFulfillmentType(order: FulfillmentOrder): FulfillmentType {
  const explicit = normalizeFulfillmentType(order.fulfillmentType);
  if (explicit) {
    return explicit;
  }
  if (order.orderStatus === 'OUT_FOR_DELIVERY') {
    return 'DELIVERY';
  }
  const address = order.addressSnapshot?.address?.trim();
  return address ? 'DELIVERY' : 'PICKUP';
}

export function isDeliveryOrder(order: FulfillmentOrder): boolean {
  return resolveFulfillmentType(order) === 'DELIVERY';
}

export function fulfillmentLabel(order: FulfillmentOrder): string {
  return isDeliveryOrder(order) ? 'Delivery' : 'Pickup';
}

export function allowedNextStatusesForOrder(order: FulfillmentOrder): OrderStatus[] {
  const next = allowedNextStatuses(order.orderStatus);
  if (isDeliveryOrder(order)) {
    return next;
  }
  return next.filter((status) => status !== 'OUT_FOR_DELIVERY');
}

export function canTransitionOrder(
  order: FulfillmentOrder,
  next: unknown
): boolean {
  if (!canTransition(order.orderStatus, next)) {
    return false;
  }
  if (next === 'OUT_FOR_DELIVERY' && !isDeliveryOrder(order)) {
    return false;
  }
  return true;
}

function normalizeFulfillmentType(
  value: string | null | undefined
): FulfillmentType | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase().replace(/[\s_-]+/g, '');
  if (
    normalized === 'PICKUP' ||
    normalized === 'SELFCOLLECT' ||
    normalized === 'SELFCOLLECTION' ||
    normalized === 'COLLECT'
  ) {
    return 'PICKUP';
  }
  if (
    normalized === 'DELIVERY' ||
    normalized === 'DELIVER' ||
    normalized === 'SHIPPING' ||
    normalized === 'COURIER'
  ) {
    return 'DELIVERY';
  }
  return null;
}
