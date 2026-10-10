import {
  CUSTOM_CATEGORY_VALUE,
  KNOWN_CATEGORIES,
  buildProductInput,
  hasLegacyTierPrices,
  parseProductPrice,
  productPrice,
  resolveCategory,
} from './product-form';

function validForm(overrides: Partial<Parameters<typeof buildProductInput>[0]> = {}) {
  return {
    name: 'House Latte',
    description: 'Creamy latte',
    category: 'Hot',
    customCategory: '',
    imageUrl: 'assets/products/hot/Americano.png',
    price: '119',
    sugarOptions: ['Regular', 'No Sugar'],
    available: true,
    ...overrides,
  };
}

describe('parseProductPrice', () => {
  it('accepts nonnegative prices', () => {
    expect(parseProductPrice('119')).toEqual({ ok: true, value: 119 });
    expect(parseProductPrice(' 119.50 ')).toEqual({ ok: true, value: 119.5 });
    expect(parseProductPrice('0')).toEqual({ ok: true, value: 0 });
  });

  it('rejects empty, non-numeric and negative prices', () => {
    expect(parseProductPrice('')).toEqual({
      ok: false,
      error: 'Price is required.',
    });
    expect(parseProductPrice('   ')).toEqual({
      ok: false,
      error: 'Price is required.',
    });
    expect(parseProductPrice('abc')).toEqual({
      ok: false,
      error: 'Enter a valid price in PHP.',
    });
    expect(parseProductPrice('NaN')).toEqual({
      ok: false,
      error: 'Enter a valid price in PHP.',
    });
    expect(parseProductPrice('-1')).toEqual({
      ok: false,
      error: 'Price cannot be negative.',
    });
    expect(parseProductPrice('-0.01')).toEqual({
      ok: false,
      error: 'Price cannot be negative.',
    });
  });
});

describe('buildProductInput', () => {
  it('builds a single-price payload', () => {
    const result = buildProductInput(validForm(), 'legacy-public-id');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input).toEqual({
      name: 'House Latte',
      description: 'Creamy latte',
      category: 'Hot',
      imageUrl: 'assets/products/hot/Americano.png',
      cloudinaryPublicId: 'legacy-public-id',
      price: 119,
      sugarOptions: ['Regular', 'No Sugar'],
      available: true,
    });
  });

  it('requires a name', () => {
    const result = buildProductInput(validForm({ name: '   ' }));
    expect(result).toEqual({ ok: false, error: 'Product name is required.' });
  });

  it('requires a category', () => {
    const result = buildProductInput(validForm({ category: '' }));
    expect(result).toEqual({ ok: false, error: 'Category is required.' });
  });

  it('requires a price and rejects negative values', () => {
    expect(buildProductInput(validForm({ price: '' }))).toEqual({
      ok: false,
      error: 'Price is required.',
    });
    expect(buildProductInput(validForm({ price: '-5' }))).toEqual({
      ok: false,
      error: 'Price cannot be negative.',
    });
  });

  it('requires at least one sugar option', () => {
    const result = buildProductInput(validForm({ sugarOptions: [] }));
    expect(result).toEqual({
      ok: false,
      error: 'Select at least one sugar option.',
    });
  });

  it('resolves the "Other" category from the custom input', () => {
    const result = buildProductInput(
      validForm({ category: CUSTOM_CATEGORY_VALUE, customCategory: '  Smoothies ' })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.category).toBe('Smoothies');
    }

    expect(
      buildProductInput(validForm({ category: CUSTOM_CATEGORY_VALUE, customCategory: '  ' }))
    ).toEqual({ ok: false, error: 'Enter a category name.' });
  });

  it('defaults cloudinaryPublicId when the product has none', () => {
    const result = buildProductInput(validForm());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.cloudinaryPublicId).toBe('');
    }
  });
});

describe('category helpers', () => {
  it('offers the known categories', () => {
    expect(KNOWN_CATEGORIES).toEqual(['Hot', 'Iced', 'Frappe']);
  });

  it('resolves selected and custom categories', () => {
    expect(resolveCategory('Iced', '')).toBe('Iced');
    expect(resolveCategory(CUSTOM_CATEGORY_VALUE, 'Tea')).toBe('Tea');
    expect(resolveCategory('  Hot  ', '')).toBe('Hot');
  });
});

describe('productPrice', () => {
  it('prefers the canonical price', () => {
    expect(productPrice({ price: 119, mediumPrice: 99 } as never)).toBe(119);
  });

  it('falls back to legacy size tiers', () => {
    expect(
      productPrice({ smallPrice: 99, mediumPrice: 119, largePrice: 139 } as never)
    ).toBe(119);
    expect(productPrice({ smallPrice: 99 } as never)).toBe(99);
  });

  it('returns null when no price exists', () => {
    expect(productPrice(null)).toBeNull();
    expect(productPrice({} as never)).toBeNull();
    expect(productPrice({ price: Number.NaN } as never)).toBeNull();
  });
});

describe('hasLegacyTierPrices', () => {
  it('detects differing size tiers', () => {
    expect(
      hasLegacyTierPrices({
        smallPrice: 99,
        mediumPrice: 119,
        largePrice: 139,
      } as never)
    ).toBe(true);
  });

  it('ignores products with a single flat price', () => {
    expect(
      hasLegacyTierPrices({ smallPrice: 119, mediumPrice: 119, largePrice: 119 } as never)
    ).toBe(false);
    expect(hasLegacyTierPrices({ price: 119 } as never)).toBe(false);
    expect(hasLegacyTierPrices(null)).toBe(false);
  });
});
