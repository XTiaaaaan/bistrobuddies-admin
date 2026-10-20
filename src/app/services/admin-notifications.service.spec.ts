import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { AdminSessionService } from '../core/auth/admin-session.service';
import { User } from '../models/user.model';
import { Order } from '../models/order.model';
import { OrdersService } from './orders.service';
import { AdminNotificationsService } from './admin-notifications.service';

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

function adminProfile(role: User['role'] = 'admin'): User {
  return {
    uid: 'admin-1',
    name: 'Admin',
    email: 'admin@example.com',
    phone: '',
    address: '',
    role,
    createdAt: null,
    updatedAt: null,
  };
}

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;
  let ordersSubject: Subject<Order[]>;
  let signedInSubject: BehaviorSubject<boolean>;
  let profileSubject: BehaviorSubject<User | null>;
  let watchOrders: ReturnType<typeof vi.fn>;

  function setup(role: User['role'] = 'admin'): void {
    ordersSubject = new Subject<Order[]>();
    signedInSubject = new BehaviorSubject<boolean>(true);
    profileSubject = new BehaviorSubject<User | null>(adminProfile(role));
    watchOrders = vi.fn(() => ordersSubject.asObservable());

    TestBed.configureTestingModule({
      providers: [
        AdminNotificationsService,
        {
          provide: AdminSessionService,
          useValue: {
            signedIn$: signedInSubject.asObservable(),
            profile$: profileSubject.asObservable(),
          },
        },
        { provide: OrdersService, useValue: { watchOrders } },
      ],
    });
    service = TestBed.inject(AdminNotificationsService);
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('only watches orders for an administrator profile', () => {
    setup('customer');
    service.start();

    expect(service.authorized()).toBe(false);
    expect(watchOrders).not.toHaveBeenCalled();
    expect(service.notifications()).toEqual([]);
  });

  it('waits until the profile is confirmed as admin before watching', () => {
    setup('customer');
    service.start();
    expect(watchOrders).not.toHaveBeenCalled();

    profileSubject.next(adminProfile('admin'));
    expect(service.authorized()).toBe(true);
    expect(watchOrders).toHaveBeenCalledTimes(1);
  });

  it('does not treat the loaded orders as new', () => {
    setup();
    service.start();
    ordersSubject.next([makeOrder({ id: 'existing-1' })]);

    expect(service.notifications()).toEqual([]);
    expect(service.unreadCount()).toBe(0);
  });

  it('adds one alert per genuinely new order and ignores repeats', () => {
    setup();
    service.start();
    ordersSubject.next([makeOrder({ id: 'existing-1' })]);
    ordersSubject.next([
      makeOrder({ id: 'existing-1' }),
      makeOrder({ id: 'new-1' }),
    ]);

    expect(service.notifications()).toHaveLength(1);
    expect(service.notifications()[0].orderId).toBe('new-1');
    expect(service.unreadCount()).toBe(1);

    ordersSubject.next([
      makeOrder({ id: 'existing-1' }),
      makeOrder({ id: 'new-1' }),
    ]);
    expect(service.notifications()).toHaveLength(1);
    expect(service.unreadCount()).toBe(1);
  });

  it('alerts when a GCash proof is submitted without duplicating it', () => {
    setup();
    service.start();
    ordersSubject.next([makeOrder({ id: 'gcash-1' })]);
    const proving = makeOrder({
      id: 'gcash-1',
      paymentStatus: 'VERIFYING',
      paymentProof: {
        url: 'https://example.com/proof.jpg',
        publicId: 'proofs/1',
        submittedAt: '2026-10-20T08:00:00.000Z',
      },
      gcashDetails: {
        accountName: 'Juan dela Cruz',
        accountNumber: '09171234567',
      },
    });
    ordersSubject.next([proving]);

    expect(service.notifications()).toHaveLength(1);
    expect(service.notifications()[0].kind).toBe('GCASH_PROOF');

    ordersSubject.next([proving]);
    expect(service.notifications()).toHaveLength(1);
  });

  it('tracks unread counts and supports marking one or all as read', () => {
    setup();
    service.start();
    ordersSubject.next([makeOrder({ id: 'baseline' })]);
    ordersSubject.next([
      makeOrder({ id: 'baseline' }),
      makeOrder({ id: 'new-1', createdAt: 1 }),
      makeOrder({ id: 'new-2', createdAt: 2 }),
    ]);

    expect(service.unreadCount()).toBe(2);
    const newest = service.notifications()[0];
    service.markRead(newest.id);
    expect(service.unreadCount()).toBe(1);

    service.markAllRead();
    expect(service.unreadCount()).toBe(0);
    expect(service.notifications().every((notification) => notification.read)).toBe(
      true
    );
  });

  it('clears alerts on sign-out and never keeps them for another user', () => {
    setup();
    service.start();
    ordersSubject.next([makeOrder({ id: 'baseline' })]);
    ordersSubject.next([
      makeOrder({ id: 'baseline' }),
      makeOrder({ id: 'new-1' }),
    ]);
    expect(service.notifications()).toHaveLength(1);

    signedInSubject.next(false);
    expect(service.notifications()).toEqual([]);
    expect(service.authorized()).toBe(false);
  });
});
