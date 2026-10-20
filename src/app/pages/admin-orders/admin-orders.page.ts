import {
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
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
import {
  alertCircle,
  receipt,
  refresh,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
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
  isCancelledOrder,
  orderStatusColor,
  orderStatusLabel,
} from '@shared/core/orders/order-status';
import {
  allowedNextStatusesForOrder,
  canTransitionOrder,
  fulfillmentLabel,
} from '@shared/core/orders/fulfillment';
import {
  canConfirmPayment,
  canDecidePayment,
  canRejectPayment,
  gcashAccountName,
  gcashAccountNumber,
  hasSubmittedGcashDetails,
  isGcashOrder,
  nonGcashPaymentNote,
  paymentDecisionHint,
  paymentStatusOf,
} from '@shared/core/orders/payment-decision';
import {
  hasSubmittedPaymentProof,
  isAwaitingProofVerification,
  paymentProofImageSrc,
  paymentProofOf,
  paymentProofRejectionReason as rejectionReasonOf,
  paymentProofSubmittedAt,
} from '@shared/core/orders/payment-proof';
import {
  canCompleteRefund,
  canStartRefund,
  refundActionHint,
  refundAmount,
  refundStatusColor,
  refundStatusLabel,
  refundStatusOf,
  showRefundStatus,
} from '@shared/core/orders/refund';
import {
  Order,
  OrderRefundRequest,
  OrderStatus,
  PaymentAuditEntry,
  PaymentDecision,
  PaymentProof,
} from '@shared/models/order.model';
import { resolveProductImageSrc } from '@shared/core/products/product-image';
import { OrdersService } from '@shared/services/orders.service';
import { AdminApiError, AdminApiService } from '../../core/api/admin-api.service';

/** Shown wherever a cancelled order would otherwise offer fulfilment actions. */
const CANCELLED_ORDER_MESSAGE =
  'This order was cancelled by the customer and cannot be processed.';

/** Summary chip keys on the orders page (presentation only). */
type QuickFilter = 'all' | 'pending' | 'completed' | 'cancelled' | 'gcash';

/** Everything the enlarged proof preview needs, captured when it opens. */
interface ProofPreview {
  orderId: string;
  customerName: string;
  total: number;
  submittedAt: Order['createdAt'];
  url: string;
}

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

  /** Explanation shown for cancelled orders in place of fulfilment actions. */
  readonly cancelledOrderMessage = CANCELLED_ORDER_MESSAGE;

  /**
   * Explanation prepended to the refund dialogs: BistroBuddies never moves
   * money itself — the admin returns it manually outside the platform.
   */
  readonly manualRefundNotice =
    'BistroBuddies does not send the money back automatically. The refund must be returned manually outside BistroBuddies (for example from the business GCash account).';

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
  /** Order id with an in-flight GCash payment decision (blocks re-clicks). */
  readonly paymentBusyId = signal<string | null>(null);
  /** Order id with an in-flight refund request (blocks re-clicks). */
  readonly refundBusyId = signal<string | null>(null);
  /** Orders whose inline proof screenshot failed to load (expired URL, etc.). */
  readonly failedProofIds = signal<ReadonlySet<string>>(new Set());
  /** Enlarged GCash proof currently open, or `null` when closed. */
  readonly proofPreview = signal<ProofPreview | null>(null);
  /** Whether the enlarged preview image failed to load. */
  readonly proofPreviewFailed = signal(false);
  readonly focusedOrderId = signal<string | null>(null);

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

  // -- Summary counts (read-only, derived from the live order list) ---------

  readonly pendingCount = computed(
    () => this.orders().filter((order) => order.orderStatus === 'PENDING').length
  );
  readonly completedCount = computed(
    () =>
      this.orders().filter((order) => order.orderStatus === 'COMPLETED').length
  );
  readonly cancelledCount = computed(
    () =>
      this.orders().filter((order) => order.orderStatus === 'CANCELLED').length
  );
  /** GCash proofs waiting on an admin to review the uploaded screenshot. */
  readonly gcashToVerifyCount = computed(
    () =>
      this.orders().filter((order) => isAwaitingProofVerification(order)).length
  );

  private readonly reload$ = new BehaviorSubject<void>(undefined);

  private readonly ordersService = inject(OrdersService);
  private readonly adminApi = inject(AdminApiService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute, { optional: true });

  constructor() {
    addIcons({ alertCircle, receipt, refresh, shieldCheckmarkOutline });
  }

  ngOnInit(): void {
    this.route?.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const orderId = params.get('orderId');
        if (orderId) {
          this.focusOrder(orderId);
        }
      });

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

  private focusOrder(orderId: string): void {
    this.focusedOrderId.set(orderId);
    this.clearFilters();
    this.search.set(orderId);
    setTimeout(() => {
      const element = document.getElementById(`order-${orderId}`);
      element?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  // -- Summary quick filters ------------------------------------------------
  //
  // Presentation helpers only: each chip resets the existing filters and
  // then sets the same signals the filter bar already uses. No data or
  // workflow changes.

  /** Applies the filter set behind a summary chip. */
  applyQuickFilter(kind: QuickFilter): void {
    this.clearFilters();
    switch (kind) {
      case 'pending':
        this.statusFilter.set('PENDING');
        break;
      case 'completed':
        this.statusFilter.set('COMPLETED');
        break;
      case 'cancelled':
        this.statusFilter.set('CANCELLED');
        break;
      case 'gcash':
        this.paymentMethodFilter.set('GCASH');
        this.paymentStatusFilter.set('VERIFYING');
        break;
    }
  }

  /** Whether a summary chip currently matches the active filters. */
  quickFilterActive(kind: QuickFilter): boolean {
    const criteria = this.criteria();
    const othersClear =
      criteria.search.trim() === '' &&
      criteria.paymentStatus === 'ALL' &&
      criteria.paymentMethod === 'ALL' &&
      criteria.dateRange === 'ALL';
    switch (kind) {
      case 'all':
        return !hasActiveFilters(criteria);
      case 'pending':
        return othersClear && criteria.orderStatus === 'PENDING';
      case 'completed':
        return othersClear && criteria.orderStatus === 'COMPLETED';
      case 'cancelled':
        return othersClear && criteria.orderStatus === 'CANCELLED';
      case 'gcash':
        return (
          criteria.search.trim() === '' &&
          criteria.orderStatus === 'ALL' &&
          criteria.paymentStatus === 'VERIFYING' &&
          criteria.paymentMethod === 'GCASH' &&
          criteria.dateRange === 'ALL'
        );
    }
  }

  /** Whether the customer cancelled this order (terminal, never processable). */
  isCancelled(order: Order): boolean {
    return isCancelledOrder(order.orderStatus);
  }

  fulfillmentOf(order: Order): string {
    return fulfillmentLabel(order);
  }

  allowedNext(order: Order): OrderStatus[] {
    return allowedNextStatusesForOrder(order);
  }

  async requestStatusChange(order: Order, next: OrderStatus): Promise<void> {
    // Guard first: a cancelled order must never re-enter fulfilment through
    // the UI, even if a button is somehow triggered programmatically.
    if (this.isCancelled(order)) {
      await this.showError(CANCELLED_ORDER_MESSAGE);
      return;
    }
    if (!canTransitionOrder(order, next)) {
      await this.showError(
        `Order status cannot move from ${this.statusLabel(
          order.orderStatus
        )} to ${this.statusLabel(next)}.`
      );
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Change order status?',
      message: `Order ${shortId(order.id)} moves from ${this.statusLabel(
        order.orderStatus
      )} to ${this.statusLabel(next)}.`,
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
    // Defense in depth: the dialog is only reachable for allowed transitions,
    // but the writer itself refuses to process a cancelled order.
    if (this.isCancelled(order)) {
      await this.showError(CANCELLED_ORDER_MESSAGE);
      return;
    }
    this.busyId.set(order.id);
    try {
      await this.adminApi.updateOrderStatus(order.id, next);
      const toast = await this.toastCtrl.create({
        message: `Order status updated to ${this.statusLabel(next)}.`,
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

  // -- Manual GCash payment verification (no gateway) -----------------------
  //
  // Customers submit `{ accountName, accountNumber }` from their own GCash
  // app; an admin verifies the actual received transaction out-of-band and
  // records the decision here via `POST /api/admin/orders/:id/payment`.
  // The submitted details never prove payment — only this admin decision
  // marks an order PAID — and recording it never changes `orderStatus`.
  // Reads keep coming from the live Firestore order listener, which refreshes
  // the row once the backend writes the decision.

  isGcashOrder(order: Order): boolean {
    return isGcashOrder(order);
  }

  hasGcashDetails(order: Order): boolean {
    return hasSubmittedGcashDetails(order);
  }

  gcashName(order: Order): string {
    return gcashAccountName(order);
  }

  gcashNumber(order: Order): string {
    return gcashAccountNumber(order);
  }

  canConfirmPayment(order: Order): boolean {
    return canConfirmPayment(order);
  }

  canRejectPayment(order: Order): boolean {
    return canRejectPayment(order);
  }

  paymentHint(order: Order): string | null {
    return paymentDecisionHint(order);
  }

  nonGcashNote(order: Order): string {
    return nonGcashPaymentNote(order);
  }

  // -- GCash payment proof (read-only display) ------------------------------

  /** The submitted proof record (nested or flat aliases), or `null`. */
  paymentProof(order: Order): PaymentProof | null {
    return paymentProofOf(order);
  }

  /** Whether the customer submitted a proof URL. */
  hasPaymentProof(order: Order): boolean {
    return hasSubmittedPaymentProof(order);
  }

  /** Safe `<img src>` for the proof, or `''` when missing/unsupported. */
  proofImageSrc(order: Order): string {
    return paymentProofImageSrc(order);
  }

  /** When the proof was uploaded, if recorded. */
  proofSubmittedAt(order: Order): Order['createdAt'] {
    return paymentProofSubmittedAt(order);
  }

  /** Clear "proof is waiting for review" indicator for GCash orders only. */
  awaitingProofVerification(order: Order): boolean {
    return isAwaitingProofVerification(order);
  }

  isPaymentRejected(order: Order): boolean {
    return paymentStatusOf(order) === 'REJECTED';
  }

  isPaymentPaid(order: Order): boolean {
    return (
      paymentStatusOf(order) === 'PAID' ||
      paymentStatusOf(order) === 'SUCCEEDED' ||
      paymentStatusOf(order) === 'CAPTURED' ||
      paymentStatusOf(order) === 'COMPLETED'
    );
  }

  /** Rejection explanation stored by the backend, when present. */
  proofRejectionReason(order: Order): string | null {
    return rejectionReasonOf(order);
  }

  /** Append-only payment audit trail kept by the backend (admin-only). */
  paymentAuditEntries(order: Order): PaymentAuditEntry[] {
    return order.paymentAudit ?? [];
  }

  paymentDecisionLabel(decision: unknown): string {
    return String(decision ?? '').toUpperCase() === 'PAID'
      ? 'Approved'
      : 'Rejected';
  }

  /** Whether the inline proof image failed to load (expired/unavailable URL). */
  proofImageFailed(order: Order): boolean {
    return this.failedProofIds().has(order.id);
  }

  onProofImageError(order: Order): void {
    this.failedProofIds.update((ids) => {
      const next = new Set(ids);
      next.add(order.id);
      return next;
    });
  }

  /**
   * Opens the proof at a larger size. The URL is captured on open so the
   * preview never changes while the live order snapshot updates.
   */
  openProofPreview(order: Order): void {
    const url = this.proofImageSrc(order);
    if (!url) {
      this.onProofImageError(order);
      return;
    }
    this.proofPreviewFailed.set(false);
    this.proofPreview.set({
      orderId: order.id,
      customerName: this.customerName(order),
      total: order.total,
      submittedAt: this.proofSubmittedAt(order),
      url,
    });
  }

  closeProofPreview(): void {
    this.proofPreview.set(null);
    this.proofPreviewFailed.set(false);
  }

  onProofPreviewError(): void {
    this.proofPreviewFailed.set(true);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.proofPreview()) {
      this.closeProofPreview();
    }
  }

  /** Whether any payment-decision request is running for this order. */
  isPaymentBusy(order: Order): boolean {
    return this.paymentBusyId() === order.id;
  }

  async requestPaymentDecision(
    order: Order,
    decision: PaymentDecision
  ): Promise<void> {
    if (this.isPaymentBusy(order)) {
      return;
    }
    if (!canDecidePayment(order, decision)) {
      const hint = paymentDecisionHint(order);
      await this.showError(
        hint ??
          'This order cannot receive a payment decision right now. Refresh and try again.'
      );
      return;
    }

    const action = decision === 'PAID' ? 'Confirm payment' : 'Reject payment';
    const alert = await this.alertCtrl.create({
      header: `${action}?`,
      message:
        decision === 'PAID'
          ? `Only confirm after reviewing the uploaded payment screenshot and verifying the actual received GCash transaction for order ${shortId(order.id)} in the BistroBuddies GCash account. The submitted account name and screenshot do not prove payment on their own. Confirming records payment as PAID; the order fulfilment status stays ${String(order.orderStatus)}.`
          : `Only reject after reviewing the uploaded payment screenshot and checking GCash for a matching transaction for order ${shortId(order.id)}. The customer can resubmit GCash details and proof afterwards. The order fulfilment status stays ${String(order.orderStatus)}.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: action,
          handler: () => {
            void this.applyPaymentDecision(order, decision);
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Sends the decision to the backend. The response is the server's
   * confirmation; the live order listener refreshes the row. Nothing is ever
   * written to Firestore from this app, and the fulfilment status is
   * untouched.
   */
  async applyPaymentDecision(
    order: Order,
    decision: PaymentDecision
  ): Promise<void> {
    if (this.paymentBusyId() === order.id) {
      return;
    }
    // Defense in depth: approval requires submitted proof, and only a
    // VERIFYING GCash order with details can be decided at all.
    if (!canDecidePayment(order, decision)) {
      await this.showError(
        paymentDecisionHint(order) ??
          'This order cannot receive a payment decision right now. Refresh and try again.'
      );
      return;
    }
    this.paymentBusyId.set(order.id);
    try {
      const result = await this.adminApi.decideOrderPaymentProof(
        order.id,
        decision
      );
      const toast = await this.toastCtrl.create({
        message:
          result.paymentStatus === 'PAID'
            ? 'Payment confirmed as PAID.'
            : 'Payment rejected. The customer can resubmit GCash details.',
        duration: 2500,
        color: result.paymentStatus === 'PAID' ? 'success' : 'warning',
      });
      await toast.present();
    } catch (error) {
      await this.showError(
        error instanceof AdminApiError
          ? error.message
          : 'Could not record the payment decision. Please try again.'
      );
    } finally {
      this.paymentBusyId.set(null);
    }
  }

  itemsOf(order: Order): Order['items'] {
    return order.items ?? [];
  }

  // -- Manual refunds for cancelled paid orders (no gateway) ---------------
  //
  // When a CANCELLED order already has a confirmed (PAID) payment, the admin
  // returns the money manually outside BistroBuddies (e.g. through the
  // business GCash app) and records the outcome here via
  // `POST /api/admin/orders/:id/refund`. Opening a refund records it only as
  // `REFUND_PENDING` and never marks it completed; completing it requires a
  // second confirmation and is only done after the money was actually sent
  // back and the transaction verified. Refund state lives on the order
  // document (`refund` / `refundAudit`), the live Firestore listener
  // refreshes the row once the backend commits, and nothing here modifies
  // `orderStatus` or `paymentStatus` — existing payment data and audit
  // history are never touched or deleted.

  /** Normalized backend refund status for this order. */
  refundStatus(order: Order): string {
    return refundStatusOf(order);
  }

  /** Whether the refund status is worth displaying for this order. */
  showsRefundStatus(order: Order): boolean {
    return showRefundStatus(order);
  }

  /** PHP amount to be returned (recorded amount, or the paid total). */
  refundOf(order: Order): number | null {
    return refundAmount(order);
  }

  /** Whether the Refund (record pending) action applies to this order. */
  canStartRefund(order: Order): boolean {
    return canStartRefund(order);
  }

  /** Whether the Mark-refund-completed action applies to this order. */
  canCompleteRefund(order: Order): boolean {
    return canCompleteRefund(order);
  }

  refundLabel(status: unknown): string {
    return refundStatusLabel(status);
  }

  refundColor(status: unknown): string {
    return refundStatusColor(status);
  }

  /** Whether any refund request is running for this order. */
  isRefundBusy(order: Order): boolean {
    return this.refundBusyId() === order.id;
  }

  /** Why no refund action applies right now, or `null` when one does. */
  refundHint(order: Order): string | null {
    if (canStartRefund(order) || canCompleteRefund(order)) {
      return null;
    }
    return refundActionHint(order);
  }

  /**
   * Opens the confirmation dialog for recording a pending refund. This only
   * opens the refund record — the money is returned afterwards manually
   * outside BistroBuddies and the refund is later completed separately; a
   * completed refund is never recorded by simply clicking Refund.
   */
  async requestRefund(order: Order): Promise<void> {
    if (this.isRefundBusy(order) || this.busyId() === order.id) {
      return;
    }
    if (!this.canStartRefund(order)) {
      await this.showError(
        this.refundHint(order) ??
          'This order cannot be refunded right now. Refresh and try again.'
      );
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Record pending refund?',
      message: `Return ${formatPhp(
        refundAmount(order) ?? order.total
      )} to the customer manually outside BistroBuddies (for example from the business GCash app). Recording the refund only opens it as REFUND_PENDING — it does not return the money and does not mark the refund completed. Amount recorded: the full paid total of order ${shortId(
        order.id
      )}. The fulfilment status stays ${String(order.orderStatus)}.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Record as pending',
          handler: () => {
            void this.applyRefund(order, { action: 'PENDING' });
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Opens the two-step confirmation for marking the refund completed. The
   * first dialog requires the money to have actually been returned and the
   * transaction verified; the second confirmation makes the final,
   * irreversible call. The backend never allows completing a refund that
   * was not first recorded as pending.
   */
  async requestRefundCompleted(order: Order): Promise<void> {
    if (this.isRefundBusy(order) || this.busyId() === order.id) {
      return;
    }
    if (!this.canCompleteRefund(order)) {
      await this.showError(
        this.refundHint(order) ??
          'This refund cannot be completed right now. Refresh and try again.'
      );
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Mark refund completed?',
      message: `Only do this after you have actually returned ${formatPhp(
        refundAmount(order) ?? order.total
      )} to the customer manually outside BistroBuddies and verified the transaction. Marking it completed is permanent: this order can never be refunded again and a mistake cannot be undone. The payment status stays ${String(
        order.paymentStatus
      )} and the fulfilment status stays ${String(order.orderStatus)}.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Continue',
          handler: () => {
            void this.confirmRefundCompleted(order);
          },
        },
      ],
    });
    await alert.present();
  }

  /** Second confirmation gate before `{ action: 'COMPLETE' }` is sent. */
  private async confirmRefundCompleted(order: Order): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Final confirmation',
      message: `Confirm again: the refund money for order ${shortId(
        order.id
      )} has been returned to the customer and the transaction verified. This records the refund as REFUNDED and cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Mark completed',
          handler: () => {
            void this.applyRefund(order, {
              action: 'COMPLETE',
              confirmed: true,
            });
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Sends the refund action to the backend. The response is the server's
   * confirmation; the live order listener refreshes the row. The fairness
   * rules stay server-side: the amount is derived from the stored paid
   * order, `orderStatus` / `paymentStatus` are untouched, and the manual
   * GCash verification workflow is unaffected.
   */
  async applyRefund(
    order: Order,
    request: OrderRefundRequest
  ): Promise<void> {
    if (this.refundBusyId() === order.id) {
      return;
    }
    // Handler-level block: even if a stale button was triggered or the
    // document is mid-flight, an ineligible order never reaches the API.
    if (
      request.action === 'PENDING'
        ? !this.canStartRefund(order)
        : !this.canCompleteRefund(order)
    ) {
      await this.showError(
        this.refundHint(order) ??
          'This refund action is not allowed for this order right now.'
      );
      return;
    }
    this.refundBusyId.set(order.id);
    try {
      const result = await this.adminApi.recordOrderRefund(order.id, request);
      const toast = await this.toastCtrl.create({
        message:
          result.refund.status === 'REFUNDED'
            ? 'Refund marked as completed after your second confirmation.'
            : 'Refund recorded as pending. Return the money manually outside BistroBuddies, then mark the refund completed once the money was sent and verified.',
        duration: 3000,
        color: 'success',
      });
      await toast.present();
    } catch (error) {
      await this.showError(
        error instanceof AdminApiError
          ? error.message
          : 'Could not record the refund. Please try again.'
      );
    } finally {
      this.refundBusyId.set(null);
    }
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

  /**
   * Readable payment-status label. Historic gateway values (SUCCEEDED,
   * CAPTURED…) read as "Paid"; anything unrecognised is shown verbatim so
   * nothing is silently rewritten. Display-only.
   */
  paymentStatusLabel(status: unknown): string {
    switch (String(status ?? '').toUpperCase()) {
      case 'PENDING':
        return 'Pending';
      case 'VERIFYING':
        return 'Awaiting verification';
      case 'PAID':
      case 'SUCCEEDED':
      case 'CAPTURED':
      case 'COMPLETED':
        return 'Paid';
      case 'REJECTED':
        return 'Rejected';
      case 'FAILED':
        return 'Failed';
      case 'REFUNDED':
        return 'Refunded';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return String(status ?? '').trim() || 'Unknown';
    }
  }

  /** `<img src>` for an order item thumbnail (Cloudinary or legacy paths). */
  itemImageSrc(imageUrl: string | null | undefined): string {
    return resolveProductImageSrc(imageUrl);
  }

  paymentStatusColor(status: unknown): string {
    switch (String(status ?? '').toUpperCase()) {
      case 'PENDING':
      case 'VERIFYING':
      case 'PROCESSING':
        return 'warning';
      case 'PAID':
      case 'SUCCEEDED':
      case 'CAPTURED':
      case 'COMPLETED':
        return 'success';
      case 'REJECTED':
      case 'FAILED':
      case 'REFUNDED':
      case 'CANCELLED':
        return 'danger';
      default:
        return 'medium';
    }
  }

  paymentMethodColor(method: unknown): string {
    const normalized = String(method ?? '').toUpperCase();
    return normalized === 'GCASH' ? 'primary' : 'tertiary';
  }
}
