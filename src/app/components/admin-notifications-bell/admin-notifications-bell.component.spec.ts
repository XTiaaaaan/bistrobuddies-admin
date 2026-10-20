import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminNotification } from '@shared/core/notifications/admin-notification';
import { AdminNotificationsService } from '@shared/services/admin-notifications.service';
import { AdminNotificationsBellComponent } from './admin-notifications-bell.component';

describe('AdminNotificationsBellComponent', () => {
  const unread = signal<AdminNotification[]>([
    {
      id: 'new-order:order-1',
      kind: 'NEW_ORDER',
      orderId: 'order-1',
      title: 'New order',
      message: 'order-1 was placed by Juan dela Cruz.',
      createdAt: Date.now(),
      read: false,
    },
    {
      id: 'new-order:order-2',
      kind: 'NEW_ORDER',
      orderId: 'order-2',
      title: 'New order',
      message: 'order-2 was placed by Maria Santos.',
      createdAt: Date.now(),
      read: false,
    },
  ]);
  const authorized = signal(true);
  const start = vi.fn();
  const markRead = vi.fn();
  const markAllRead = vi.fn();

  function setup(): {
    fixture: ComponentFixture<AdminNotificationsBellComponent>;
    element: HTMLElement;
    router: Router;
  } {
    TestBed.configureTestingModule({
      imports: [AdminNotificationsBellComponent],
      providers: [
        provideRouter([]),
        {
          provide: AdminNotificationsService,
          useValue: {
            notifications: unread.asReadonly(),
            unreadCount: () => unread().filter((item) => !item.read).length,
            authorized: authorized.asReadonly(),
            start,
            markRead,
            markAllRead,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AdminNotificationsBellComponent);
    fixture.detectChanges();
    return {
      fixture,
      element: fixture.nativeElement as HTMLElement,
      router: TestBed.inject(Router),
    };
  }

  beforeEach(() => {
    unread.set([
      {
        id: 'new-order:order-1',
        kind: 'NEW_ORDER',
        orderId: 'order-1',
        title: 'New order',
        message: 'order-1 was placed by Juan dela Cruz.',
        createdAt: Date.now(),
        read: false,
      },
      {
        id: 'new-order:order-2',
        kind: 'NEW_ORDER',
        orderId: 'order-2',
        title: 'New order',
        message: 'order-2 was placed by Maria Santos.',
        createdAt: Date.now(),
        read: false,
      },
    ]);
    authorized.set(true);
    vi.clearAllMocks();
  });

  it('shows the unread count and starts notification detection', () => {
    const { element } = setup();

    expect(start).toHaveBeenCalled();
    expect(element.querySelector('.notification-count')?.textContent?.trim()).toBe(
      '2'
    );
  });

  it('hides the bell when the signed-in user is not an admin', () => {
    authorized.set(false);
    const { element } = setup();

    expect(element.querySelector('.notification-trigger')).toBeNull();
  });

  it('marks an alert read and routes to its order', async () => {
    const { fixture, router } = setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const component = fixture.componentInstance;

    await component.openNotification(unread()[0]);

    expect(markRead).toHaveBeenCalledWith('new-order:order-1');
    expect(navigate).toHaveBeenCalledWith(['/orders'], {
      queryParams: { orderId: 'order-1' },
    });
  });

  it('caps very large unread counts', () => {
    const { fixture } = setup();
    expect(fixture.componentInstance.countLabel(150)).toBe('99+');
    expect(fixture.componentInstance.countLabel(8)).toBe('8');
  });
});
