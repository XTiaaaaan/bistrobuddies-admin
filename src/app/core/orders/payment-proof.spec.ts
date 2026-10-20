import { Order } from '@shared/models/order.model';
import {
  hasSubmittedPaymentProof,
  isAwaitingProofVerification,
  paymentProofImageSrc,
  paymentProofOf,
  paymentProofRejectionReason,
  paymentProofSubmittedAt,
  resolvePaymentProofUrl,
} from './payment-proof';

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
    orderStatus: 'PENDING',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('payment proof reading', () => {
  it('reads the canonical nested payment proof', () => {
    const order = makeOrder({
      paymentProof: {
        url: 'https://res.cloudinary.com/demo/proof.jpg',
        publicId: 'proofs/order-1',
        mimeType: 'image/jpeg',
        size: 240000,
        submittedBy: 'uid-1',
        submittedAt: '2026-10-20T08:30:00.000Z',
      },
    });

    expect(paymentProofOf(order)).toEqual({
      url: 'https://res.cloudinary.com/demo/proof.jpg',
      publicId: 'proofs/order-1',
      mimeType: 'image/jpeg',
      size: 240000,
      submittedBy: 'uid-1',
      submittedAt: '2026-10-20T08:30:00.000Z',
    });
    expect(hasSubmittedPaymentProof(order)).toBe(true);
    expect(paymentProofSubmittedAt(order)).toBe('2026-10-20T08:30:00.000Z');
  });

  it('supports the legacy gcashProof alias and imageUrl field', () => {
    const order = makeOrder({
      gcashProof: {
        imageUrl: 'https://example.com/gcash-proof.png',
        mimeType: 'image/png',
      },
    });

    expect(paymentProofOf(order)?.url).toBe(
      'https://example.com/gcash-proof.png'
    );
    expect(paymentProofOf(order)?.mimeType).toBe('image/png');
  });

  it('supports flat proof aliases used by older order documents', () => {
    const order = makeOrder({
      paymentProofUrl: '',
      proofUrl: 'https://example.com/flat-proof.jpg',
      paymentProofPublicId: 'proofs/flat',
      paymentProofSubmittedBy: 'uid-1',
      paymentProofMimeType: 'image/jpeg',
      paymentProofSize: 1024,
      paymentProofSubmittedAt: 1760949000000,
    });

    expect(paymentProofOf(order)).toEqual({
      url: 'https://example.com/flat-proof.jpg',
      publicId: 'proofs/flat',
      mimeType: 'image/jpeg',
      size: 1024,
      submittedBy: 'uid-1',
      submittedAt: 1760949000000,
    });
  });

  it('prefers the nested proof over flat aliases', () => {
    const order = makeOrder({
      paymentProof: { url: 'https://example.com/nested.jpg' },
      gcashProofUrl: 'https://example.com/flat.jpg',
    });

    expect(paymentProofOf(order)?.url).toBe('https://example.com/nested.jpg');
  });

  it('returns null for missing or incomplete proofs', () => {
    expect(paymentProofOf(makeOrder())).toBeNull();
    expect(paymentProofOf(makeOrder({ paymentProof: { url: '  ' } }))).toBeNull();
    expect(hasSubmittedPaymentProof(makeOrder())).toBe(false);
    expect(paymentProofImageSrc(makeOrder())).toBe('');
    expect(paymentProofSubmittedAt(makeOrder())).toBeNull();
  });
});

describe('payment proof URL safety', () => {
  it('accepts displayable image schemes', () => {
    expect(resolvePaymentProofUrl('https://example.com/proof.jpg')).toBe(
      'https://example.com/proof.jpg'
    );
    expect(resolvePaymentProofUrl('http://example.com/proof.jpg')).toBe(
      'http://example.com/proof.jpg'
    );
    expect(resolvePaymentProofUrl('data:image/png;base64,abc')).toBe(
      'data:image/png;base64,abc'
    );
    expect(resolvePaymentProofUrl('blob:https://example.com/abc')).toBe(
      'blob:https://example.com/abc'
    );
  });

  it('rejects unsafe or unsupported URLs', () => {
    expect(resolvePaymentProofUrl('javascript:alert(1)')).toBe('');
    expect(resolvePaymentProofUrl('ftp://example.com/proof.jpg')).toBe('');
    expect(resolvePaymentProofUrl('/proofs/private.jpg')).toBe('');
    expect(resolvePaymentProofUrl('')).toBe('');
    expect(resolvePaymentProofUrl(null)).toBe('');
  });

  it('resolves legacy backend upload paths against the API origin', () => {
    expect(resolvePaymentProofUrl('/uploads/proofs/order-1.jpg')).toContain(
      '/uploads/proofs/order-1.jpg'
    );
  });
});

describe('payment proof verification state', () => {
  const proof = { url: 'https://example.com/proof.jpg' };

  it('flags a GCash VERIFYING order with a proof as awaiting review', () => {
    expect(isAwaitingProofVerification(makeOrder({ paymentProof: proof }))).toBe(
      true
    );
    expect(
      isAwaitingProofVerification(
        makeOrder({ paymentMethod: 'gcash', paymentProof: proof })
      )
    ).toBe(true);
  });

  it('never flags COD, missing proofs or decided payments', () => {
    expect(
      isAwaitingProofVerification(
        makeOrder({ paymentMethod: 'COD', paymentProof: proof })
      )
    ).toBe(false);
    expect(isAwaitingProofVerification(makeOrder())).toBe(false);
    expect(
      isAwaitingProofVerification(
        makeOrder({ paymentStatus: 'PAID', paymentProof: proof })
      )
    ).toBe(false);
    expect(
      isAwaitingProofVerification(
        makeOrder({ paymentStatus: 'REJECTED', paymentProof: proof })
      )
    ).toBe(false);
  });
});

describe('payment proof rejection reason', () => {
  it('reads the decision reason and rejection aliases', () => {
    expect(
      paymentProofRejectionReason(
        makeOrder({
          paymentDecision: {
            decision: 'REJECTED',
            decidedBy: 'admin-1',
            decidedAt: null,
            reason: '  No matching GCash transaction.  ',
          },
        })
      )
    ).toBe('No matching GCash transaction.');
    expect(
      paymentProofRejectionReason(
        makeOrder({ paymentProofRejectionReason: 'Blurry screenshot.' })
      )
    ).toBe('Blurry screenshot.');
    expect(paymentProofRejectionReason(makeOrder())).toBeNull();
  });
});
