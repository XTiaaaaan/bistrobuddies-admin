import { Injectable, inject } from '@angular/core';
import { AdminApiService } from './admin-api.service';

/**
 * Image types the backend accepts. It re-checks them from the file's magic
 * bytes, so this list only drives the client-side pre-flight message.
 * (`../bistrobuddies-backend/docs/API_CONTRACT.md` §6)
 */
export const ACCEPTED_IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** Label used in validation messages. */
export const ACCEPTED_IMAGE_LABELS = 'JPEG, PNG, or WebP';

/** Mirrors the backend's default `UPLOAD_MAX_BYTES` (5 MB). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Image confirmed by the backend's Cloudinary upload endpoint.
 */
export interface UploadedProductImage {
  /** Absolute HTTPS Cloudinary `secure_url` to store as the product image. */
  imageUrl: string;
  /**
   * Cloudinary `public_id` to store as `cloudinaryPublicId`. Empty when the
   * backend response carries no identifier (e.g. a legacy local-disk shape),
   * in which case callers keep the product's existing identifier.
   */
  publicId: string;
}

/**
 * Image upload support for the product form.
 *
 * Files go to the backend's Cloudinary upload endpoint
 * (`POST {apiBaseUrl}/admin/uploads`, multipart field `file`, admin Bearer
 * token — `../bistrobuddies-backend/docs/API_CONTRACT.md` §6) through
 * {@link AdminApiService}, which shares the same token and error mapping as
 * the other admin writes. The backend holds the Cloudinary credentials
 * server-side and returns the HTTPS `secure_url` as `imageUrl` plus the
 * `publicId`; only those strings are sent with the product write, so
 * Firestore never receives image bytes or base64.
 *
 * Cloudinary is the permanent store — there is no Firebase Storage path and
 * no Cloudinary secret in browser code.
 */
@Injectable({ providedIn: 'root' })
export class ProductImageUploadService {
  private readonly api = inject(AdminApiService);

  /** The backend exposes the upload endpoint, so files can be sent. */
  readonly uploadSupported = true;

  /**
   * Client-side pre-flight check mirroring the backend's rules, so an
   * unusable file is rejected before any request is made. Returns a message
   * to show the admin, or `null` when the file may be uploaded. The backend
   * stays authoritative — its magic-byte check can still reject a file.
   */
  validate(file: File): string | null {
    if (file.size === 0) {
      return 'The selected image file is empty.';
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return 'The image is larger than the 5 MB upload limit.';
    }
    if (file.type && !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return `Only ${ACCEPTED_IMAGE_LABELS} images can be uploaded.`;
    }
    return null;
  }

  /**
   * Uploads `file` and resolves with the HTTPS `imageUrl` and Cloudinary
   * `publicId` that must be stored with the product. Rejects with an
   * `AdminApiError` when the backend refuses the upload (401/403/413/415/429/…),
   * so nothing is ever reported as uploaded unless the backend confirmed it.
   * Also rejects when the backend response carries no usable HTTPS URL, so a
   * product is never written with a stale or relative path from an upload.
   */
  async upload(file: File): Promise<UploadedProductImage> {
    const issue = this.validate(file);
    if (issue) {
      throw new Error(issue);
    }

    const response = await this.api.uploadProductImage(file);
    const url = typeof response?.imageUrl === 'string' ? response.imageUrl.trim() : '';
    if (!url) {
      throw new Error('The server did not return an image URL.');
    }
    if (!/^https:\/\//i.test(url)) {
      throw new Error('The server did not return a secure image URL.');
    }
    const rawPublicId =
      typeof response?.publicId === 'string' && response.publicId.trim()
        ? response.publicId.trim()
        : typeof response?.fileName === 'string' &&
            response.fileName.includes('/')
          ? response.fileName.trim()
          : '';
    return { imageUrl: url, publicId: rawPublicId };
  }
}
