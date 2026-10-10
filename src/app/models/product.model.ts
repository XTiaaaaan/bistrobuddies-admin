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
   * Legacy PHP list price, re-derived server-side from the size tiers
   * (medium → small → large). Optional here because documents written before
   * the standardized schema may only carry one of the two shapes — use
   * `productPrice()` to read either shape.
   */
  price?: number;
  currency?: string;
  /** Canonical PHP size prices — what each size actually costs. */
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
 * The three size prices are canonical: they are stored exactly as sent, so
 * distinct amounts (e.g. 100/120/150) stay distinct. The legacy `price` is
 * sent alongside them for older readers and is always the medium tier, which
 * is the value the backend re-derives from the size tiers — it can never
 * flatten them.
 * (`../bistrobuddies-backend/docs/API_CONTRACT.md` §Write payloads)
 */
export interface ProductInput {
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  cloudinaryPublicId?: string;
  /** Legacy flat price, kept in sync with `mediumPrice`. */
  price: number;
  smallPrice: number;
  mediumPrice: number;
  largePrice: number;
  sugarOptions: string[];
  available: boolean;
}
