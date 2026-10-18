import { environment } from '../../../environments/environment';

/**
 * Resolves a stored product `imageUrl` into an `<img src>` value.
 *
 * - Absolute `https://` Cloudinary URLs (the current upload shape) and any
 *   other absolute `http(s)://` URL are returned untouched — the backend
 *   origin is never prepended to them.
 * - Legacy backend-relative `/uploads/...` paths are resolved against the
 *   backend origin derived from `apiBaseUrl` (which ends in `/api`), so
 *   products uploaded before the Cloudinary move keep rendering.
 * - In-memory `data:`/`blob:` previews pass through untouched.
 * - Bundled `assets/...` paths and other relative values pass through for
 *   the app to resolve; empty values resolve to `''`.
 */
export function resolveProductImageSrc(
  imageUrl: string | null | undefined
): string {
  if (imageUrl === null || imageUrl === undefined) {
    return '';
  }
  const url = String(imageUrl).trim();
  if (!url) {
    return '';
  }
  if (/^(https?:\/\/|data:|blob:)/i.test(url)) {
    return url;
  }
  if (url.startsWith('/uploads/')) {
    const origin = environment.apiBaseUrl.replace(/\/api\/?$/, '');
    return `${origin}${url}`;
  }
  return url;
}
