import { Order } from '@shared/models/order.model';
import {
  createOrderNotificationState,
  detectOrderNotifications,
} from './order-notifications';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    customerId: 'uid-1',
    customerSnapshot: { name: 'Juan dela Cruz', phone: '09171234567' },
    addressSnapshot: {
      recipientName: 'Juan dela Cruz',
      phone: '09171234567',
      address: '123 Sampaloc Street',
    },
    fulfillmentType: 'DELIVERY',
    items: [],
    subtotal: 198,
    deliveryFee: 0,
    total: 198,
    customerComment: '',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    orderStatus: 'PENDING',
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    ...overrides,
  };
}

function gcashProofOrder(publicId = 'proof-1'): Order {
  return makeOrder({
    id: 'gcash-1',
    paymentMethod: 'GCASH',
    paymentStatus: 'VERIFYING',
    paymentProof: {
      url: `https://example.com/proofs/${publicId}.jpg`,
      publicId,
      mimeType: 'image/jpeg',
      submittedAt: '2026-10-20T08:30:00.000Z',
    },
  });
}

describe('order notification detection', () => {
  it('does not announce orders that already exist on the first snapshot', () => {
    const state = createOrderNotificationState();
    const scan = detectOrderNotifications(state, [
      makeOrder({ id: 'existing-1' }),
      makeOrder({ id: 'existing-2' }),
    ]);

    expect(scan.notifications).toEqual([]);
    expect(scan.state.initialized).toBe(true);
    expect(scan.state.seenOrderIds.has('existing-1')).toBe(true);
  });

  it('announces a genuinely new order after the baseline', () => {
    const first = detectOrderNotifications(createOrderNotificationState(), [
      makeOrder({ id: 'existing-1' }),
    ]);
    const second = detectOrderNotifications(first.state, [
      makeOrder({ id: 'existing-1' }),
      makeOrder({ id: 'new-1', total: 250 }),
    ]);

    expect(second.notifications).toHaveLength(1);
    expect(second.notifications[0]).toMatchObject({
      id: 'new-order:new-1',
      kind: 'NEW_ORDER',
      orderId: 'new-1',
      title: 'New order',
    });
    expect(second.notifications[0].body).toContain('Juan dela Cruz');
    expect(second.notifications[0].body).toContain('₱250.00');
  });

  it('does not duplicate alerts when Firestore re-emits the same orders', () => {
    const first = detectOrderNotifications(createOrderNotificationState(), []);
    const second = detectOrderNotifications(first.state, [
      makeOrder({ id: 'new-1' }),
    ]);
    expect(second.notifications).toHaveLength(1);

    const repeat = detectOrderNotifications(second.state, [
      makeOrder({ id: 'new-1' }),
    ]);
    const statusUpdate = detectOrderNotifications(repeat.state, [
      makeOrder({ id: 'new-1', orderStatus: 'CONFIRMED' }),
    ]);

    expect(repeat.notifications).toEqual([]);
    expect(statusUpdate.notifications).toEqual([]);
  });

  it('announces GCash proof submitted for an existing order', () => {
    const first = detectOrderNotifications(createOrderNotificationState(), [
      makeOrder({ id: 'gcash-1', paymentMethod: 'GCASH' }),
    ]);
    const second = detectOrderNotifications(first.state, [gcashProofOrder()]);

    expect(second.notifications).toHaveLength(1);
    expect(second.notifications[0]).toMatchObject({
      kind: 'PAYMENT_PROOF',
      orderId: 'gcash-1',
      title: 'GCash proof submitted',
    });
    expect(second.notifications[0].id).toContain('proof-1');

    const repeat = detectOrderNotifications(second.state, [gcashProofOrder()]);
    expect(repeat.notifications).toEqual([]);
  });

  it('does not alert for proof already present when the baseline loads', () => {
    const scan = detectOrderNotifications(createOrderNotificationState(), [
      gcashProofOrder(),
    ]);
    expect(scan.notifications).toEqual([]);

    const repeat = detectOrderNotifications(scan.state, [gcashProofOrder()]);
    expect(repeat.notifications).toEqual([]);
  });

  it('announces a new proof revision after a resubmission', () => {
    const first = detectOrderNotifications(createOrderNotificationState(), [
      gcashProofOrder('proof-1'),
    ]);
    const second = detectOrderNotifications(first.state, [
      gcashProofOrder('proof-2'),
    ]);

    expect(second.notifications).toHaveLength(1);
    expect(second.notifications[0].kind).toBe('PAYMENT_PROOF');
    expect(second.notifications[0].id).toContain('proof-2');
  });

  it('ignores proof alerts for COD and already-decided payments', () => {
    const cod = makeOrder({
      id: 'cod-1',
      paymentMethod: 'COD',
      paymentProof: {
        url: 'https://example.com/proofs/cod.jpg',
        publicId: 'cod-proof',
      },
    });
    const paid = gcashProofOrder();
    paid.paymentStatus = 'PAID';

    const scan = detectOrderNotifications(createOrderNotificationState(), [
      makeOrder({ id: 'cod-1', paymentMethod: 'COD' }),
      makeOrder({ id: 'gcash-1', paymentMethod: 'GCASH' }),
    ]);
    const second = detectOrderNotifications(scan.state, [cod, paid]);

    expect(second.notifications).toEqual([]);
  });
});
