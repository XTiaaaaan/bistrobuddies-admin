/**
 * Order status vocabulary shared by the Orders UI.
 *
 * The transition graph is a mirror of the backend's
 * `../bistrobuddies-backend/src/lib/validation.ts` (`ORDER_STATUS_TRANSITIONS`),
 * which is the authority: the admin page only offers transitions that the
 * backend accepts, and the backend still validates every request.
 */
import { OrderStatus } from '@shared/models/order.model';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
];

export const ORDER_STATUS_TRANSITIONS: Record<
  OrderStatus,
  readonly OrderStatus[]
> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'COMPLETED',
  'CANCELLED',
];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === 'string' &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Transitions the backend will accept from `current`. Unknown or terminal
 * statuses yield an empty list, so the UI offers no status change at all.
 */
export function allowedNextStatuses(current: unknown): OrderStatus[] {
  if (!isOrderStatus(current)) {
    return [];
  }
  return [...ORDER_STATUS_TRANSITIONS[current]];
}

/** Client-side guard used before calling the status endpoint. */
export function canTransition(current: unknown, next: unknown): boolean {
  if (!isOrderStatus(current) || !isOrderStatus(next)) {
    return false;
  }
  if (current === next) {
    // The backend treats re-sending the current status as an idempotent no-op.
    return true;
  }
  return ORDER_STATUS_TRANSITIONS[current].includes(next);
}

/** Human readable label for an order status. */
export function orderStatusLabel(status: unknown): string {
  if (!isOrderStatus(status)) {
    return typeof status === 'string' && status ? status : 'UNKNOWN';
  }
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/** Badge color for an order status (Ionic color names). */
export function orderStatusColor(status: unknown): string {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'CONFIRMED':
    case 'PREPARING':
      return 'primary';
    case 'READY':
      return 'secondary';
    case 'COMPLETED':
      return 'success';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'medium';
  }
}
