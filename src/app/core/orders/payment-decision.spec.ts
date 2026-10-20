import { Order } from '@shared/models/order.model';
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
} from './payment-decision';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    customerId: 'uid-1',
    customerSnapshot: null,
    addressSnapshot: null,
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
      submittedAt: null,
    },
    orderStatus: 'PENDING',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('GCash order detection', () => {
  it('recognizes GCash orders regardless of case', () => {
    expect(isGcashOrder(makeOrder())).toBe(true);
    expect(isGcashOrder(makeOrder({ paymentMethod: 'gcash' }))).toBe(true);
    expect(isGcashOrder(makeOrder({ paymentMethod: 'COD' }))).toBe(false);
    expect(isGcashOrder(makeOrder({ paymentMethod: 'ONLINE' }))).toBe(false);
  });

  it('reads the submitted GCash account name and mobile number', () => {
    const order = makeOrder();
    expect(gcashAccountName(order)).toBe('Juan dela Cruz');
    expect(gcashAccountNumber(order)).toBe('09171234567');
  });

  it('reports missing details for orders without submitted fields', () => {
    expect(hasSubmittedGcashDetails(makeOrder())).toBe(true);
    expect(
      hasSubmittedGcashDetails(makeOrder({ gcashDetails: null }))
    ).toBe(false);
    // Historical orders pre-dating the GCash fields carry no details object.
    const historic = makeOrder();
    delete historic.gcashDetails;
    expect(hasSubmittedGcashDetails(historic)).toBe(false);
    expect(gcashAccountName(historic)).toBe('');
    expect(gcashAccountNumber(historic)).toBe('');
    // Blank strings are not usable details either.
    expect(
      hasSubmittedGcashDetails(
        makeOrder({
          gcashDetails: { accountName: '  ', accountNumber: '' },
        })
      )
    ).toBe(false);
  });

  it('reads the payment status case-insensitively', () => {
    expect(paymentStatusOf(makeOrder())).toBe('VERIFYING');
    expect(
      paymentStatusOf(makeOrder({ paymentStatus: 'paid' }))
    ).toBe('PAID');
  });
});

describe('payment decision eligibility', () => {
  it('offers confirm and reject for a VERIFYING GCash order with details', () => {
    const order = makeOrder();
    expect(canConfirmPayment(order)).toBe(true);
    expect(canRejectPayment(order)).toBe(true);
    expect(canDecidePayment(order, 'PAID')).toBe(true);
    expect(canDecidePayment(order, 'REJECTED')).toBe(true);
    expect(paymentDecisionHint(order)).toBeNull();
  });

  it('requires an uploaded proof before approving payment', () => {
    const order = makeOrder({ paymentProof: null });
    expect(canConfirmPayment(order)).toBe(false);
    expect(canDecidePayment(order, 'PAID')).toBe(false);
    expect(canRejectPayment(order)).toBe(true);
    expect(canDecidePayment(order, 'REJECTED')).toBe(true);
    expect(paymentDecisionHint(order)).toMatch(/screenshot has not been uploaded/i);
  });

  it('accepts flat proof aliases for legacy submissions', () => {
    const order = makeOrder({
      paymentProof: null,
      paymentProofUrl: 'https://example.com/proofs/legacy.jpg',
    });
    expect(canConfirmPayment(order)).toBe(true);
    expect(canDecidePayment(order, 'PAID')).toBe(true);
  });

  it('hides actions while GCash details are missing', () => {
    const order = makeOrder({
      paymentStatus: 'PENDING',
      gcashDetails: null,
    });
    expect(canConfirmPayment(order)).toBe(false);
    expect(canRejectPayment(order)).toBe(false);
    expect(paymentDecisionHint(order)).toMatch(/no gcash details/i);
  });

  it('hides actions for already-confirmed payments', () => {
    const order = makeOrder({ paymentStatus: 'PAID' });
    expect(canConfirmPayment(order)).toBe(false);
    expect(canRejectPayment(order)).toBe(false);
    expect(paymentDecisionHint(order)).toMatch(/already confirmed/i);
  });

  it('requires a customer resubmission after a rejection', () => {
    const rejected = makeOrder({ paymentStatus: 'REJECTED' });
    expect(canConfirmPayment(rejected)).toBe(false);
    expect(canRejectPayment(rejected)).toBe(false);
    expect(paymentDecisionHint(rejected)).toMatch(/resubmit/i);

    // The resubmission returns the order to VERIFYING, re-enabling decisions.
    const resubmitted = makeOrder({
      paymentStatus: 'VERIFYING',
      gcashDetails: {
        accountName: 'Juan dela Cruz',
        accountNumber: '09179999999',
      },
    });
    expect(canConfirmPayment(resubmitted)).toBe(true);
    expect(canRejectPayment(resubmitted)).toBe(true);
  });

  it('rejects unknown decisions', () => {
    expect(
      canDecidePayment(makeOrder(), 'ANYTHING' as 'PAID')
    ).toBe(false);
  });
});

describe('cancelled order payment regression', () => {
  it('does not treat cancellation as a payment decision', () => {
    // Cancelling is a fulfilment change only: no payment status is invented.
    const cancelled = makeOrder({
      orderStatus: 'CANCELLED',
      paymentStatus: 'PENDING',
      gcashDetails: null,
    });
    expect(canConfirmPayment(cancelled)).toBe(false);
    expect(canRejectPayment(cancelled)).toBe(false);
  });

  it('leaves the existing GCash verification rule untouched', () => {
    // Eligibility depends on payment method/status/details only, exactly as
    // before cancellation existed — never on orderStatus.
    const verifying = makeOrder({
      orderStatus: 'CANCELLED',
      paymentStatus: 'VERIFYING',
    });
    expect(canConfirmPayment(verifying)).toBe(canConfirmPayment(makeOrder()));
    expect(canRejectPayment(verifying)).toBe(canRejectPayment(makeOrder()));
    expect(canConfirmPayment(verifying)).toBe(true);

    const paid = makeOrder({
      orderStatus: 'CANCELLED',
      paymentStatus: 'PAID',
    });
    expect(canConfirmPayment(paid)).toBe(false);
    expect(canRejectPayment(paid)).toBe(false);
    expect(paymentDecisionHint(paid)).toMatch(/already confirmed/i);
  });
});

describe('COD regression', () => {
  it('never offers payment decisions for COD orders', () => {
    const order = makeOrder({
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      gcashDetails: null,
    });
    expect(isGcashOrder(order)).toBe(false);
    expect(hasSubmittedGcashDetails(order)).toBe(false);
    expect(canConfirmPayment(order)).toBe(false);
    expect(canRejectPayment(order)).toBe(false);
    expect(nonGcashPaymentNote(order)).toMatch(/cash on delivery/i);
  });

  it('never offers payment decisions for legacy ONLINE orders', () => {
    const order = makeOrder({
      paymentMethod: 'ONLINE',
      paymentStatus: 'PENDING',
    });
    expect(canConfirmPayment(order)).toBe(false);
    expect(canRejectPayment(order)).toBe(false);
    expect(paymentDecisionHint(order)).toBeNull();
    expect(nonGcashPaymentNote(order)).toMatch(/only gcash orders/i);
  });
});
