/**
 * Fulfilment-aware order status helpers.
 *
 * Every order in BistroBuddies is delivered, so the backend accepts only
 * `READY -> OUT_FOR_DELIVERY -> COMPLETED` (displayed as Ready → On the Way →
 * Delivered). The stored backend values are never renamed here.
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
 * Resolves how an order was fulfilled. Newer documents carry an explicit
 * `fulfillmentType`; historic documents fall back to whether a delivery
 * address was captured. Retained for display/legacy data only: the status
 * workflow itself treats every order as delivered.
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
  return order.orderStatus === 'READY';
}

/**
 * Statuses the backend will accept from this order. A `READY` order offers
 * On the Way, never Delivered; Delivered is offered only once the order is
 * already On the Way.
 */
export function allowedNextOrderStatuses(
  order: Pick<Order, 'orderStatus' | 'fulfillmentType' | 'addressSnapshot'>
): OrderStatus[] {
  return allowedNextStatuses(order.orderStatus);
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
