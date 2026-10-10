import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, switchMap } from 'rxjs';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonCard,
  IonContent,
  IonIcon,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircle, receipt, refresh } from 'ionicons/icons';
import { formatDateTime, formatPhp, shortId } from '@shared/core/format/format';
import {
  EMPTY_ORDER_FILTER,
  OrderDateRange,
  OrderFilterCriteria,
  filterOrders,
  hasActiveFilters,
  paymentStatusOptions as collectPaymentStatusOptions,
  sortOrdersByDateDesc,
} from '@shared/core/orders/order-filter';
import {
  ORDER_STATUSES,
  allowedNextStatuses,
  canTransition,
  orderStatusColor,
  orderStatusLabel,
} from '@shared/core/orders/order-status';
import { Order, OrderStatus } from '@shared/models/order.model';
import { OrdersService } from '@shared/services/orders.service';
import { AdminApiError, AdminApiService } from '../../core/api/admin-api.service';

@Component({
  selector: 'admin-orders',
  templateUrl: './admin-orders.page.html',
  styleUrls: ['./admin-orders.page.scss'],
  standalone: true,
  imports: [
    IonBadge,
    IonButton,
    IonCard,
    IonContent,
    IonIcon,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
  ],
})
export class AdminOrdersPage implements OnInit {
  /** Order statuses offered in the filter (mirrors the backend contract). */
  readonly statuses = ORDER_STATUSES;

  readonly dateRanges: { value: OrderDateRange; label: string }[] = [
    { value: 'ALL', label: 'Any date' },
    { value: 'TODAY', label: 'Today' },
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
  ];

  readonly orders = signal<Order[]>([]);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  readonly errorMessage = signal('');
  readonly busyId = signal<string | null>(null);

  readonly search = signal('');
  readonly statusFilter = signal('ALL');
  readonly paymentStatusFilter = signal('ALL');
  readonly paymentMethodFilter = signal('ALL');
  readonly dateRangeFilter = signal<OrderDateRange>('ALL');

  readonly criteria = computed<OrderFilterCriteria>(() => ({
    search: this.search(),
    orderStatus: this.statusFilter(),
    paymentStatus: this.paymentStatusFilter(),
    paymentMethod: this.paymentMethodFilter(),
    dateRange: this.dateRangeFilter(),
  }));

  readonly visibleOrders = computed(() =>
    sortOrdersByDateDesc(filterOrders(this.orders(), this.criteria()))
  );

  readonly filtersActive = computed(() => hasActiveFilters(this.criteria()));

  readonly paymentStatusOptions = computed(() =>
    collectPaymentStatusOptions(this.orders())
  );

  private readonly reload$ = new BehaviorSubject<void>(undefined);

  private readonly ordersService = inject(OrdersService);
  private readonly adminApi = inject(AdminApiService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    addIcons({ alertCircle, receipt, refresh });
  }

  ngOnInit(): void {
    this.reload$
      .pipe(
        switchMap(() => this.ordersService.watchOrders()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (orders) => {
          this.orders.set(orders);
          this.status.set('ready');
        },
        error: () => {
          this.errorMessage.set(
            'Could not load orders. Check your connection and that your account is an administrator.'
          );
          this.status.set('error');
        },
      });
  }

  reload(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.reload$.next();
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set(EMPTY_ORDER_FILTER.orderStatus);
    this.paymentStatusFilter.set(EMPTY_ORDER_FILTER.paymentStatus);
    this.paymentMethodFilter.set(EMPTY_ORDER_FILTER.paymentMethod);
    this.dateRangeFilter.set(EMPTY_ORDER_FILTER.dateRange);
  }

  onSearch(value: string): void {
    this.search.set(value.trim());
  }

  /** Statuses the backend will accept for this order right now. */
  allowedNext(order: Order): OrderStatus[] {
    return allowedNextStatuses(order.orderStatus);
  }

  async requestStatusChange(order: Order, next: OrderStatus): Promise<void> {
    if (!canTransition(order.orderStatus, next)) {
      await this.showError(
        `Order status cannot move from ${String(order.orderStatus)} to ${next}.`
      );
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Change order status?',
      message: `Order ${shortId(order.id)} moves from ${String(
        order.orderStatus
      )} to ${next}.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Update',
          handler: () => {
            void this.applyStatus(order, next);
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Sends the transition to the backend. The response is the server's
   * confirmation; the live order listener refreshes the row. Nothing is ever
   * written to Firestore from this app, and payment status is untouched.
   */
  private async applyStatus(order: Order, next: OrderStatus): Promise<void> {
    this.busyId.set(order.id);
    try {
      await this.adminApi.updateOrderStatus(order.id, next);
      const toast = await this.toastCtrl.create({
        message: `Order status updated to ${next}.`,
        duration: 2500,
        color: 'success',
      });
      await toast.present();
    } catch (error) {
      await this.showError(
        error instanceof AdminApiError
          ? error.message
          : 'Could not update the order status. Please try again.'
      );
    } finally {
      this.busyId.set(null);
    }
  }

  private async showError(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 5000,
      color: 'danger',
    });
    await toast.present();
  }

  itemsOf(order: Order): Order['items'] {
    return order.items ?? [];
  }

  customerName(order: Order): string {
    return order.customerSnapshot?.name || 'Unknown customer';
  }

  customerPhone(order: Order): string {
    return order.customerSnapshot?.phone ?? '';
  }

  customerEmail(order: Order): string {
    return order.customerSnapshot?.email ?? '';
  }

  /** Delivery address lines, empty when the order carries no address. */
  addressLines(order: Order): string[] {
    const address = order.addressSnapshot;
    if (!address) {
      return [];
    }
    const lines: string[] = [];
    const contact = [address.recipientName, address.phone]
      .filter((part) => !!part)
      .join(' · ');
    if (contact) {
      lines.push(contact);
    }
    const street = [address.address, address.city]
      .filter((part) => !!part)
      .join(', ');
    if (street) {
      lines.push(street);
    }
    if (address.postalCode) {
      lines.push(`Postal code ${address.postalCode}`);
    }
    return lines;
  }

  formatDate = formatDateTime;
  formatMoney = formatPhp;
  formatId = shortId;
  statusColor = orderStatusColor;
  statusLabel = orderStatusLabel;

  paymentStatusColor(status: unknown): string {
    switch (String(status ?? '').toUpperCase()) {
      case 'PENDING':
      case 'PROCESSING':
        return 'warning';
      case 'PAID':
      case 'SUCCEEDED':
      case 'CAPTURED':
      case 'COMPLETED':
        return 'success';
      case 'FAILED':
      case 'REFUNDED':
      case 'CANCELLED':
        return 'danger';
      default:
        return 'medium';
    }
  }

  paymentMethodColor(method: unknown): string {
    return String(method ?? '').toUpperCase() === 'ONLINE'
      ? 'primary'
      : 'tertiary';
  }
}
