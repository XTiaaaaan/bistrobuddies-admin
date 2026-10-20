import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonIcon,
  IonPopover,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cardOutline,
  checkmarkDoneOutline,
  notificationsOffOutline,
  notificationsOutline,
  receiptOutline,
} from 'ionicons/icons';
import {
  AdminNotification,
} from '@shared/core/notifications/admin-notification';
import { formatDateTime } from '@shared/core/format/format';
import { AdminNotificationsService } from '@shared/services/admin-notifications.service';

@Component({
  selector: 'admin-notifications-bell',
  templateUrl: './admin-notifications-bell.component.html',
  styleUrls: ['./admin-notifications-bell.component.scss'],
  standalone: true,
  imports: [IonBadge, IonButton, IonIcon, IonPopover],
})
export class AdminNotificationsBellComponent implements OnInit {
  @ViewChild(IonPopover) private popover?: IonPopover;

  private readonly service = inject(AdminNotificationsService);
  readonly notifications = this.service.notifications;
  readonly unreadCount = this.service.unreadCount;
  readonly authorized = this.service.authorized;

  private readonly router = inject(Router);

  constructor() {
    addIcons({
      cardOutline,
      checkmarkDoneOutline,
      notificationsOffOutline,
      notificationsOutline,
      receiptOutline,
    });
  }

  ngOnInit(): void {
    this.service.start();
  }

  formatTime = formatDateTime;

  countLabel(count: number): string {
    return count > 99 ? '99+' : String(count);
  }

  markAllRead(): void {
    this.service.markAllRead();
  }

  async openNotification(notification: AdminNotification): Promise<void> {
    this.service.markRead(notification.id);
    await this.popover?.dismiss().catch(() => undefined);
    await this.router.navigate(['/orders'], {
      queryParams: { orderId: notification.orderId },
    });
  }
}
