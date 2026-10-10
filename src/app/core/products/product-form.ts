import { Product, ProductInput } from '@shared/models/product.model';

/** Categories offered by the product form dropdown. */
export const KNOWN_CATEGORIES = ['Hot', 'Iced', 'Frappe'];

/** Sentinel value that reveals the free-text category input. */
export const CUSTOM_CATEGORY_VALUE = '__other__';

/**
 * Canonical PHP price for a product document.
 *
 * Prefers the standardized `price` field and falls back to the size tiers of
 * legacy documents, so old products keep displaying a price without any
 * migration.
 */
export function productPrice(
  product: Partial<Product> | null | undefined
): number | null {
  if (!product) {
    return null;
  }
  const candidates = [
    product.price,
    product.mediumPrice,
    product.smallPrice,
    product.largePrice,
  ];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

/**
 * True when a document still carries differing size tiers (legacy data that
 * has not been normalized to the single-price model yet).
 */
export function hasLegacyTierPrices(
  product: Partial<Product> | null | undefined
): boolean {
  if (!product) {
    return false;
  }
  const tiers = [product.smallPrice, product.mediumPrice, product.largePrice];
  const valid = tiers.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  if (valid.length < 2) {
    return false;
  }
  return new Set(valid).size > 1;
}

export function resolveCategory(
  selected: string,
  customCategory: string
): string {
  if (selected === CUSTOM_CATEGORY_VALUE) {
    return customCategory.trim();
  }
  return selected.trim();
}

export interface ProductFormValue {
  name: string;
  description: string;
  category: string;
  customCategory: string;
  imageUrl: string;
  /** Raw price input in PHP. */
  price: string;
  sugarOptions: string[];
  available: boolean;
}

export type ProductFormResult =
  | { ok: true; input: ProductInput }
  | { ok: false; error: string };

/**
 * Validates the product form and builds the payload for
 * `POST`/`PATCH /api/admin/products`.
 *
 * Required fields and nonnegative prices are checked here; the backend
 * remains the authority for every other rule (it also rejects a price of 0).
 */
export function buildProductInput(
  value: ProductFormValue,
  cloudinaryPublicId = ''
): ProductFormResult {
  const name = value.name.trim();
  if (!name) {
    return { ok: false, error: 'Product name is required.' };
  }

  const category = resolveCategory(value.category, value.customCategory);
  if (!category) {
    return {
      ok: false,
      error:
        value.category === CUSTOM_CATEGORY_VALUE
          ? 'Enter a category name.'
          : 'Category is required.',
    };
  }

  const price = parseProductPrice(value.price);
  if (!price.ok) {
    return { ok: false, error: price.error };
  }

  if (value.sugarOptions.length === 0) {
    return { ok: false, error: 'Select at least one sugar option.' };
  }

  return {
    ok: true,
    input: {
      name,
      description: value.description.trim(),
      category,
      imageUrl: value.imageUrl.trim(),
      cloudinaryPublicId,
      price: price.value,
      sugarOptions: [...value.sugarOptions],
      available: value.available,
    },
  };
}

export type PriceParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/** Parses the single PHP price input: required, finite and nonnegative. */
export function parseProductPrice(raw: string): PriceParseResult {
  const text = String(raw ?? '').trim();
  if (text === '') {
    return { ok: false, error: 'Price is required.' };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Enter a valid price in PHP.' };
  }
  if (value < 0) {
    return { ok: false, error: 'Price cannot be negative.' };
  }
  return { ok: true, value };
}
