import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonIcon,
  IonPopover,
  IonSpinner,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  closeOutline,
  notifications,
  notificationsOffOutline,
  notificationsOutline,
} from 'ionicons/icons';
import { formatDateTime } from '@shared/core/format/format';
import {
  AdminNotification,
  AdminNotificationsService,
} from '@shared/services/admin-notifications.service';

/**
 * Header bell for in-app administrator alerts. It is rendered only for a
 * verified administrator profile, and it starts the live order listener only
 * while mounted.
 */
@Component({
  selector: 'admin-notifications-bell',
  templateUrl: './admin-notifications-bell.component.html',
  styleUrls: ['./admin-notifications-bell.component.scss'],
  standalone: true,
  imports: [IonBadge, IonButton, IonIcon, IonPopover, IonSpinner],
})
export class AdminNotificationsBellComponent implements OnInit, OnDestroy {
  readonly alerts = inject(AdminNotificationsService);
  /** Click that opened the panel, used by the Ionic popover for anchoring. */
  panelEvent: Event | undefined;

  readonly unreadLabel = computed(() => {
    const count = this.alerts.unreadCount();
    return count === 0
      ? 'Notifications, no unread alerts'
      : `Notifications, ${count} unread`;
  });

  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private lastToastId: string | null = null;

  constructor() {
    addIcons({
      alertCircleOutline,
      closeOutline,
      notifications,
      notificationsOffOutline,
      notificationsOutline,
    });
    effect(() => {
      const newest = this.alerts.notifications()[0];
      if (!newest || newest.read || newest.id === this.lastToastId) {
        return;
      }
      this.lastToastId = newest.id;
      void this.presentToast(newest);
    });
  }

  ngOnInit(): void {
    this.alerts.start();
  }

  ngOnDestroy(): void {
    this.alerts.stop();
  }

  toggle(event?: Event): void {
    if (!this.alerts.panelOpen()) {
      this.panelEvent = event;
    }
    this.alerts.togglePanel();
  }

  close(): void {
    this.alerts.closePanel();
  }

  retry(): void {
    this.alerts.retry();
  }

  markAllRead(): void {
    this.alerts.markAllRead();
  }

  openNotification(notification: AdminNotification): void {
    this.alerts.markRead(notification.id);
    this.close();
    const orderId = notification.orderId?.trim();
    if (orderId) {
      void this.router.navigate(['/orders'], {
        queryParams: { order: orderId },
      });
    }
  }

  timeLabel(createdAt: number): string {
    return formatDateTime(createdAt);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.alerts.panelOpen()) {
      this.close();
    }
  }

  private async presentToast(notification: AdminNotification): Promise<void> {
    const toast = await this.toastCtrl.create({
      header: notification.title,
      message: notification.body,
      duration: 4500,
      position: 'top',
      color: notification.kind === 'PAYMENT_PROOF' ? 'warning' : 'dark',
      buttons: [
        { text: 'View', handler: () => this.openNotification(notification) },
        { text: 'Dismiss', role: 'cancel' },
      ],
    });
    await toast.present();
  }
}
