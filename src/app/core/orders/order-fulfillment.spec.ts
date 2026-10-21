import { Order, OrderStatus } from '@shared/models/order.model';
import {
  allowedNextOrderStatuses,
  canDispatchOrder,
  canTransitionOrder,
  resolveFulfillmentType,
} from './order-fulfillment';

function makeOrder(
  overrides: Partial<
    Pick<Order, 'orderStatus' | 'fulfillmentType' | 'addressSnapshot'>
  > = {}
): Pick<Order, 'orderStatus' | 'fulfillmentType' | 'addressSnapshot'> {
  return {
    orderStatus: 'READY',
    fulfillmentType: null,
    addressSnapshot: {
      recipientName: 'Juan dela Cruz',
      phone: '09171234567',
      address: '123 Sampaloc Street',
      city: 'Manila',
    },
    ...overrides,
  };
}

describe('fulfilment-aware order statuses', () => {
  it('prefers an explicit fulfilment type over the address fallback', () => {
    expect(
      resolveFulfillmentType(
        makeOrder({ fulfillmentType: 'pickup', addressSnapshot: null })
      )
    ).toBe('PICKUP');
    expect(
      resolveFulfillmentType(
        makeOrder({ fulfillmentType: 'self-collect', addressSnapshot: null })
      )
    ).toBe('PICKUP');
    expect(
      resolveFulfillmentType(
        makeOrder({
          fulfillmentType: 'DELIVERY',
          addressSnapshot: null,
        })
      )
    ).toBe('DELIVERY');
  });

  it('falls back to the delivery address for historic orders', () => {
    expect(resolveFulfillmentType(makeOrder())).toBe('DELIVERY');
    expect(
      resolveFulfillmentType(
        makeOrder({
          addressSnapshot: {
            recipientName: 'Juan',
            phone: '09171234567',
            address: '   ',
          },
        })
      )
    ).toBe('PICKUP');
    expect(
      resolveFulfillmentType(makeOrder({ addressSnapshot: null }))
    ).toBe('PICKUP');
  });

  it('treats an existing OUT_FOR_DELIVERY order as a delivery order', () => {
    expect(
      resolveFulfillmentType(
        makeOrder({
          orderStatus: 'OUT_FOR_DELIVERY',
          fulfillmentType: null,
          addressSnapshot: null,
        })
      )
    ).toBe('DELIVERY');
    // Only READY orders can be dispatched.
    expect(canDispatchOrder(makeOrder({ orderStatus: 'OUT_FOR_DELIVERY' }))).toBe(
      false
    );
  });

  it('offers On the Way (not Delivered) once an order is READY', () => {
    const delivery = makeOrder({ orderStatus: 'READY' });
    expect(allowedNextOrderStatuses(delivery)).toEqual([
      'OUT_FOR_DELIVERY',
      'CANCELLED',
    ]);
    expect(allowedNextOrderStatuses(delivery)).not.toContain('COMPLETED');
    expect(canDispatchOrder(delivery)).toBe(true);
    expect(canTransitionOrder(delivery, 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canTransitionOrder(delivery, 'COMPLETED')).toBe(false);
  });

  it('treats every order as a delivery order for the status workflow', () => {
    const pickup = makeOrder({ orderStatus: 'READY', fulfillmentType: 'PICKUP' });
    expect(allowedNextOrderStatuses(pickup)).toEqual([
      'OUT_FOR_DELIVERY',
      'CANCELLED',
    ]);
    expect(canDispatchOrder(pickup)).toBe(true);
    expect(canTransitionOrder(pickup, 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canTransitionOrder(pickup, 'COMPLETED')).toBe(false);
  });

  it('allows a dispatched delivery order to complete', () => {
    const order = makeOrder({ orderStatus: 'OUT_FOR_DELIVERY' });
    expect(allowedNextOrderStatuses(order)).toEqual(['COMPLETED', 'CANCELLED']);
    expect(canTransitionOrder(order, 'COMPLETED')).toBe(true);
  });

  it('keeps the global transition graph for earlier stages', () => {
    for (const orderStatus of [
      'PENDING',
      'CONFIRMED',
      'PREPARING',
    ] as OrderStatus[]) {
      const order = makeOrder({ orderStatus });
      expect(allowedNextOrderStatuses(order)).not.toContain(
        'OUT_FOR_DELIVERY'
      );
      expect(canTransitionOrder(order, 'OUT_FOR_DELIVERY')).toBe(false);
    }
  });
});
