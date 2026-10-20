import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { Order } from '@shared/models/order.model';
import { OrdersService } from './orders.service';
import { AdminNotificationsService } from './admin-notifications.service';

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

describe('AdminNotificationsService', () => {
  let orders$: Subject<Order[]>;
  let service: AdminNotificationsService;

  beforeEach(() => {
    orders$ = new Subject<Order[]>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OrdersService,
          useValue: { watchOrders: () => orders$.asObservable() },
        },
      ],
    });
    service = TestBed.inject(AdminNotificationsService);
  });

  afterEach(() => {
    service.stop();
  });

  it('starts from a quiet baseline and then tracks unread alerts', () => {
    service.start();
    orders$.next([makeOrder({ id: 'existing-1' })]);

    expect(service.notifications()).toEqual([]);
    expect(service.unreadCount()).toBe(0);

    orders$.next([
      makeOrder({ id: 'existing-1' }),
      makeOrder({ id: 'new-1' }),
      makeOrder({ id: 'new-2', orderStatus: 'CONFIRMED' }),
    ]);

    expect(service.notifications()).toHaveLength(2);
    expect(service.unreadCount()).toBe(2);
    expect(
      service
        .notifications()
        .map((item) => item.orderId)
        .sort()
    ).toEqual(['new-1', 'new-2']);
  });

  it('marks one alert read without affecting the others', () => {
    service.ingestOrders([makeOrder({ id: 'existing' })]);
    const [first, second] = service.ingestOrders([
      makeOrder({ id: 'new-1' }),
      makeOrder({ id: 'new-2' }),
    ]);
    expect(service.unreadCount()).toBe(2);

    service.markRead(first.id);

    expect(service.unreadCount()).toBe(1);
    expect(
      service.notifications().find((item) => item.id === first.id)?.read
    ).toBe(true);
    expect(
      service.notifications().find((item) => item.id === second.id)?.read
    ).toBe(false);
  });

  it('marks every alert read', () => {
    service.ingestOrders([]);
    service.ingestOrders([makeOrder({ id: 'new-1' }), makeOrder({ id: 'new-2' })]);
    expect(service.unreadCount()).toBe(2);

    service.markAllRead();

    expect(service.unreadCount()).toBe(0);
  });

  it('toggles and closes the panel', () => {
    expect(service.panelOpen()).toBe(false);
    service.togglePanel();
    expect(service.panelOpen()).toBe(true);
    service.closePanel();
    expect(service.panelOpen()).toBe(false);
  });

  it('clears alerts and the baseline when stopped', () => {
    service.start();
    orders$.next([]);
    orders$.next([makeOrder({ id: 'new-1' })]);
    expect(service.notifications()).toHaveLength(1);

    service.stop();
    expect(service.notifications()).toEqual([]);
    expect(service.panelOpen()).toBe(false);

    const seenAfterRestart: string[] = [];
    service.start();
    orders$.next([makeOrder({ id: 'new-1' })]);
    seenAfterRestart.push(...service.notifications().map((item) => item.id));
    expect(seenAfterRestart).toEqual([]);
  });

  it('keeps only the newest alerts', () => {
    service.ingestOrders([]);
    service.ingestOrders(
      Array.from({ length: 60 }, (_, index) =>
        makeOrder({ id: `order-${index}` })
      )
    );

    expect(service.notifications()).toHaveLength(50);
    expect(
      service.notifications().every((item) => item.orderId.startsWith('order-'))
    ).toBe(true);
  });

  it('labels alert kinds', () => {
    expect(service.kindLabel('NEW_ORDER')).toBe('New order');
    expect(service.kindLabel('PAYMENT_PROOF')).toBe('GCash proof');
  });
});
