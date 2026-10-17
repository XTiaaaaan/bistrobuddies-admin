import type { Timestamp } from 'firebase/firestore';
import { ProductSize } from './product.model';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentMethod = 'COD' | 'ONLINE' | 'GCASH';

/**
 * Manual GCash verification states owned by the backend (`PENDING`,
 * `VERIFYING`, `PAID`, `REJECTED`). `PaymentStatus` stays a plain string so
 * historic / future documents keep displaying correctly.
 */
export type PaymentStatus = string;

/** Admin payment decision accepted by `POST /api/admin/orders/:id/payment`. */
export type PaymentDecision = 'PAID' | 'REJECTED';

/**
 * Manual refund states owned by the backend
 * (`docs/API_CONTRACT.md` §4 "Manual refunds"). `RefundStatus` stays a plain
 * tolerant value at rest: `NOT_REFUNDED` is the default for every
 * historical order, `REFUND_PENDING` means an admin opened the refund, and
 * `REFUNDED` means an admin explicitly confirmed the money was sent back.
 */
export type RefundStatus = string;

/**
 * Admin request to `POST /api/admin/orders/:id/refund`. `PENDING` opens a
 * refund on a cancelled PAID order (never marks it completed); `COMPLETE`
 * must always carry the explicit `confirmed` flag — merely clicking again
 * never completes a refund.
 */
export type OrderRefundRequest =
  | { action: 'PENDING' }
  | { action: 'COMPLETE'; confirmed: true };

/**
 * The `refund` facts object on `orders/{id}` (see the backend's
 * `docs/API_CONTRACT.md` §4 "Manual refunds"). Written only by the backend;
 * timestamps arrive as Firestore `Timestamp`s through the live order
 * listener and as ISO strings on the HTTP response.
 */
export interface RefundInfo {
  status: RefundStatus;
  /** PHP amount recorded when the refund was opened; absent until then. */
  amount?: number | null;
  requestedAt?: Timestamp | string | null;
  requestedBy?: string;
  completedAt?: Timestamp | string | null;
  completedBy?: string;
}

/** One entry of the append-only refund audit trail (admin-only metadata). */
export interface RefundAuditEntry {
  from: string;
  to: string;
  actorUid: string;
  actorRole: string;
}

/**
 * GCash details submitted by the customer through
 * `POST /api/orders/:id/gcash-details` (`{ accountName, accountNumber }`).
 * `null` (or a missing field) means nothing was submitted yet — this is the
 * normal state for COD orders and for historical orders created before the
 * GCash fields existed.
 */
export interface GcashDetails {
  accountName: string;
  accountNumber: string;
  submittedAt?: Timestamp | string | null;
  submittedBy?: string;
}

/** Latest admin payment decision (admin-only metadata, see `Order`). */
export interface PaymentDecisionRecord {
  decision: PaymentDecision;
  decidedBy: string;
  decidedAt: Timestamp | string | null;
}

/** One entry of the append-only payment audit trail (admin-only metadata). */
export interface PaymentAuditEntry {
  from: string;
  to: string;
  actorUid: string;
  actorRole: string;
}

/** One line of an order, captured at purchase time and never rewritten. */
export interface OrderItemSnapshot {
  productId: string;
  productName: string;
  imageUrl: string;
  size: ProductSize;
  sugar: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  currency?: string;
}

export interface OrderCustomerSnapshot {
  uid?: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface OrderAddressSnapshot {
  recipientName: string;
  phone: string;
  address: string;
  city?: string;
  postalCode?: string;
}

/**
 * The `orders/{id}` Firestore document (see the backend's
 * `docs/API_CONTRACT.md` §4). Historic snapshots are displayed exactly as
 * stored — the admin UI never recomputes item prices or totals.
 */
export interface Order {
  id: string;
  customerId: string;
  customerSnapshot: OrderCustomerSnapshot | null;
  addressSnapshot: OrderAddressSnapshot | null;
  items: OrderItemSnapshot[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency?: string;
  customerComment: string;
  paymentMethod: PaymentMethod | string;
  paymentStatus: PaymentStatus;
  /**
   * GCash details submitted by the customer, or `null`/missing when nothing
   * was submitted yet (COD orders and historical orders pre-dating the GCash
   * fields). Arrives through the live Firestore order snapshot; never written
   * from this app.
   */
  gcashDetails?: GcashDetails | null;
  /**
   * Latest admin payment decision and audit trail. The backend exposes these
   * only to admins through its order serialization path; when the Firestore
   * snapshot carries them they are display-only here.
   */
  paymentDecision?: PaymentDecisionRecord | null;
  paymentAudit?: PaymentAuditEntry[];
  /**
   * Manual refund facts (`{ status, amount, requestedAt, completedAt, … }`),
   * written only by the backend through `POST /api/admin/orders/:id/refund`.
   * Missing on historical orders — that reads as `NOT_REFUNDED`.
   */
  refund?: RefundInfo | null;
  refundAudit?: RefundAuditEntry[];
  orderStatus: OrderStatus | string;
  createdAt: Timestamp | string | number | null;
  updatedAt: Timestamp | string | number | null;
}
