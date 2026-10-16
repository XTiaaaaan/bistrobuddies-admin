import { environment } from '../../../environments/environment';
import { resolveProductImageSrc } from './product-image';

const cloudinaryUrl =
  'https://res.cloudinary.com/test-cloud/image/upload/v1/bistrobuddies/latte-abc123';

describe('resolveProductImageSrc', () => {
  it('returns absolute HTTPS Cloudinary URLs untouched', () => {
    expect(resolveProductImageSrc(cloudinaryUrl)).toBe(cloudinaryUrl);
  });

  it('never prepends the backend URL to absolute URLs', () => {
    expect(resolveProductImageSrc(cloudinaryUrl)).not.toContain(
      environment.apiBaseUrl
    );
    expect(resolveProductImageSrc(cloudinaryUrl.startsWith('https://') ? cloudinaryUrl : '')).toBe(
      cloudinaryUrl
    );
    const legacyAbsolute = 'http://localhost:3001/uploads/old.png';
    expect(resolveProductImageSrc(legacyAbsolute)).toBe(legacyAbsolute);
  });

  it('resolves legacy backend-relative /uploads paths against the backend origin', () => {
    const origin = environment.apiBaseUrl.replace(/\/api\/?$/, '');
    expect(resolveProductImageSrc('/uploads/old.png')).toBe(
      `${origin}/uploads/old.png`
    );
  });

  it('passes data/blob previews and bundled asset paths through', () => {
    expect(resolveProductImageSrc('data:image/png;base64,abc')).toBe(
      'data:image/png;base64,abc'
    );
    expect(resolveProductImageSrc('assets/products/hot/Americano.png')).toBe(
      'assets/products/hot/Americano.png'
    );
  });

  it('returns empty string for missing values', () => {
    expect(resolveProductImageSrc('')).toBe('');
    expect(resolveProductImageSrc('   ')).toBe('');
    expect(resolveProductImageSrc(null)).toBe('');
    expect(resolveProductImageSrc(undefined)).toBe('');
  });
});
