import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import {
  AdminNotification,
  AdminNotificationsService,
} from '@shared/services/admin-notifications.service';
import { AdminNotificationsBellComponent } from './admin-notifications-bell.component';

function alert(overrides: Partial<AdminNotification> = {}): AdminNotification {
  return {
    id: 'new-order:order-1',
    kind: 'NEW_ORDER',
    orderId: 'order-1',
    title: 'New order',
    body: 'Juan placed an order.',
    createdAt: 1_760_000_000_000,
    read: false,
    ...overrides,
  };
}

describe('AdminNotificationsBellComponent', () => {
  let items: ReturnType<typeof signal<AdminNotification[]>>;
  let panelOpen: ReturnType<typeof signal<boolean>>;
  let navigate: ReturnType<typeof vi.fn>;
  let markRead: ReturnType<typeof vi.fn>;
  let markAllRead: ReturnType<typeof vi.fn>;
  let start: ReturnType<typeof vi.fn>;
  let stop: ReturnType<typeof vi.fn>;
  let createToast: ReturnType<typeof vi.fn>;

  function setup(seed: AdminNotification[] = []): {
    fixture: ComponentFixture<AdminNotificationsBellComponent>;
    element: HTMLElement;
    component: AdminNotificationsBellComponent;
  } {
    items = signal(seed);
    panelOpen = signal(false);
    navigate = vi.fn().mockResolvedValue(true);
    markRead = vi.fn();
    markAllRead = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    createToast = vi.fn().mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
    });

    TestBed.configureTestingModule({
      imports: [AdminNotificationsBellComponent],
      providers: [
        { provide: Router, useValue: { navigate } },
        {
          provide: ToastController,
          useValue: { create: createToast },
        },
        {
          provide: AdminNotificationsService,
          useValue: {
            notifications: items.asReadonly(),
            unreadCount: computed(
              () => items().filter((item) => !item.read).length
            ),
            panelOpen: panelOpen.asReadonly(),
            start,
            stop,
            togglePanel: () =>
              panelOpen.update((open) => {
                return !open;
              }),
            closePanel: () => panelOpen.set(false),
            markRead,
            markAllRead,
            kindLabel: (kind: AdminNotification['kind']) =>
              kind === 'NEW_ORDER' ? 'New order' : 'GCash proof',
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(AdminNotificationsBellComponent);
    fixture.detectChanges();
    return {
      fixture,
      element: fixture.nativeElement as HTMLElement,
      component: fixture.componentInstance,
    };
  }

  it('starts listening on init and stops on destroy', () => {
    const { fixture } = setup();
    expect(start).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('shows an unread badge and opens the alert panel', () => {
    const { element, component } = setup([
      alert(),
      alert({ id: 'proof-1', kind: 'PAYMENT_PROOF', title: 'GCash proof' }),
    ]);

    expect(element.querySelector('.bell-count')?.textContent).toContain('2');
    expect(element.querySelector('.notifications-panel')).toBeNull();

    component.toggle();
    TestBed.tick();

    expect(element.querySelector('.notifications-panel')).not.toBeNull();
    expect(element.querySelectorAll('.notification-item')).toHaveLength(2);
    expect(element.querySelector('.notifications-count')?.textContent).toContain(
      '2 unread alerts'
    );
  });

  it('marks an alert read and deep-links to its order', () => {
    const { element, component } = setup([alert()]);
    component.toggle();
    TestBed.tick();

    const item = element.querySelector<HTMLButtonElement>('.notification-item');
    item?.click();

    expect(markRead).toHaveBeenCalledWith('new-order:order-1');
    expect(navigate).toHaveBeenCalledWith(['/orders'], {
      queryParams: { order: 'order-1' },
    });
    expect(panelOpen()).toBe(false);
  });

  it('closes the panel on Escape', () => {
    const { component } = setup([alert()]);
    component.toggle();
    expect(panelOpen()).toBe(true);

    component.onEscapeKey();

    expect(panelOpen()).toBe(false);
  });

  it('marks all alerts read from the panel header', () => {
    const { element, component } = setup([alert()]);
    component.toggle();
    TestBed.tick();

    element
      .querySelector<HTMLButtonElement>('.notifications-action')
      ?.click();

    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with no alerts', () => {
    const { element, component } = setup([]);
    component.toggle();
    TestBed.tick();

    expect(element.querySelector('.notifications-empty')).not.toBeNull();
    expect(element.querySelector('.notifications-action')).toBeNull();
  });
});
