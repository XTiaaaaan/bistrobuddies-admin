import {
  ORDER_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  allowedNextStatuses,
  canTransition,
  isOrderStatus,
  orderStatusColor,
  orderStatusLabel,
} from './order-status';

describe('order status helpers', () => {
  it('mirrors the backend status graph', () => {
    expect(ORDER_STATUSES).toEqual([
      'PENDING',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'COMPLETED',
      'CANCELLED',
    ]);
    expect(ORDER_STATUS_TRANSITIONS.PENDING).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(ORDER_STATUS_TRANSITIONS.CONFIRMED).toEqual([
      'PREPARING',
      'CANCELLED',
    ]);
    expect(ORDER_STATUS_TRANSITIONS.PREPARING).toEqual(['READY', 'CANCELLED']);
    expect(ORDER_STATUS_TRANSITIONS.READY).toEqual(['COMPLETED', 'CANCELLED']);
    expect(ORDER_STATUS_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('only offers transitions the backend accepts', () => {
    expect(allowedNextStatuses('PENDING')).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(allowedNextStatuses('READY')).toEqual(['COMPLETED', 'CANCELLED']);
    expect(allowedNextStatuses('COMPLETED')).toEqual([]);
    expect(allowedNextStatuses('CANCELLED')).toEqual([]);
    expect(allowedNextStatuses('NOT_A_STATUS')).toEqual([]);
    expect(allowedNextStatuses(undefined)).toEqual([]);
  });

  it('rejects invalid transitions and accepts valid ones', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
    expect(canTransition('PENDING', 'PREPARING')).toBe(false);
    expect(canTransition('COMPLETED', 'PENDING')).toBe(false);
    expect(canTransition('CANCELLED', 'READY')).toBe(false);
    expect(canTransition('BOGUS', 'PENDING')).toBe(false);
    expect(canTransition('PENDING', 'BOGUS')).toBe(false);
  });

  it('treats re-sending the current status as an idempotent no-op', () => {
    expect(canTransition('PENDING', 'PENDING')).toBe(true);
    expect(canTransition('COMPLETED', 'COMPLETED')).toBe(true);
  });

  it('recognizes known statuses only', () => {
    expect(isOrderStatus('READY')).toBe(true);
    expect(isOrderStatus('ready')).toBe(false);
    expect(isOrderStatus(7)).toBe(false);
  });

  it('labels and colors statuses for display', () => {
    expect(orderStatusLabel('PENDING')).toBe('Pending');
    expect(orderStatusLabel('CANCELLED')).toBe('Cancelled');
    expect(orderStatusLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
    expect(orderStatusColor('PENDING')).toBe('warning');
    expect(orderStatusColor('COMPLETED')).toBe('success');
    expect(orderStatusColor('CANCELLED')).toBe('danger');
    expect(orderStatusColor('unknown')).toBe('medium');
  });
});
