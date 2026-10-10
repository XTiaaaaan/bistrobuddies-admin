import { Product, ProductInput } from '@shared/models/product.model';

/** Categories offered by the product form dropdown. */
export const KNOWN_CATEGORIES = ['Hot', 'Iced', 'Frappe'];

/** Sentinel value that reveals the free-text category input. */
export const CUSTOM_CATEGORY_VALUE = '__other__';

/** Standard PHP prices every new coffee product starts with. */
export const STANDARD_SIZE_PRICES = {
  small: 100,
  medium: 120,
  large: 150,
} as const;

/**
 * Canonical PHP price for a product document.
 *
 * Prefers the derived `price` field and falls back to the size tiers of
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
 * True when a document carries size tiers that differ from one another
 * (tiered pricing rather than a single flat amount).
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

/** A stored size price, or null when the document has no usable value. */
function storedSizePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** Size prices as they should appear in the edit form. */
export interface EditSizePrices {
  small: string;
  medium: string;
  large: string;
  /**
   * The stored flat price when the product has no size tiers of its own —
   * otherwise null. A product saved with one price does not have three
   * distinct size prices, and the form must say so instead of pretending.
   */
  legacyFlatPrice: number | null;
}

/**
 * Loads the price fields for the edit form.
 *
 * Products that already carry size tiers keep them (a missing tier falls
 * back to the flat price so no stored amount is silently dropped). A legacy
 * document with only a flat `price` is pre-filled with that amount for every
 * size and flagged through {@link EditSizePrices.legacyFlatPrice}, so the
 * admin can see it is flat pricing and give each size its own price.
 */
export function sizePricesForEdit(
  product: Partial<Product> | null | undefined
): EditSizePrices {
  const small = storedSizePrice(product?.smallPrice);
  const medium = storedSizePrice(product?.mediumPrice);
  const large = storedSizePrice(product?.largePrice);
  const flat = productPrice(product);

  if (small === null && medium === null && large === null) {
    const text = flat !== null ? String(flat) : '';
    return { small: text, medium: text, large: text, legacyFlatPrice: flat };
  }

  const text = (value: number | null): string =>
    value !== null
      ? String(value)
      : flat !== null
        ? String(flat)
        : '';
  return {
    small: text(small),
    medium: text(medium),
    large: text(large),
    legacyFlatPrice: null,
  };
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
  /** Raw Small/Medium/Large price inputs in PHP. */
  smallPrice: string;
  mediumPrice: string;
  largePrice: string;
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
 *
 * All three size prices are always sent so distinct amounts are stored
 * exactly as entered — the payload never collapses them into one number.
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

  const smallPrice = parseProductPrice(value.smallPrice, 'Small price');
  if (!smallPrice.ok) {
    return { ok: false, error: smallPrice.error };
  }
  const mediumPrice = parseProductPrice(value.mediumPrice, 'Medium price');
  if (!mediumPrice.ok) {
    return { ok: false, error: mediumPrice.error };
  }
  const largePrice = parseProductPrice(value.largePrice, 'Large price');
  if (!largePrice.ok) {
    return { ok: false, error: largePrice.error };
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
      // Canonical size prices — sent as entered, so 100/120/150 stay distinct.
      smallPrice: smallPrice.value,
      mediumPrice: mediumPrice.value,
      largePrice: largePrice.value,
      // Legacy flat field: mirrors the medium tier, the value the backend
      // re-derives from the size tiers. The server ignores it for tier values,
      // so it can never flatten them (docs/API_CONTRACT.md §Write payloads).
      price: mediumPrice.value,
      sugarOptions: [...value.sugarOptions],
      available: value.available,
    },
  };
}

export type PriceParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Parses a PHP price input: required, finite and nonnegative. `label` names
 * the field in the error message (e.g. `Small price`).
 */
export function parseProductPrice(
  raw: string,
  label = 'Price'
): PriceParseResult {
  const text = String(raw ?? '').trim();
  if (text === '') {
    return { ok: false, error: `${label} is required.` };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `Enter a valid ${label.toLowerCase()} in PHP.` };
  }
  if (value < 0) {
    return { ok: false, error: `${label} cannot be negative.` };
  }
  return { ok: true, value };
}
