/**
 * Fulfilment-aware order status helpers.
 *
 * The backend accepts `READY -> OUT_FOR_DELIVERY -> COMPLETED` for delivery
 * orders and `READY -> COMPLETED` for pickup orders. Both transitions exist
 * in the shared status graph; this module removes the delivery-only hop from
 * pickup orders without changing the stored backend value.
 */
import { Order, OrderStatus } from '@shared/models/order.model';
import {
  allowedNextStatuses,
  canTransition,
  isOrderStatus,
} from './order-status';

export type FulfillmentType = 'DELIVERY' | 'PICKUP';

type FulfillmentFields = Pick<Order, 'fulfillmentType' | 'addressSnapshot'> & {
  orderStatus?: string;
};

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

/**
 * Resolves how an order is fulfilled. Newer documents carry an explicit
 * `fulfillmentType`; historic documents (and the current delivery-only
 * checkout) fall back to whether a delivery address was captured. A missing
 * address is treated as pickup so it is never forced through On the Way.
 */
export function resolveFulfillmentType(
  order: FulfillmentFields
): FulfillmentType {
  if (order.orderStatus === 'OUT_FOR_DELIVERY') {
    // Only delivery orders can reach this status.
    return 'DELIVERY';
  }
  const explicit = normalizeFulfillmentType(order.fulfillmentType);
  if (explicit) {
    return explicit;
  }
  const address = order.addressSnapshot?.address?.trim();
  return address ? 'DELIVERY' : 'PICKUP';
}

/** Whether the order may be marked out for delivery right now. */
export function canDispatchOrder(
  order: Pick<Order, 'orderStatus' | 'fulfillmentType' | 'addressSnapshot'>
): boolean {
  return (
    order.orderStatus === 'READY' &&
    resolveFulfillmentType(order) === 'DELIVERY'
  );
}

/**
 * Statuses the backend will accept from this order, filtered for fulfilment
 * mode. Delivery orders at `READY` offer On the Way; pickup orders never do.
 */
export function allowedNextOrderStatuses(
  order: Pick<Order, 'orderStatus' | 'fulfillmentType' | 'addressSnapshot'>
): OrderStatus[] {
  const next = allowedNextStatuses(order.orderStatus);
  if (order.orderStatus !== 'READY') {
    return next;
  }
  return resolveFulfillmentType(order) === 'PICKUP'
    ? next.filter((status) => status !== 'OUT_FOR_DELIVERY')
    : next;
}

/**
 * Client-side guard before calling the status endpoint. The backend always
 * re-validates the transition and the caller's administrator role.
 */
export function canTransitionOrder(
  order: Pick<Order, 'orderStatus' | 'fulfillmentType' | 'addressSnapshot'>,
  next: unknown
): boolean {
  if (!isOrderStatus(next)) {
    return false;
  }
  if (next === 'OUT_FOR_DELIVERY' && !canDispatchOrder(order)) {
    return false;
  }
  return canTransition(order.orderStatus, next);
}
