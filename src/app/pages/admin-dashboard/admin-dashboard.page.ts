import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonContent,
  IonIcon,
  IonSpinner,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  alertCircle,
  cafe,
  calendarOutline,
  cashOutline,
  checkmarkCircle,
  checkmarkDoneOutline,
  chevronBackOutline,
  chevronForwardOutline,
  closeCircle,
  mailOutline,
  receipt,
  restaurantOutline,
  timeOutline,
  walletOutline,
} from 'ionicons/icons';
import { Product } from '@shared/models/product.model';
import { Order } from '@shared/models/order.model';
import { ProductsService } from '@shared/services/products.service';
import { OrdersService } from '@shared/services/orders.service';
import { isOrderStatus } from '@shared/core/orders/order-status';
import { canConfirmPayment } from '@shared/core/orders/payment-decision';
import { refundStatusOf, showRefundStatus } from '@shared/core/orders/refund';
import { formatPhp } from '@shared/core/format/format';
import {
  FinancialPeriod,
  addPeriods,
  financialPeriodRangeLabel,
  financialPeriodTitle,
  periodRange,
  revenueBreakdown,
  startOfPeriod,
  summarizeCollectedRevenue,
} from '@shared/core/finance/financial-analytics';
import {
  FinancialChartComponent,
  FinancialChartType,
} from '@shared/components/financial-chart/financial-chart.component';

/** Order statuses that count as "being worked on" right now. */
const IN_PROGRESS_STATUSES = new Set(['CONFIRMED', 'PREPARING', 'READY']);

@Component({
  selector: 'admin-dashboard',
  templateUrl: './admin-dashboard.page.html',
  styleUrls: ['./admin-dashboard.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonButton,
    IonCard,
    IonContent,
    IonIcon,
    IonSpinner,
    FinancialChartComponent,
  ],
})
export class AdminDashboardPage implements OnInit {
  readonly products = signal<Product[]>([]);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');

  /**
   * Live orders from the same Firestore listener the Orders page uses, so
   * every number here is real data — never a hardcoded sample.
   */
  readonly orders = signal<Order[]>([]);
  readonly ordersStatus = signal<'loading' | 'ready' | 'error'>('loading');

  readonly total = computed(() => this.products().length);
  readonly available = computed(
    () => this.products().filter((product) => product.available !== false).length
  );
  readonly unavailable = computed(() => this.total() - this.available());

  readonly orderTotal = computed(() => this.orders().length);
  readonly pendingCount = computed(
    () => this.orders().filter((order) => order.orderStatus === 'PENDING').length
  );
  readonly inProgressCount = computed(
    () =>
      this.orders().filter((order) =>
        IN_PROGRESS_STATUSES.has(String(order.orderStatus))
      ).length
  );
  readonly completedCount = computed(
    () =>
      this.orders().filter((order) => order.orderStatus === 'COMPLETED').length
  );
  readonly cancelledCount = computed(
    () =>
      this.orders().filter((order) => order.orderStatus === 'CANCELLED').length
  );
  /** GCash payments waiting on an admin to verify the real transaction. */
  readonly gcashToVerifyCount = computed(
    () => this.orders().filter((order) => canConfirmPayment(order)).length
  );
  /** Refunds opened but not yet completed (money not yet confirmed sent). */
  readonly pendingRefundCount = computed(
    () =>
      this.orders().filter(
        (order) =>
          showRefundStatus(order) && refundStatusOf(order) === 'REFUND_PENDING'
      ).length
  );
  /** Orders whose status is not part of the current vocabulary. */
  readonly otherStatusCount = computed(
    () =>
      this.orders().filter((order) => !isOrderStatus(order.orderStatus)).length
  );

  readonly needsAttention = computed(
    () => this.gcashToVerifyCount() > 0 || this.pendingRefundCount() > 0
  );

  readonly financialPeriod = signal<FinancialPeriod>('month');
  readonly financialAnchor = signal(startOfPeriod('month', new Date()));
  readonly financialChartType = signal<FinancialChartType>('horizontal');
  private readonly financialRange = computed(() =>
    periodRange(this.financialPeriod(), this.financialAnchor())
  );
  readonly financialSummary = computed(() =>
    summarizeCollectedRevenue(this.orders(), this.financialRange())
  );
  readonly financialTitle = computed(() =>
    financialPeriodTitle(this.financialPeriod(), this.financialAnchor())
  );
  readonly financialRangeLabel = computed(() =>
    financialPeriodRangeLabel(
      this.financialPeriod(),
      this.financialAnchor()
    )
  );
  readonly financialBreakdown = computed(() =>
    revenueBreakdown(
      this.orders(),
      this.financialPeriod(),
      this.financialAnchor()
    )
  );
  private readonly productsService = inject(ProductsService);
  private readonly ordersService = inject(OrdersService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    addIcons({
      add,
      alertCircle,
      cafe,
      calendarOutline,
      cashOutline,
      checkmarkCircle,
      checkmarkDoneOutline,
      chevronBackOutline,
      chevronForwardOutline,
      closeCircle,
      mailOutline,
      receipt,
      restaurantOutline,
      timeOutline,
      walletOutline,
    });
  }

  ngOnInit(): void {
    this.productsService
      .watchProducts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          this.products.set(products);
          this.status.set('ready');
        },
        error: () => this.status.set('error'),
      });

    this.ordersService
      .watchOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => {
          this.orders.set(orders);
          this.ordersStatus.set('ready');
        },
        // Orders are a bonus on this page: a read failure (e.g. permissions)
        // must never take the product overview down with it.
        error: () => this.ordersStatus.set('error'),
      });
  }

  setFinancialPeriod(period: FinancialPeriod): void {
    this.financialPeriod.set(period);
    this.financialAnchor.set(startOfPeriod(period, new Date()));
  }

  shiftFinancialPeriod(amount: number): void {
    this.financialAnchor.update((anchor) =>
      addPeriods(this.financialPeriod(), anchor, amount)
    );
  }

  resetFinancialPeriod(): void {
    const period = this.financialPeriod();
    this.financialAnchor.set(startOfPeriod(period, new Date()));
  }

  setFinancialChartType(type: FinancialChartType): void {
    this.financialChartType.set(type);
  }

  formatMoney = formatPhp;
}
