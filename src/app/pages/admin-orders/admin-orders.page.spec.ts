import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Order } from '@shared/models/order.model';
import { OrdersService } from '@shared/services/orders.service';
import { AuthService } from '@shared/services/auth.service';
import { AdminOrdersPage } from './admin-orders.page';

const paymentProofUrl = (id: string) =>
  `${environment.apiBaseUrl}/admin/orders/${id}/payment-proof`;
const statusUrl = (id: string) =>
  `${environment.apiBaseUrl}/admin/orders/${id}/status`;
const refundUrl = (id: string) =>
  `${environment.apiBaseUrl}/admin/orders/${id}/refund`;

/** Lets the awaited id-token lookup finish so the HTTP request is issued. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for the expected state.');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Waits until a request hit `url` with `method` and returns it. `match()` is
 * the only non-asserting lookup on the testing controller, and it consumes
 * the matched requests, so the result must be handed back to the caller.
 */
async function waitForRequest(
  httpMock: HttpTestingController,
  url: string,
  method = 'POST'
): Promise<TestRequest> {
  let found: TestRequest[] = [];
  await waitFor(() => {
    found = httpMock.match((req) => req.url === url && req.method === method);
    return found.length > 0;
  });
  return found[0];
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    customerId: 'uid-1',
    customerSnapshot: {
      uid: 'uid-1',
      name: 'Juan dela Cruz',
      email: 'juan@example.com',
      phone: '09171234567',
    },
    addressSnapshot: {
      recipientName: 'Juan dela Cruz',
      phone: '09171234567',
      address: '123 Sampaloc Street',
      city: 'Manila',
    },
    items: [],
    subtotal: 198,
    deliveryFee: 0,
    total: 198,
    customerComment: '',
    paymentMethod: 'GCASH',
    paymentStatus: 'VERIFYING',
    gcashDetails: {
      accountName: 'Juan dela Cruz',
      accountNumber: '09171234567',
    },
    paymentProof: {
      url: 'https://example.com/proofs/order-1.jpg',
      mimeType: 'image/jpeg',
      submittedAt: '2026-10-20T08:30:00.000Z',
    },
    orderStatus: 'PENDING',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('AdminOrdersPage GCash payment verification', () => {
  let page: AdminOrdersPage;
  let httpMock: HttpTestingController;
  let ordersSubject: BehaviorSubject<Order[]>;

  const getIdToken = vi.fn();
  const alertCreate = vi.fn();
  const alertPresent = vi.fn();
  const toastCreate = vi.fn();
  const toastPresent = vi.fn();

  let lastAlertOptions: {
    header: string;
    message: string;
    buttons: { text: string; role?: string; handler?: () => void }[];
  } | null;

  function confirmButton(): { text: string; handler?: () => void } {
    const buttons = lastAlertOptions?.buttons ?? [];
    const confirm = buttons.find((button) => button.role !== 'cancel');
    if (!confirm) {
      throw new Error('Expected the dialog to offer a confirm button.');
    }
    return confirm;
  }

  /** Opens the decision dialog and clicks its confirm button. */
  async function confirmDialog(
    order: Order,
    decision: 'PAID' | 'REJECTED'
  ): Promise<void> {
    await page.requestPaymentDecision(order, decision);
    expect(alertCreate).toHaveBeenCalled();
    confirmButton().handler?.();
  }

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        AdminOrdersPage,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken } },
        {
          provide: OrdersService,
          useValue: { watchOrders: () => ordersSubject.asObservable() },
        },
        { provide: AlertController, useValue: { create: alertCreate } },
        { provide: ToastController, useValue: { create: toastCreate } },
      ],
    });
    page = TestBed.inject(AdminOrdersPage);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    lastAlertOptions = null;
    ordersSubject = new BehaviorSubject<Order[]>([]);
    getIdToken.mockResolvedValue('test-id-token');
    alertPresent.mockResolvedValue(undefined);
    alertCreate.mockImplementation(async (options) => {
      lastAlertOptions = options;
      return { present: alertPresent };
    });
    toastPresent.mockResolvedValue(undefined);
    toastCreate.mockResolvedValue({ present: toastPresent });
    setup();
    page.ngOnInit();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('reads orders from the Firestore order listener', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    expect(page.orders()).toHaveLength(1);
    expect(page.orders()[0].paymentStatus).toBe('VERIFYING');
    httpMock.expectNone(() => true);
  });

  it('displays the submitted GCash account name and mobile number', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.isGcashOrder(order)).toBe(true);
    expect(page.hasGcashDetails(order)).toBe(true);
    expect(page.gcashName(order)).toBe('Juan dela Cruz');
    expect(page.gcashNumber(order)).toBe('09171234567');
  });

  it('exposes the submitted GCash proof and its metadata', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.hasPaymentProof(order)).toBe(true);
    expect(page.paymentProof(order)?.mimeType).toBe('image/jpeg');
    expect(page.proofImageSrc(order)).toBe(
      'https://example.com/proofs/order-1.jpg'
    );
    expect(page.proofSubmittedAt(order)).toBe('2026-10-20T08:30:00.000Z');
    expect(page.awaitingProofVerification(order)).toBe(true);
  });

  it('opens and closes the enlarged proof preview', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    page.openProofPreview(order);

    expect(page.proofPreview()).toEqual({
      orderId: 'order-1',
      customerName: 'Juan dela Cruz',
      total: 198,
      submittedAt: '2026-10-20T08:30:00.000Z',
      url: 'https://example.com/proofs/order-1.jpg',
    });

    page.onProofPreviewError();
    expect(page.proofPreviewFailed()).toBe(true);

    page.closeProofPreview();
    expect(page.proofPreview()).toBeNull();
    expect(page.proofPreviewFailed()).toBe(false);
  });

  it('closes the enlarged proof preview with the Escape key', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    page.openProofPreview(page.orders()[0]);
    expect(page.proofPreview()).not.toBeNull();

    page.onEscapeKey();
    expect(page.proofPreview()).toBeNull();
  });

  it('flags expired proof images without breaking order actions', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.proofImageFailed(order)).toBe(false);
    page.onProofImageError(order);
    expect(page.proofImageFailed(order)).toBe(true);
    expect(page.canRejectPayment(order)).toBe(true);
  });

  it('does not open a preview for missing or unsafe proof URLs', async () => {
    ordersSubject.next([
      makeOrder({ id: 'missing-proof', paymentProof: null }),
      makeOrder({
        id: 'unsafe-proof',
        paymentProof: { url: 'javascript:alert(1)' },
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    for (const order of page.orders()) {
      page.openProofPreview(order);
      expect(page.proofPreview()).toBeNull();
      expect(page.proofImageFailed(order)).toBe(true);
    }
  });

  it('requires a screenshot before approving but still allows rejection', async () => {
    ordersSubject.next([makeOrder({ paymentProof: null })]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.hasPaymentProof(order)).toBe(false);
    expect(page.canConfirmPayment(order)).toBe(false);
    expect(page.canRejectPayment(order)).toBe(true);
    expect(page.paymentHint(order)).toMatch(/screenshot has not been uploaded/i);

    await page.applyPaymentDecision(order, 'PAID');
    await tick();
    httpMock.expectNone(
      (req) =>
        req.url === paymentProofUrl('order-1') && req.method === 'POST'
    );
  });

  it('shows the rejection reason and payment audit history', async () => {
    ordersSubject.next([
      makeOrder({
        paymentStatus: 'REJECTED',
        paymentDecision: {
          decision: 'REJECTED',
          decidedBy: 'admin-1',
          decidedAt: '2026-10-20T09:00:00.000Z',
          reason: 'No matching GCash transaction.',
        },
        paymentAudit: [
          {
            from: 'VERIFYING',
            to: 'REJECTED',
            actorUid: 'admin-1',
            actorRole: 'admin',
          },
        ],
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.isPaymentRejected(order)).toBe(true);
    expect(page.paymentDecisionLabel(order.paymentDecision?.decision)).toBe(
      'Rejected'
    );
    expect(page.proofRejectionReason(order)).toBe(
      'No matching GCash transaction.'
    );
    expect(page.paymentAuditEntries(order)).toHaveLength(1);
  });

  it('handles orders with no submitted details', async () => {
    ordersSubject.next([
      makeOrder({ id: 'no-details', gcashDetails: null, paymentStatus: 'PENDING' }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.hasGcashDetails(order)).toBe(false);
    expect(page.gcashName(order)).toBe('');
    expect(page.gcashNumber(order)).toBe('');
    expect(page.canConfirmPayment(order)).toBe(false);
    expect(page.canRejectPayment(order)).toBe(false);
    expect(page.paymentHint(order)).toMatch(/no gcash details/i);
  });

  it('handles historical orders without GCash fields', async () => {
    const historic = makeOrder({ id: 'historic' });
    delete historic.gcashDetails;
    ordersSubject.next([historic]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.hasGcashDetails(order)).toBe(false);
    expect(page.canConfirmPayment(order)).toBe(false);
    expect(page.canRejectPayment(order)).toBe(false);
  });

  it('offers confirm and reject for an eligible GCash order', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.canConfirmPayment(order)).toBe(true);
    expect(page.canRejectPayment(order)).toBe(true);
    expect(page.paymentHint(order)).toBeNull();
  });

  it('asks for out-of-band GCash verification before confirming', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    await page.requestPaymentDecision(page.orders()[0], 'PAID');

    expect(alertCreate).toHaveBeenCalled();
    expect(lastAlertOptions?.header).toMatch(/confirm payment/i);
    // The dialog must remind the admin to check the real GCash transaction.
    expect(lastAlertOptions?.message).toMatch(/GCash/i);
    expect(lastAlertOptions?.message).toMatch(/fulfilment status/i);
    // Nothing reaches the backend until the admin confirms the dialog.
    await tick();
    httpMock.expectNone(
      (req) => req.url === paymentProofUrl('order-1') && req.method === 'POST'
    );
  });

  it('asks for out-of-band GCash verification before rejecting', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    await page.requestPaymentDecision(page.orders()[0], 'REJECTED');

    expect(lastAlertOptions?.header).toMatch(/reject payment/i);
    expect(lastAlertOptions?.message).toMatch(/GCash/i);
    await tick();
    httpMock.expectNone(
      (req) => req.url === paymentProofUrl('order-1') && req.method === 'POST'
    );
  });

  it('confirms payment through the backend decision endpoint', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    await confirmDialog(order, 'PAID');

    const request = await waitForRequest(httpMock, paymentProofUrl('order-1'));
    expect(request.request.body).toEqual({ decision: 'PAID' });
    expect(JSON.stringify(request.request.body)).not.toContain('orderStatus');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );
    expect(page.isPaymentBusy(order)).toBe(true);

    request.flush({ id: 'order-1', paymentStatus: 'PAID' });
    await waitFor(() => page.isPaymentBusy(order) === false);

    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' })
    );
  });

  it('rejects payment through the backend decision endpoint', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    await confirmDialog(order, 'REJECTED');

    const request = await waitForRequest(httpMock, paymentProofUrl('order-1'));
    expect(request.request.body).toEqual({ decision: 'REJECTED' });

    request.flush({ id: 'order-1', paymentStatus: 'REJECTED' });
    await waitFor(() => page.isPaymentBusy(order) === false);

    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/resubmit/i) })
    );
  });

  it('shows a useful error when the backend refuses the decision', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    await confirmDialog(order, 'PAID');

    const request = await waitForRequest(httpMock, paymentProofUrl('order-1'));
    request.flush(
      {
        error: {
          code: 'payment_details_required',
          message: 'The customer must submit GCash payment details first.',
        },
      },
      { status: 409, statusText: 'Conflict' }
    );
    await waitFor(() => page.isPaymentBusy(order) === false);

    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'danger',
        message: 'The customer must submit GCash payment details first.',
      })
    );
  });

  it('prevents duplicate payment requests while one is in flight', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    const first = page.applyPaymentDecision(order, 'PAID');
    const second = page.applyPaymentDecision(order, 'PAID');

    const request = await waitForRequest(httpMock, paymentProofUrl('order-1'));
    request.flush({ id: 'order-1', paymentStatus: 'PAID' });
    await Promise.all([first, second]);

    // Only the first decision reached the backend.
    httpMock.expectNone(
      (req) => req.method === 'POST' && req.url === paymentProofUrl('order-1')
    );
    expect(page.isPaymentBusy(order)).toBe(false);
  });

  it('blocks a second dialog while a decision is in flight', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    alertCreate.mockClear();
    const inFlight = page.applyPaymentDecision(order, 'PAID');
    await page.requestPaymentDecision(order, 'PAID');

    // No second confirmation dialog while the request runs.
    expect(alertCreate).not.toHaveBeenCalled();

    const request = await waitForRequest(httpMock, paymentProofUrl('order-1'));
    request.flush({ id: 'order-1', paymentStatus: 'PAID' });
    await inFlight;
  });

  it('hides actions for COD orders and never calls the payment endpoint', async () => {
    ordersSubject.next([
      makeOrder({ id: 'cod-1', paymentMethod: 'COD', gcashDetails: null }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.isGcashOrder(order)).toBe(false);
    expect(page.canConfirmPayment(order)).toBe(false);
    expect(page.canRejectPayment(order)).toBe(false);
    expect(page.nonGcashNote(order)).toMatch(/cash on delivery/i);

    await page.requestPaymentDecision(order, 'PAID');
    await tick();
    httpMock.expectNone(
      (req) => req.url === paymentProofUrl('cod-1') && req.method === 'POST'
    );
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger' })
    );
  });

  it('hides further decisions once payment is confirmed', async () => {
    ordersSubject.next([makeOrder({ paymentStatus: 'PAID' })]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.canConfirmPayment(order)).toBe(false);
    expect(page.canRejectPayment(order)).toBe(false);

    await page.requestPaymentDecision(order, 'REJECTED');
    await tick();
    httpMock.expectNone(
      (req) => req.url === paymentProofUrl('order-1') && req.method === 'POST'
    );
  });

  it('keeps order status transitions separate from payment decisions', async () => {
    ordersSubject.next([makeOrder()]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    await page.requestStatusChange(order, 'CONFIRMED');
    expect(alertCreate).toHaveBeenCalled();
    confirmButton().handler?.();

    const request = await waitForRequest(httpMock, statusUrl('order-1'));
    expect(request.request.body).toEqual({ orderStatus: 'CONFIRMED' });
    expect(JSON.stringify(request.request.body)).not.toContain('payment');

    request.flush({ id: 'order-1', orderStatus: 'CONFIRMED' });
    await waitFor(() => page.busyId() === null);
  });

  it('offers and sends On the Way for a ready order', async () => {
    ordersSubject.next([
      makeOrder({
        id: 'delivery-1',
        orderStatus: 'READY',
        fulfillmentType: 'DELIVERY',
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.allowedNext(order)).toEqual([
      'OUT_FOR_DELIVERY',
      'CANCELLED',
    ]);
    expect(page.allowedNext(order)).not.toContain('COMPLETED');
    expect(page.canDispatch(order)).toBe(true);
    expect(page.statusLabel('OUT_FOR_DELIVERY')).toBe('On the Way');

    await page.requestStatusChange(order, 'OUT_FOR_DELIVERY');
    expect(lastAlertOptions?.message).toMatch(/to On the Way/i);
    confirmButton().handler?.();

    const request = await waitForRequest(httpMock, statusUrl('delivery-1'));
    // The backend contract value is unchanged; the UI only renames it.
    expect(request.request.body).toEqual({ orderStatus: 'OUT_FOR_DELIVERY' });
    expect(JSON.stringify(request.request.body)).not.toContain('payment');

    request.flush({ id: 'delivery-1', orderStatus: 'OUT_FOR_DELIVERY' });
    await waitFor(() => page.busyId() === null);
  });

  it('blocks the invalid READY to Delivered jump before hitting the API', async () => {
    ordersSubject.next([
      makeOrder({
        id: 'ready-1',
        orderStatus: 'READY',
        fulfillmentType: 'DELIVERY',
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    await page.requestStatusChange(order, 'COMPLETED');

    expect(alertCreate).not.toHaveBeenCalled();
    await tick();
    httpMock.expectNone((req) => req.url === statusUrl('ready-1'));
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger' })
    );
  });

  it('shows Delivered and no further completion action for a completed order', async () => {
    ordersSubject.next([
      makeOrder({
        id: 'delivered-1',
        orderStatus: 'COMPLETED',
        fulfillmentType: 'DELIVERY',
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.statusLabel(order.orderStatus)).toBe('Delivered');
    expect(page.statusColor(order.orderStatus)).toBe('success');
    expect(page.allowedNext(order)).toEqual([]);
  });

  it('offers Delivered only once an order is On the Way', async () => {
    ordersSubject.next([
      makeOrder({
        id: 'on-the-way-1',
        orderStatus: 'OUT_FOR_DELIVERY',
        fulfillmentType: 'DELIVERY',
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.statusLabel(order.orderStatus)).toBe('On the Way');
    expect(page.statusColor(order.orderStatus)).toBe('info');
    expect(page.allowedNext(order)).toEqual(['COMPLETED', 'CANCELLED']);
    expect(page.statusLabel('COMPLETED')).toBe('Delivered');

    await page.requestStatusChange(order, 'COMPLETED');
    confirmButton().handler?.();

    const request = await waitForRequest(httpMock, statusUrl('on-the-way-1'));
    expect(request.request.body).toEqual({ orderStatus: 'COMPLETED' });
    request.flush({ id: 'on-the-way-1', orderStatus: 'COMPLETED' });
    await waitFor(() => page.busyId() === null);
  });

  it('labels all five workflow statuses consistently', () => {
    expect(page.statusLabel('CONFIRMED')).toBe('Confirmed');
    expect(page.statusLabel('PREPARING')).toBe('Preparing');
    expect(page.statusLabel('READY')).toBe('Ready');
    expect(page.statusLabel('OUT_FOR_DELIVERY')).toBe('On the Way');
    expect(page.statusLabel('COMPLETED')).toBe('Delivered');
  });

  it('focuses the order named by a notification deep link', async () => {
    ordersSubject.next([
      makeOrder({ id: 'focus-1' }),
      makeOrder({ id: 'focus-2', orderStatus: 'CONFIRMED' }),
    ]);
    await waitFor(() => page.status() === 'ready');

    page.focusOrder('focus-1');

    expect(page.focusedOrderId()).toBe('focus-1');
    expect(page.search()).toBe('focus-1');
    expect(page.statusFilter()).toBe('ALL');
    expect(page.visibleOrders().map((order) => order.id)).toEqual(['focus-1']);

    page.clearFilters();
    expect(page.focusedOrderId()).toBeNull();
  });
});

describe('AdminOrdersPage cancelled orders', () => {
  let page: AdminOrdersPage;
  let httpMock: HttpTestingController;
  let ordersSubject: BehaviorSubject<Order[]>;

  const getIdToken = vi.fn();
  const alertCreate = vi.fn();
  const alertPresent = vi.fn();
  const toastCreate = vi.fn();
  const toastPresent = vi.fn();

  let lastAlertOptions: {
    buttons: { text: string; role?: string; handler?: () => void }[];
  } | null;

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        AdminOrdersPage,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken } },
        {
          provide: OrdersService,
          useValue: { watchOrders: () => ordersSubject.asObservable() },
        },
        { provide: AlertController, useValue: { create: alertCreate } },
        { provide: ToastController, useValue: { create: toastCreate } },
      ],
    });
    page = TestBed.inject(AdminOrdersPage);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    lastAlertOptions = null;
    ordersSubject = new BehaviorSubject<Order[]>([]);
    getIdToken.mockResolvedValue('test-id-token');
    alertPresent.mockResolvedValue(undefined);
    alertCreate.mockImplementation(async (options) => {
      lastAlertOptions = options;
      return { present: alertPresent };
    });
    toastPresent.mockResolvedValue(undefined);
    toastCreate.mockResolvedValue({ present: toastPresent });
    setup();
    page.ngOnInit();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('recognizes and labels cancelled orders', async () => {
    ordersSubject.next([makeOrder({ id: 'cancelled-1', orderStatus: 'CANCELLED' })]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.isCancelled(order)).toBe(true);
    expect(page.statusLabel(order.orderStatus)).toBe('Cancelled');
    // Muted, not the alert (danger) color.
    expect(page.statusColor(order.orderStatus)).toBe('medium');
  });

  it('hides the payment badge for cancelled orders without changing payment data', async () => {
    const cancelled = makeOrder({
      id: 'cancelled-1',
      orderStatus: 'CANCELLED',
      paymentStatus: 'PENDING',
    });
    ordersSubject.next([cancelled]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.showsPaymentStatus(order)).toBe(false);
    // The stored payment state is untouched — only the display is hidden.
    expect(order.paymentStatus).toBe('PENDING');
    expect(page.showsPaymentStatus(makeOrder({ orderStatus: 'READY' }))).toBe(
      true
    );
  });

  it('offers no fulfilment actions for a cancelled order', async () => {
    ordersSubject.next([makeOrder({ id: 'cancelled-1', orderStatus: 'CANCELLED' })]);
    await waitFor(() => page.status() === 'ready');

    expect(page.allowedNext(page.orders()[0])).toEqual([]);
  });

  it('rejects every status change on a cancelled order before hitting the API', async () => {
    ordersSubject.next([
      makeOrder({ id: 'cancelled-1', orderStatus: 'CANCELLED' }),
      makeOrder({ id: 'active-1', orderStatus: 'PENDING' }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const cancelled = page
      .orders()
      .find((order) => order.id === 'cancelled-1')!;
    const active = page.orders().find((order) => order.id === 'active-1')!;
    expect(active).toBeDefined();

    for (const next of [
      'CONFIRMED',
      'PREPARING',
      'READY',
      'COMPLETED',
    ] as const) {
      await page.requestStatusChange(cancelled, next);
    }

    // No confirmation dialog and no backend request for a cancelled order.
    expect(alertCreate).not.toHaveBeenCalled();
    await tick();
    httpMock.expectNone((req) => req.url === statusUrl('cancelled-1'));

    // The rejection is explained to the admin.
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'danger',
        message: expect.stringMatching(/cancelled by the customer/i),
      })
    );
  });

  it('still lets non-cancelled orders change status', async () => {
    ordersSubject.next([makeOrder({ id: 'active-1', orderStatus: 'PENDING' })]);
    await waitFor(() => page.status() === 'ready');

    const active = page.orders()[0];
    expect(page.isCancelled(active)).toBe(false);
    expect(page.allowedNext(active)).toContain('CONFIRMED');
  });

  it('keeps cancelled orders visible and filters them in', async () => {
    ordersSubject.next([
      makeOrder({ id: 'active-1', orderStatus: 'PENDING' }),
      makeOrder({ id: 'cancelled-1', orderStatus: 'CANCELLED' }),
    ]);
    await waitFor(() => page.status() === 'ready');

    expect(page.orders().map((order) => order.id)).toEqual([
      'active-1',
      'cancelled-1',
    ]);

    page.statusFilter.set('CANCELLED');
    expect(page.visibleOrders().map((order) => order.id)).toEqual(['cancelled-1']);

    page.statusFilter.set('ALL');
    expect(page.visibleOrders()).toHaveLength(2);
  });

  it('does not treat cancellation as payment verification', async () => {
    ordersSubject.next([
      makeOrder({
        id: 'cancelled-gcash',
        orderStatus: 'CANCELLED',
        paymentMethod: 'GCASH',
        paymentStatus: 'VERIFYING',
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    // Payment eligibility is unchanged by cancellation: still requires the
    // explicit admin decision, and no payment request fires on its own.
    expect(page.canConfirmPayment(order)).toBe(true);
    await tick();
    httpMock.expectNone((req) => req.url === paymentProofUrl('cancelled-gcash'));
  });

  it('records a payment decision for a cancelled GCash order as before', async () => {
    ordersSubject.next([
      makeOrder({
        id: 'cancelled-gcash',
        orderStatus: 'CANCELLED',
        paymentMethod: 'GCASH',
        paymentStatus: 'VERIFYING',
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    await page.requestPaymentDecision(order, 'PAID');
    const confirm = lastAlertOptions?.buttons.find(
      (button) => button.role !== 'cancel'
    );
    confirm?.handler?.();

    const request = await waitForRequest(httpMock, paymentProofUrl('cancelled-gcash'));
    expect(request.request.body).toEqual({ decision: 'PAID' });
    expect(JSON.stringify(request.request.body)).not.toContain('orderStatus');
    request.flush({ id: 'cancelled-gcash', paymentStatus: 'PAID' });
    await waitFor(() => page.isPaymentBusy(order) === false);
  });
});

describe('AdminOrdersPage refunds for cancelled paid orders', () => {
  let page: AdminOrdersPage;
  let httpMock: HttpTestingController;
  let ordersSubject: BehaviorSubject<Order[]>;

  const getIdToken = vi.fn();
  const alertCreate = vi.fn();
  const alertPresent = vi.fn();
  const toastCreate = vi.fn();
  const toastPresent = vi.fn();

  let lastAlertOptions: {
    header: string;
    message: string;
    buttons: { text: string; role?: string; handler?: () => void }[];
  } | null;

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        AdminOrdersPage,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken } },
        {
          provide: OrdersService,
          useValue: { watchOrders: () => ordersSubject.asObservable() },
        },
        { provide: AlertController, useValue: { create: alertCreate } },
        { provide: ToastController, useValue: { create: toastCreate } },
      ],
    });
    page = TestBed.inject(AdminOrdersPage);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    lastAlertOptions = null;
    ordersSubject = new BehaviorSubject<Order[]>([]);
    getIdToken.mockResolvedValue('test-id-token');
    alertPresent.mockResolvedValue(undefined);
    alertCreate.mockImplementation(async (options) => {
      lastAlertOptions = options;
      return { present: alertPresent };
    });
    toastPresent.mockResolvedValue(undefined);
    toastCreate.mockResolvedValue({ present: toastPresent });
    setup();
    page.ngOnInit();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function confirmButton(): { text: string; handler?: () => void } {
    const buttons = lastAlertOptions?.buttons ?? [];
    const confirm = buttons.find((button) => button.role !== 'cancel');
    if (!confirm) {
      throw new Error('Expected the dialog to offer a confirm button.');
    }
    return confirm;
  }

  function clickConfirm(): void {
    confirmButton().handler?.();
  }

  /** A cancelled order whose GCash payment was confirmed before cancel. */
  function paidCancelled(overrides: Partial<Order> = {}): Order {
    return makeOrder({
      id: 'refund-1',
      orderStatus: 'CANCELLED',
      paymentStatus: 'PAID',
      total: 215,
      ...overrides,
    });
  }

  it('offers the Refund action for a cancelled paid order eligible for a new refund', async () => {
    const order = paidCancelled();
    ordersSubject.next([order]);
    await waitFor(() => page.status() === 'ready');

    expect(page.isCancelled(order)).toBe(true);
    expect(page.refundStatus(order)).toBe('NOT_REFUNDED');
    expect(page.showsRefundStatus(order)).toBe(true);
    expect(page.canStartRefund(order)).toBe(true);
    expect(page.canCompleteRefund(order)).toBe(false);
    expect(page.refundHint(order)).toBeNull();
    expect(page.refundOf(order)).toBe(215);
    expect(page.refundLabel(order.refund?.status ?? 'NOT_REFUNDED')).toBe(
      'Not refunded'
    );
  });

  it('hides refund actions for unpaid, verifying, rejected and active orders', async () => {
    ordersSubject.next([
      paidCancelled({
        id: 'cancelled-unpaid',
        paymentStatus: 'PENDING',
        gcashDetails: null,
      }),
      paidCancelled({ id: 'cancelled-verifying', paymentStatus: 'VERIFYING' }),
      paidCancelled({ id: 'cancelled-rejected', paymentStatus: 'REJECTED' }),
      paidCancelled({ id: 'active-paid', orderStatus: 'COMPLETED' }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const orders = page.orders();
    for (const order of orders) {
      expect(page.canStartRefund(order)).toBe(false);
      expect(page.canCompleteRefund(order)).toBe(false);
      expect(
        page.refundHint(order),
        `expected a hint for ${order.id}`
      ).not.toBeNull();

      await page.requestRefund(order);
    }
    // No dialog and no refund request for any of the ineligible orders.
    expect(alertCreate).not.toHaveBeenCalled();
    await tick();
    httpMock.expectNone((req) => req.url.includes('/refund'));
  });

  it('does not display a refund for a cancelled unpaid COD order with legacy fields', async () => {
    const order = paidCancelled({
      id: 'legacy-cod-unpaid',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      gcashDetails: null,
      refund: {
        status: 'REFUND_PENDING',
        amount: 215,
        requestedAt: '2026-10-15T10:00:00.000Z',
      },
    });
    ordersSubject.next([order]);
    await waitFor(() => page.status() === 'ready');

    // The raw historic value is preserved but never presented as refundable.
    expect(page.refundStatus(order)).toBe('REFUND_PENDING');
    expect(page.showsRefundStatus(order)).toBe(false);
    expect(page.canStartRefund(order)).toBe(false);
    expect(page.canCompleteRefund(order)).toBe(false);
  });

  it('keeps refund handling for a cancelled COD order whose cash was collected', async () => {
    const order = paidCancelled({
      id: 'legacy-cod-paid',
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
    });
    ordersSubject.next([order]);
    await waitFor(() => page.status() === 'ready');

    expect(page.showsRefundStatus(order)).toBe(true);
    expect(page.canStartRefund(order)).toBe(true);
    expect(page.refundOf(order)).toBe(215);
  });

  it('displays the refund status, amount and timestamps when recorded', async () => {
    ordersSubject.next([
      paidCancelled({
        id: 'pending-refund',
        refund: {
          status: 'REFUND_PENDING',
          amount: 215,
          requestedBy: 'admin-1',
          requestedAt: '2026-10-15T10:00:00.000Z',
          completedAt: null,
        },
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.refundStatus(order)).toBe('REFUND_PENDING');
    expect(page.refundLabel('REFUND_PENDING')).toBe('Refund pending');
    expect(page.refundColor('REFUND_PENDING')).toBe('warning');
    expect(page.refundOf(order)).toBe(215);
    expect(page.canStartRefund(order)).toBe(false);
    expect(page.canCompleteRefund(order)).toBe(true);
  });

  it('hides both actions for an already-refunded order', async () => {
    ordersSubject.next([
      paidCancelled({
        id: 'refunded-order',
        refund: {
          status: 'REFUNDED',
          amount: 215,
          completedAt: '2026-10-16T09:00:00.000Z',
        },
      }),
    ]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    expect(page.refundStatus(order)).toBe('REFUNDED');
    expect(page.canStartRefund(order)).toBe(false);
    expect(page.canCompleteRefund(order)).toBe(false);
    expect(page.refundHint(order)).toMatch(/already been refunded/i);

    await page.requestRefund(order);
    await tick();
    httpMock.expectNone((req) => req.url === refundUrl('refunded-order'));
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger' })
    );
  });

  it('opens a refund explaining the manual return and records it as pending', async () => {
    const order = paidCancelled();
    ordersSubject.next([order]);
    await waitFor(() => page.status() === 'ready');

    await page.requestRefund(order);
    expect(lastAlertOptions?.header).toMatch(/record pending refund/i);
    // The dialog explains that no money moves through BistroBuddies.
    expect(lastAlertOptions?.message).toMatch(/manually outside BistroBuddies/i);
    expect(lastAlertOptions?.message).toMatch(/REFUND_PENDING/i);
    // Opening the refund explicitly does not mark it completed.
    expect(lastAlertOptions?.message).toMatch(
      /does not (return the money|mark the refund completed)/
    );
    expect(lastAlertOptions?.message).toMatch(/fulfilment status stays/i);
    expect(lastAlertOptions?.message).toMatch(/full paid total/i);
    await tick();
    httpMock.expectNone((req) => req.url === refundUrl('refund-1'));

    clickConfirm();

    const request = await waitForRequest(httpMock, refundUrl('refund-1'));
    expect(request.request.method).toBe('POST');
    // The exact backend contract body; no amount is sent from the client.
    expect(request.request.body).toEqual({ action: 'PENDING' });
    expect(JSON.stringify(request.request.body)).not.toContain('confirmed');
    expect(JSON.stringify(request.request.body)).not.toContain('amount');
    expect(JSON.stringify(request.request.body)).not.toContain('orderStatus');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );
    expect(page.isRefundBusy(order)).toBe(true);

    request.flush({
      id: 'refund-1',
      refund: { status: 'REFUND_PENDING', amount: 215 },
    });
    await waitFor(() => page.isRefundBusy(order) === false);

    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        message: expect.stringMatching(/pending/i),
      })
    );
  });

  it('never marks a refund completed merely because Refund was clicked', async () => {
    ordersSubject.next([paidCancelled()]);
    await waitFor(() => page.status() === 'ready');
    const order = page.orders()[0];

    await page.requestRefund(order);
    clickConfirm();

    const request = await waitForRequest(httpMock, refundUrl('refund-1'));
    expect(request.request.body).toEqual({ action: 'PENDING' });
    expect(JSON.stringify(request.request.body)).not.toContain('COMPLETE');
    request.flush({
      id: 'refund-1',
      refund: { status: 'REFUND_PENDING', amount: 215 },
    });
    await waitFor(() => page.isRefundBusy(order) === false);

    // The row still reads REFUND_PENDING â€” completion never happens here,
    // only a later, explicitly confirmed second action can do that.
    expect(page.refundStatus(order)).toBe('NOT_REFUNDED');
  });

  it('requires two confirmations and the explicit flag to complete a pending refund', async () => {
    ordersSubject.next([
      paidCancelled({
        refund: { status: 'REFUND_PENDING', amount: 215 },
      }),
    ]);
    await waitFor(() => page.status() === 'ready');
    const order = page.orders()[0];

    await page.requestRefundCompleted(order);
    expect(lastAlertOptions?.header).toMatch(/mark refund completed/i);
    // First dialog requires the money to have actually been returned.
    expect(lastAlertOptions?.message).toMatch(/manually outside BistroBuddies/i);
    expect(lastAlertOptions?.message).toMatch(/verified the transaction/i);
    expect(lastAlertOptions?.message).toMatch(/never be refunded again/i);
    expect(lastAlertOptions?.message).toMatch(/payment status stays/i);

    // Confirming the first dialog only opens the second confirmation.
    clickConfirm();
    await tick();
    httpMock.expectNone((req) => req.url === refundUrl('refund-1'));

    expect(lastAlertOptions?.header).toMatch(/final confirmation/i);
    expect(lastAlertOptions?.message).toMatch(/cannot be undone/i);
    clickConfirm();

    const request = await waitForRequest(httpMock, refundUrl('refund-1'));
    expect(request.request.body).toEqual({ action: 'COMPLETE', confirmed: true });
    request.flush({
      id: 'refund-1',
      refund: { status: 'REFUNDED', amount: 215 },
    });
    await waitFor(() => page.isRefundBusy(order) === false);
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' })
    );

    // The realtime Firestore listener refreshes the row afterwards.
    ordersSubject.next([
      {
        ...order,
        refund: { status: 'REFUNDED', amount: 215 },
      } as Order,
    ]);
    expect(page.refundStatus(page.orders()[0])).toBe('REFUNDED');
  });

  it('blocks completing a refund that was never recorded as pending', async () => {
    ordersSubject.next([paidCancelled()]);
    await waitFor(() => page.status() === 'ready');
    const order = page.orders()[0];

    expect(page.canCompleteRefund(order)).toBe(false);

    // No confirmation dialog without a pending refund.
    await page.requestRefundCompleted(order);
    expect(alertCreate).not.toHaveBeenCalled();
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger' })
    );

    // The handler refuses the action too â€” nothing reaches the backend.
    await page.applyRefund(order, { action: 'COMPLETE', confirmed: true });
    await tick();
    httpMock.expectNone((req) => req.url === refundUrl('refund-1'));
  });

  it('shows the backend error when the refund is refused', async () => {
    ordersSubject.next([paidCancelled()]);
    await waitFor(() => page.status() === 'ready');
    const order = page.orders()[0];

    await page.requestRefund(order);
    clickConfirm();
    const request = await waitForRequest(httpMock, refundUrl('refund-1'));
    request.flush(
      {
        error: {
          code: 'order_not_refundable',
          message:
            'Only cancelled orders with a confirmed (PAID) payment can be refunded.',
        },
      },
      { status: 409, statusText: 'Conflict' }
    );
    await waitFor(() => page.isRefundBusy(order) === false);

    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'danger',
        message:
          'Only cancelled orders with a confirmed (PAID) payment can be refunded.',
      })
    );
  });

  it('prevents duplicate refund requests while one is in flight', async () => {
    ordersSubject.next([paidCancelled()]);
    await waitFor(() => page.status() === 'ready');
    const order = page.orders()[0];

    const first = page.applyRefund(order, { action: 'PENDING' });
    const second = page.applyRefund(order, { action: 'PENDING' });

    const request = await waitForRequest(httpMock, refundUrl('refund-1'));
    request.flush({ id: 'refund-1', refund: { status: 'REFUND_PENDING' } });
    await Promise.all([first, second]);

    // Only the first refund request reached the backend.
    httpMock.expectNone(
      (req) => req.method === 'POST' && req.url === refundUrl('refund-1')
    );
    expect(page.isRefundBusy(order)).toBe(false);
  });

  it('blocks a second refund dialog while one is in flight', async () => {
    ordersSubject.next([paidCancelled()]);
    await waitFor(() => page.status() === 'ready');
    const order = page.orders()[0];

    alertCreate.mockClear();
    const inFlight = page.applyRefund(order, { action: 'PENDING' });
    await page.requestRefund(order);

    // No duplicate confirmation dialog while the request runs.
    expect(alertCreate).not.toHaveBeenCalled();

    const request = await waitForRequest(httpMock, refundUrl('refund-1'));
    request.flush({ id: 'refund-1', refund: { status: 'REFUND_PENDING' } });
    await inFlight;
  });

  it('keeps the existing manual GCash verification workflow untouched', async () => {
    const verifying = paidCancelled({
      id: 'cancelled-verifying',
      paymentStatus: 'VERIFYING',
      gcashDetails: {
        accountName: 'Juan dela Cruz',
        accountNumber: '09171234567',
        submittedAt: '2026-10-15T08:00:00.000Z',
      },
    });
    ordersSubject.next([verifying]);
    await waitFor(() => page.status() === 'ready');

    const order = page.orders()[0];
    // No refund for a cancelled but still-verifying orderâ€¦
    expect(page.canStartRefund(order)).toBe(false);
    expect(page.canCompleteRefund(order)).toBe(false);
    // â€¦but the payment decision workflow is exactly as before.
    expect(page.isGcashOrder(order)).toBe(true);
    expect(page.hasGcashDetails(order)).toBe(true);
    expect(page.canConfirmPayment(order)).toBe(true);
    expect(page.canRejectPayment(order)).toBe(true);

    await page.requestRefund(order);
    await tick();
    httpMock.expectNone(
      (req) => req.url === refundUrl('cancelled-verifying')
    );

    // Refunding a paid cancelled order also never fires a payment request,
    // never rewrites payment details, and never sends a status change.
    const paid = paidCancelled();
    ordersSubject.next([paid]);
    await page.requestRefund(paid);
    clickConfirm();
    const refundRequest = await waitForRequest(httpMock, refundUrl('refund-1'));
    expect(refundRequest.request.body).toEqual({ action: 'PENDING' });
    const body = JSON.stringify(refundRequest.request.body);
    expect(body).not.toContain('decision');
    expect(body).not.toContain('orderStatus');
  });
});


describe('AdminOrdersPage order badges', () => {
  let fixture: ComponentFixture<AdminOrdersPage>;
  let page: AdminOrdersPage;
  let ordersSubject: BehaviorSubject<Order[]>;

  const getIdToken = vi.fn();
  const alertCreate = vi.fn();
  const toastCreate = vi.fn();

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        AdminOrdersPage,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken } },
        {
          provide: OrdersService,
          useValue: { watchOrders: () => ordersSubject.asObservable() },
        },
        { provide: AlertController, useValue: { create: alertCreate } },
        { provide: ToastController, useValue: { create: toastCreate } },
      ],
    });
    fixture = TestBed.createComponent(AdminOrdersPage);
    page = fixture.componentInstance;
  }

  function badgeTexts(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('ion-badge')
    ).map((badge) => (badge as HTMLElement).textContent?.trim() ?? '');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    ordersSubject = new BehaviorSubject<Order[]>([]);
    getIdToken.mockResolvedValue('test-id-token');
    alertCreate.mockResolvedValue({ present: vi.fn() });
    toastCreate.mockResolvedValue({ present: vi.fn() });
    setup();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('does not render a Delivery fulfilment tag in the order list or details', async () => {
    ordersSubject.next([
      makeOrder({
        id: 'delivery-tag',
        orderStatus: 'READY',
        fulfillmentType: 'DELIVERY',
      }),
    ]);
    fixture.detectChanges();
    await waitFor(() => page.status() === 'ready');
    fixture.detectChanges();

    const badges = badgeTexts();
    expect(badges).toContain('Ready');
    expect(badges).not.toContain('Delivery');
    expect(badges.some((text) => /delivery/i.test(text))).toBe(false);
  });

  it('shows Cancelled without any payment badge or payment status label', async () => {
    ordersSubject.next([
      makeOrder({
        id: 'cancelled-display',
        orderStatus: 'CANCELLED',
        paymentStatus: 'PENDING',
      }),
    ]);
    fixture.detectChanges();
    await waitFor(() => page.status() === 'ready');
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector(
      '.order-card'
    ) as HTMLElement;
    expect(card.textContent).toContain('Cancelled');
    expect(badgeTexts()).toContain('Cancelled');
    expect(badgeTexts().some((text) => /^Payment:/.test(text))).toBe(false);
    expect(card.textContent).not.toMatch(/Payment:\s*Pending/);
    expect(card.textContent).not.toMatch(/Status:\s*Pending/);
    // The stored payment state is untouched; only its badge is hidden.
    expect(page.orders()[0].paymentStatus).toBe('PENDING');
  });
});
