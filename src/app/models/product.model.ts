import type { Timestamp } from 'firebase/firestore';

export type ProductSize = 'small' | 'medium' | 'large';

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  cloudinaryPublicId: string;
  /**
   * Canonical PHP list price (single-price model). Optional here because
   * legacy documents written before the standardized schema only carry the
   * size tiers — use `productPrice()` to read either shape.
   */
  price?: number;
  currency?: string;
  /** Size tiers kept for compatibility with existing data / the customer app. */
  smallPrice?: number;
  mediumPrice?: number;
  largePrice?: number;
  sugarOptions?: string[];
  available: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/**
 * Payload accepted by `POST`/`PATCH /api/admin/products`.
 *
 * Single-price model: the form collects one PHP price and the backend
 * backfills `smallPrice`/`mediumPrice`/`largePrice` from it, so existing
 * documents and historic orders (which snapshot their own prices) stay valid.
 */
export interface ProductInput {
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  cloudinaryPublicId?: string;
  price: number;
  sugarOptions: string[];
  available: boolean;
}
