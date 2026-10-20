import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, of, switchMap } from 'rxjs';
import { AdminSessionService } from '../core/auth/admin-session.service';
import {
  AdminNotification,
  AdminNotificationState,
  EMPTY_ADMIN_NOTIFICATION_STATE,
  mergeAdminNotifications,
  reconcileAdminNotifications,
  unreadNotificationCount,
} from '../core/notifications/admin-notification';
import { Order } from '../models/order.model';
import { OrdersService } from './orders.service';

const STORAGE_PREFIX = 'bistrobuddies.admin.notifications.';

@Injectable({ providedIn: 'root' })
export class AdminNotificationsService {
  private readonly session = inject(AdminSessionService);
  private readonly orders = inject(OrdersService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly items = signal<AdminNotification[]>([]);
  private readonly authorizedSignal = signal(false);

  readonly notifications = this.items.asReadonly();
  readonly authorized = this.authorizedSignal.asReadonly();
  readonly unreadCount = computed(() =>
    unreadNotificationCount(this.items())
  );

  private accessSubscription: Subscription | null = null;
  private ordersSubscription: Subscription | null = null;
  private state: AdminNotificationState = EMPTY_ADMIN_NOTIFICATION_STATE;
  private activeUid: string | null = null;
  private storageKey: string | null = null;

  start(): void {
    if (this.accessSubscription) {
      return;
    }
    this.accessSubscription = this.session.signedIn$
      .pipe(
        switchMap((signedIn) => (signedIn ? this.session.profile$ : of(null))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((profile) => {
        if (profile?.role === 'admin') {
          this.startWatching(profile.uid);
        } else {
          this.stopWatching();
        }
      });
  }

  markRead(id: string): void {
    this.items.update((notifications) => {
      const next = notifications.map((notification) =>
        notification.id === id
          ? { ...notification, read: true }
          : notification
      );
      this.persist(next);
      return next;
    });
  }

  markAllRead(): void {
    this.items.update((notifications) => {
      const next = notifications.map((notification) => ({
        ...notification,
        read: true,
      }));
      this.persist(next);
      return next;
    });
  }

  clear(): void {
    this.items.set([]);
    this.persist([]);
  }

  private startWatching(uid: string): void {
    if (this.activeUid === uid && this.ordersSubscription) {
      return;
    }
    this.stopWatching();
    this.activeUid = uid;
    this.storageKey = `${STORAGE_PREFIX}${uid}`;
    this.state = EMPTY_ADMIN_NOTIFICATION_STATE;
    this.items.set(this.loadPersisted());
    this.authorizedSignal.set(true);

    this.ordersSubscription = this.orders
      .watchOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => this.reconcile(orders),
        error: () => undefined,
      });
  }

  private stopWatching(): void {
    this.ordersSubscription?.unsubscribe();
    this.ordersSubscription = null;
    this.activeUid = null;
    this.storageKey = null;
    this.state = EMPTY_ADMIN_NOTIFICATION_STATE;
    this.authorizedSignal.set(false);
    this.items.set([]);
  }

  private reconcile(orders: Order[]): void {
    const update = reconcileAdminNotifications(this.state, orders);
    this.state = update.state;
    if (update.notifications.length === 0) {
      return;
    }
    this.items.update((existing) => {
      const next = mergeAdminNotifications(existing, update.notifications);
      this.persist(next);
      return next;
    });
  }

  private loadPersisted(): AdminNotification[] {
    const key = this.storageKey;
    if (!key || typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(isStoredNotification);
    } catch {
      return [];
    }
  }

  private persist(notifications: AdminNotification[]): void {
    const key = this.storageKey;
    if (!key || typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(notifications));
    } catch {
      return;
    }
  }
}

function isStoredNotification(value: unknown): value is AdminNotification {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['orderId'] === 'string' &&
    (record['kind'] === 'NEW_ORDER' || record['kind'] === 'GCASH_PROOF') &&
    typeof record['title'] === 'string' &&
    typeof record['message'] === 'string' &&
    typeof record['createdAt'] === 'number' &&
    typeof record['read'] === 'boolean'
  );
}
