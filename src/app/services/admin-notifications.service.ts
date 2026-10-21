import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { Order } from '@shared/models/order.model';
import {
  AdminNotificationKind,
  AdminNotificationSeed,
  OrderNotificationState,
  createOrderNotificationState,
  detectOrderNotifications,
} from '@shared/core/notifications/order-notifications';
import { OrdersService } from './orders.service';

export interface AdminNotification extends AdminNotificationSeed {
  createdAt: number;
  read: boolean;
}

export type AdminNotificationsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Keeps the in-memory list bounded while preserving the newest alerts. */
const MAX_NOTIFICATIONS = 50;

/**
 * In-app administrator alerts derived from the live, admin-only `orders`
 * Firestore listener.
 *
 * The service is started by the notifications bell only after the signed-in
 * profile has been confirmed as an administrator. It never writes to
 * Firestore and never talks to a device-token/FCM endpoint: it is purely an
 * in-app mirror of genuine new-order and GCash-proof events.
 */
@Injectable({ providedIn: 'root' })
export class AdminNotificationsService {
  private readonly ordersService = inject(OrdersService);

  private readonly notificationList = signal<AdminNotification[]>([]);
  private readonly panelOpenState = signal(false);
  private readonly statusState = signal<AdminNotificationsStatus>('idle');

  readonly notifications = this.notificationList.asReadonly();
  readonly unreadCount = computed(
    () => this.notificationList().filter((item) => !item.read).length
  );
  readonly panelOpen = this.panelOpenState.asReadonly();
  readonly status = this.statusState.asReadonly();

  private state: OrderNotificationState = createOrderNotificationState();
  private subscription: Subscription | null = null;

  /** Begins listening for admins; safe to call more than once. */
  start(): void {
    if (this.subscription) {
      return;
    }
    this.state = createOrderNotificationState();
    this.statusState.set('loading');
    this.subscription = this.ordersService.watchOrders().subscribe({
      next: (orders) => {
        this.statusState.set('ready');
        this.ingestOrders(orders);
      },
      error: () => {
        // The listener is finished after an error, so a later start() can
        // retry. Alerts never break navigation.
        this.subscription = null;
        this.statusState.set('error');
      },
    });
  }

  /** Retries a failed listener without keeping stale alerts. */
  retry(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.notificationList.set([]);
    this.state = createOrderNotificationState();
    this.start();
  }

  /** Stops listening and clears alerts (sign-out / loss of admin role). */
  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.state = createOrderNotificationState();
    this.notificationList.set([]);
    this.panelOpenState.set(false);
    this.statusState.set('idle');
  }

  /**
   * Diffs one order snapshot. Exposed for tests and for callers that already
   * hold a snapshot; the first snapshot is always treated as the baseline.
   */
  ingestOrders(
    orders: readonly Order[],
    now: number = Date.now()
  ): AdminNotification[] {
    const scan = detectOrderNotifications(this.state, orders);
    this.state = scan.state;
    if (scan.notifications.length === 0) {
      return [];
    }

    const fresh = scan.notifications.filter(
      (candidate) =>
        !this.notificationList().some((item) => item.id === candidate.id)
    );
    if (fresh.length === 0) {
      return [];
    }

    const created: AdminNotification[] = fresh.map((item) => ({
      ...item,
      createdAt: now,
      read: false,
    }));
    this.notificationList.update((current) =>
      [...created, ...current].slice(0, MAX_NOTIFICATIONS)
    );
    return created;
  }

  kindLabel(kind: AdminNotificationKind): string {
    return kind === 'NEW_ORDER' ? 'New order' : 'GCash proof';
  }

  togglePanel(): void {
    this.panelOpenState.update((open) => !open);
  }

  closePanel(): void {
    this.panelOpenState.set(false);
  }

  markRead(id: string): void {
    this.notificationList.update((current) =>
      current.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
  }

  markAllRead(): void {
    this.notificationList.update((current) =>
      current.map((item) => (item.read ? item : { ...item, read: true }))
    );
  }
}
