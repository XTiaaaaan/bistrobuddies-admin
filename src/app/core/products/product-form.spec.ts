import {
  CUSTOM_CATEGORY_VALUE,
  KNOWN_CATEGORIES,
  STANDARD_SIZE_PRICES,
  buildProductInput,
  hasLegacyTierPrices,
  parseProductPrice,
  productPrice,
  resolveCategory,
  sizePricesForEdit,
} from './product-form';

function validForm(overrides: Partial<Parameters<typeof buildProductInput>[0]> = {}) {
  return {
    name: 'House Latte',
    description: 'Creamy latte',
    category: 'Hot',
    customCategory: '',
    imageUrl: 'assets/products/hot/Americano.png',
    smallPrice: '100',
    mediumPrice: '120',
    largePrice: '150',
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

  it('rejects empty, non-numeric and negative values', () => {
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

  it('names the field in the message when a label is given', () => {
    expect(parseProductPrice('', 'Small price')).toEqual({
      ok: false,
      error: 'Small price is required.',
    });
    expect(parseProductPrice('abc', 'Medium price')).toEqual({
      ok: false,
      error: 'Enter a valid medium price in PHP.',
    });
    expect(parseProductPrice('-1', 'Large price')).toEqual({
      ok: false,
      error: 'Large price cannot be negative.',
    });
    expect(parseProductPrice('150', 'Large price')).toEqual({
      ok: true,
      value: 150,
    });
  });
});

describe('STANDARD_SIZE_PRICES', () => {
  it('are the standard coffee prices', () => {
    expect(STANDARD_SIZE_PRICES).toEqual({ small: 100, medium: 120, large: 150 });
  });
});

describe('buildProductInput', () => {
  it('builds a payload with three distinct size prices', () => {
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
      smallPrice: 100,
      mediumPrice: 120,
      largePrice: 150,
      // The legacy flat field mirrors the medium tier (the backend's
      // re-derivation order), so it can never flatten the size prices.
      price: 120,
      sugarOptions: ['Regular', 'No Sugar'],
      available: true,
    });
    expect(result.input.smallPrice).not.toBe(result.input.mediumPrice);
    expect(result.input.mediumPrice).not.toBe(result.input.largePrice);
  });

  it('never collapses the three sizes into a single flat price', () => {
    const result = buildProductInput(
      validForm({ smallPrice: '95', mediumPrice: '110', largePrice: '135' })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input.smallPrice).toBe(95);
    expect(result.input.mediumPrice).toBe(110);
    expect(result.input.largePrice).toBe(135);
    expect(result.input.price).toBe(110);
  });

  it('requires a name', () => {
    const result = buildProductInput(validForm({ name: '   ' }));
    expect(result).toEqual({ ok: false, error: 'Product name is required.' });
  });

  it('requires a category', () => {
    const result = buildProductInput(validForm({ category: '' }));
    expect(result).toEqual({ ok: false, error: 'Category is required.' });
  });

  it('requires every size price and rejects negative values', () => {
    expect(buildProductInput(validForm({ smallPrice: '' }))).toEqual({
      ok: false,
      error: 'Small price is required.',
    });
    expect(buildProductInput(validForm({ mediumPrice: '   ' }))).toEqual({
      ok: false,
      error: 'Medium price is required.',
    });
    expect(buildProductInput(validForm({ largePrice: '' }))).toEqual({
      ok: false,
      error: 'Large price is required.',
    });
    expect(buildProductInput(validForm({ mediumPrice: '-5' }))).toEqual({
      ok: false,
      error: 'Medium price cannot be negative.',
    });
    expect(buildProductInput(validForm({ largePrice: 'abc' }))).toEqual({
      ok: false,
      error: 'Enter a valid large price in PHP.',
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

describe('sizePricesForEdit', () => {
  it('loads the three saved size prices without flagging legacy pricing', () => {
    expect(
      sizePricesForEdit({
        smallPrice: 100,
        mediumPrice: 120,
        largePrice: 150,
        price: 120,
      } as never)
    ).toEqual({ small: '100', medium: '120', large: '150', legacyFlatPrice: null });
  });

  it('flags a product that only has a legacy flat price', () => {
    expect(sizePricesForEdit({ price: 95 } as never)).toEqual({
      small: '95',
      medium: '95',
      large: '95',
      legacyFlatPrice: 95,
    });
    // It must not pretend the product already has distinct prices.
    expect(sizePricesForEdit({ price: 95 } as never).legacyFlatPrice).not.toBeNull();
  });

  it('returns empty fields for a product with no price at all', () => {
    expect(sizePricesForEdit({} as never)).toEqual({
      small: '',
      medium: '',
      large: '',
      legacyFlatPrice: null,
    });
    expect(sizePricesForEdit(null)).toEqual({
      small: '',
      medium: '',
      large: '',
      legacyFlatPrice: null,
    });
  });

  it('keeps stored tiers when only some sizes are present', () => {
    expect(
      sizePricesForEdit({ smallPrice: 100, mediumPrice: 120 } as never)
    ).toEqual({ small: '100', medium: '120', large: '120', legacyFlatPrice: null });
  });
});
