import { Order } from '@shared/models/order.model';
import {
  allowedNextStatusesForOrder,
  canTransitionOrder,
  fulfillmentLabel,
  isDeliveryOrder,
  resolveFulfillmentType,
} from './fulfillment';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    customerId: 'uid-1',
    customerSnapshot: null,
    addressSnapshot: {
      recipientName: 'Juan dela Cruz',
      phone: '09171234567',
      address: '123 Sampaloc Street',
      city: 'Manila',
    },
    items: [],
    subtotal: 100,
    deliveryFee: 0,
    total: 100,
    customerComment: '',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    orderStatus: 'READY',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('order fulfilment helpers', () => {
  it('uses an explicit fulfillmentType when present', () => {
    expect(
      resolveFulfillmentType(makeOrder({ fulfillmentType: 'PICKUP' }))
    ).toBe('PICKUP');
    expect(
      resolveFulfillmentType(makeOrder({ fulfillmentType: 'DELIVERY' }))
    ).toBe('DELIVERY');
  });

  it('normalizes known fulfilment aliases from the customer app', () => {
    expect(
      resolveFulfillmentType(makeOrder({ fulfillmentType: 'self-collect' }))
    ).toBe('PICKUP');
    expect(
      resolveFulfillmentType(makeOrder({ fulfillmentType: 'courier' }))
    ).toBe('DELIVERY');
  });

  it('falls back to the delivery address for historic documents', () => {
    const delivery = makeOrder({ fulfillmentType: null });
    expect(resolveFulfillmentType(delivery)).toBe('DELIVERY');
    expect(isDeliveryOrder(delivery)).toBe(true);

    const pickup = makeOrder({
      fulfillmentType: null,
      addressSnapshot: {
        recipientName: '',
        phone: '',
        address: '',
      },
    });
    expect(resolveFulfillmentType(pickup)).toBe('PICKUP');
    expect(isDeliveryOrder(pickup)).toBe(false);
  });

  it('treats an OUT_FOR_DELIVERY order as delivery even without an address', () => {
    const order = makeOrder({
      orderStatus: 'OUT_FOR_DELIVERY',
      fulfillmentType: null,
      addressSnapshot: null,
    });
    expect(resolveFulfillmentType(order)).toBe('DELIVERY');
  });

  it('offers OUT_FOR_DELIVERY for delivery orders only', () => {
    const delivery = makeOrder({ fulfillmentType: 'DELIVERY' });
    const pickup = makeOrder({ fulfillmentType: 'PICKUP' });

    expect(allowedNextStatusesForOrder(delivery)).toContain(
      'OUT_FOR_DELIVERY'
    );
    expect(allowedNextStatusesForOrder(pickup)).not.toContain(
      'OUT_FOR_DELIVERY'
    );
    // Pickup can still complete directly from READY.
    expect(allowedNextStatusesForOrder(pickup)).toContain('COMPLETED');
  });

  it('never forces a pickup order through OUT_FOR_DELIVERY', () => {
    const pickup = makeOrder({ fulfillmentType: 'PICKUP' });

    expect(canTransitionOrder(pickup, 'OUT_FOR_DELIVERY')).toBe(false);
    expect(canTransitionOrder(pickup, 'COMPLETED')).toBe(true);
    expect(canTransitionOrder(pickup, 'CANCELLED')).toBe(true);
  });

  it('allows the delivery workflow and blocks skipping dispatch', () => {
    const inDelivery = makeOrder({
      fulfillmentType: 'DELIVERY',
      orderStatus: 'OUT_FOR_DELIVERY',
    });

    expect(canTransitionOrder(inDelivery, 'COMPLETED')).toBe(true);
    expect(
      canTransitionOrder(makeOrder({ fulfillmentType: 'DELIVERY' }), 'OUT_FOR_DELIVERY')
    ).toBe(true);
    expect(
      canTransitionOrder(
        makeOrder({ fulfillmentType: 'DELIVERY', orderStatus: 'PREPARING' }),
        'OUT_FOR_DELIVERY'
      )
    ).toBe(false);
  });

  it('labels the resolved fulfilment type', () => {
    expect(fulfillmentLabel(makeOrder({ fulfillmentType: 'DELIVERY' }))).toBe(
      'Delivery'
    );
    expect(fulfillmentLabel(makeOrder({ fulfillmentType: 'PICKUP' }))).toBe(
      'Pickup'
    );
  });
});
