import type { Timestamp } from 'firebase/firestore';
import { ProductSize } from './product.model';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentMethod = 'COD' | 'ONLINE';

/**
 * Payment status as stored by the backend. `PENDING` is the only value the
 * API writes today (PayMongo is not implemented); other values are shown
 * read-only so historic / future documents keep displaying correctly.
 */
export type PaymentStatus = string;

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
  orderStatus: OrderStatus | string;
  createdAt: Timestamp | string | number | null;
  updatedAt: Timestamp | string | number | null;
}
