import { Order } from '@shared/models/order.model';
import {
  EMPTY_ADMIN_NOTIFICATION_STATE,
  mergeAdminNotifications,
  reconcileAdminNotifications,
  unreadNotificationCount,
} from './admin-notification';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    customerId: 'uid-1',
    customerSnapshot: {
      uid: 'uid-1',
      name: 'Juan dela Cruz',
      email: 'juan@example.com',
      phone: '09171234567',
    },
    addressSnapshot: {
      recipientName: 'Juan dela Cruz',
      phone: '09171234567',
      address: '123 Sampaloc Street',
    },
    items: [],
    subtotal: 100,
    deliveryFee: 0,
    total: 100,
    customerComment: '',
    paymentMethod: 'GCASH',
    paymentStatus: 'PENDING',
    orderStatus: 'PENDING',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function withProof(
  order: Order,
  publicId = 'proofs/order-1',
  submittedAt: string | null = '2026-10-20T08:30:00.000Z'
): Order {
  return {
    ...order,
    paymentMethod: 'GCASH',
    paymentStatus: 'VERIFYING',
    gcashDetails: {
      accountName: 'Juan dela Cruz',
      accountNumber: '09171234567',
    },
    paymentProof: {
      url: 'https://example.com/proofs/order-1.jpg',
      publicId,
      submittedAt,
    },
  };
}

describe('admin notification detection', () => {
  it('uses the first snapshot only as a baseline', () => {
    const update = reconcileAdminNotifications(
      EMPTY_ADMIN_NOTIFICATION_STATE,
      [makeOrder({ id: 'existing-1' }), makeOrder({ id: 'existing-2' })],
      1000
    );

    expect(update.notifications).toEqual([]);
    expect(update.state.initialized).toBe(true);
    expect(update.state.orderIds.has('existing-1')).toBe(true);
    expect(update.state.orderIds.has('existing-2')).toBe(true);
  });

  it('detects a genuinely new order after the baseline', () => {
    const first = reconcileAdminNotifications(
      EMPTY_ADMIN_NOTIFICATION_STATE,
      [makeOrder({ id: 'existing-1' })],
      1000
    );
    const second = reconcileAdminNotifications(
      first.state,
      [makeOrder({ id: 'existing-1' }), makeOrder({ id: 'new-1' })],
      2000
    );

    expect(second.notifications).toHaveLength(1);
    expect(second.notifications[0]).toMatchObject({
      id: 'new-order:new-1',
      kind: 'NEW_ORDER',
      orderId: 'new-1',
      createdAt: 2000,
      read: false,
    });
    expect(second.notifications[0].message).toContain('Juan dela Cruz');
  });

  it('does not duplicate alerts on repeated Firestore emissions', () => {
    const first = reconcileAdminNotifications(
      EMPTY_ADMIN_NOTIFICATION_STATE,
      [makeOrder({ id: 'existing-1' })],
      1000
    );
    const second = reconcileAdminNotifications(
      first.state,
      [makeOrder({ id: 'existing-1' }), makeOrder({ id: 'new-1' })],
      2000
    );
    const repeated = reconcileAdminNotifications(
      second.state,
      [makeOrder({ id: 'existing-1' }), makeOrder({ id: 'new-1' })],
      3000
    );

    expect(second.notifications).toHaveLength(1);
    expect(repeated.notifications).toEqual([]);
  });

  it('alerts once when GCash proof appears for an existing order', () => {
    const first = reconcileAdminNotifications(
      EMPTY_ADMIN_NOTIFICATION_STATE,
      [makeOrder({ id: 'gcash-1' })],
      1000
    );
    const second = reconcileAdminNotifications(
      first.state,
      [withProof(makeOrder({ id: 'gcash-1' }))],
      2000
    );
    const repeated = reconcileAdminNotifications(
      second.state,
      [withProof(makeOrder({ id: 'gcash-1' }))],
      3000
    );

    expect(second.notifications).toHaveLength(1);
    expect(second.notifications[0]).toMatchObject({
      kind: 'GCASH_PROOF',
      orderId: 'gcash-1',
      title: 'Payment proof submitted',
    });
    expect(repeated.notifications).toEqual([]);
  });

  it('does not announce proofs that already existed on load', () => {
    const update = reconcileAdminNotifications(
      EMPTY_ADMIN_NOTIFICATION_STATE,
      [withProof(makeOrder({ id: 'old-proof' })), withProof(makeOrder({ id: 'old-proof-2' }))],
      1000
    );

    expect(update.notifications).toEqual([]);
    expect(update.state.proofKeys.size).toBe(2);
  });

  it('treats a resubmitted (new asset) proof as a new alert', () => {
    const first = reconcileAdminNotifications(
      EMPTY_ADMIN_NOTIFICATION_STATE,
      [withProof(makeOrder({ id: 'gcash-1' }), 'proofs/first')],
      1000
    );
    const resubmitted = reconcileAdminNotifications(
      first.state,
      [withProof(makeOrder({ id: 'gcash-1' }), 'proofs/second')],
      2000
    );

    expect(resubmitted.notifications).toHaveLength(1);
    expect(resubmitted.notifications[0].kind).toBe('GCASH_PROOF');
  });

  it('does not alert for non-GCash or already-decided proofs', () => {
    const cod = makeOrder({
      id: 'cod-1',
      paymentMethod: 'COD',
      paymentStatus: 'VERIFYING',
      paymentProof: { url: 'https://example.com/cod.jpg' },
    });
    const paid = {
      ...withProof(makeOrder({ id: 'paid-1' })),
      paymentStatus: 'PAID',
    };
    const first = reconcileAdminNotifications(
      EMPTY_ADMIN_NOTIFICATION_STATE,
      [
        makeOrder({
          id: 'cod-1',
          paymentMethod: 'COD',
          paymentStatus: 'VERIFYING',
        }),
        makeOrder({ id: 'paid-1' }),
      ],
      1000
    );
    const update = reconcileAdminNotifications(first.state, [cod, paid], 2000);

    expect(update.notifications).toEqual([]);
  });

  it('counts unread alerts and preserves read state when merging', () => {
    const first = reconcileAdminNotifications(
      EMPTY_ADMIN_NOTIFICATION_STATE,
      [makeOrder({ id: 'baseline' })],
      1000
    );
    const second = reconcileAdminNotifications(
      first.state,
      [
        makeOrder({ id: 'baseline' }),
        makeOrder({ id: 'new-1' }),
        makeOrder({ id: 'new-2' }),
      ],
      2000
    );

    const read = second.notifications.map((notification, index) =>
      index === 0 ? { ...notification, read: true } : notification
    );
    expect(unreadNotificationCount(read)).toBe(1);

    const merged = mergeAdminNotifications(read, [
      { ...second.notifications[0], read: false },
      { ...second.notifications[1], id: 'new-order:new-3' },
    ]);
    expect(merged).toHaveLength(3);
    expect(unreadNotificationCount(merged)).toBe(2);
    // The existing alert stays read despite being re-emitted unread.
    expect(
      merged.find((notification) => notification.id === 'new-order:new-1')?.read
    ).toBe(true);
  });
});
