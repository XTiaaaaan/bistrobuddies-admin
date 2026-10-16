import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProductInput } from '@shared/models/product.model';
import { OrderStatus } from '@shared/models/order.model';
import {
  ContactMessageListResponse,
  ContactMessageStatus,
  ContactMessageStatusUpdate,
  ContactMessageStatusUpdateResponse,
} from '@shared/models/contact-message.model';
import { AuthService } from '@shared/services/auth.service';

/** Response from `POST /api/admin/uploads` (Cloudinary storage, §6). */
export interface UploadProductImageResponse {
  /** Absolute HTTPS Cloudinary `secure_url` to store as `products/{id}.imageUrl`. */
  imageUrl: string;
  /** Cloudinary `public_id` (also echoed as `fileName`); stored as `cloudinaryPublicId`. */
  publicId?: string;
  /** Backwards-compatible alias of `publicId` from the upload endpoint. */
  fileName?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: string;
}

/** Error raised for backend admin API failures, with the backend status code. */
export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

/**
 * Talks to the BistroBuddies backend for privileged operations (product
 * create/update/delete and order status transitions). The backend verifies
 * the Firebase ID token and confirms the signer's administrator role
 * server-side on every request; the frontend never decides authorization by
 * itself and never writes order or payment status directly.
 *
 * Product/order reads keep using the Firestore client SDK (secured by
 * Firestore security rules).
 */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = environment.apiBaseUrl;

  async createProduct(input: ProductInput): Promise<{ id: string }> {
    return this.request<{ id: string }>('POST', '/admin/products', input);
  }

  async updateProduct(
    productId: string,
    patch: Partial<ProductInput>
  ): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      'PATCH',
      `/admin/products/${encodeURIComponent(productId)}`,
      patch
    );
  }

  async deleteProduct(productId: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      'DELETE',
      `/admin/products/${encodeURIComponent(productId)}`
    );
  }

  /**
   * Uploads a product image through the backend's Cloudinary upload endpoint
   * (`POST /api/admin/uploads`, `multipart/form-data` with exactly one file
   * field named `file`) and resolves with the stored HTTPS `imageUrl` plus
   * the Cloudinary `publicId`.
   *
   * The backend keeps the credentials (`CLOUDINARY_*`) server-side and
   * uploads with the Cloudinary SDK — the browser only sends the admin
   * Bearer token and the file bytes, and receives back the HTTPS
   * `secure_url` (`imageUrl`) with `publicId`/`fileName`. The caller sends
   * that URL (and `publicId` as `cloudinaryPublicId`) with the product
   * write; Firestore stores those strings — never image data. The browser
   * must not set `Content-Type` here: it has to include the multipart
   * boundary, which the runtime adds for a `FormData` body.
   */
  async uploadProductImage(file: File): Promise<UploadProductImageResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.request<UploadProductImageResponse>('POST', '/admin/uploads', form);
  }

  /**
   * Transitions an order's status through the backend's authorized endpoint
   * (`POST /api/admin/orders/:id/status`, admin only).
   *
   * This is the **only** way order status changes in this app: the backend
   * validates the transition against its status graph and re-checks the
   * caller's administrator role server-side. Payment status is backend-owned
   * and is never sent from here.
   */
  async updateOrderStatus(
    orderId: string,
    orderStatus: OrderStatus
  ): Promise<{ id: string; orderStatus: OrderStatus }> {
    return this.request<{ id: string; orderStatus: OrderStatus }>(
      'POST',
      `/admin/orders/${encodeURIComponent(orderId)}/status`,
      { orderStatus }
    );
  }

  /**
   * Lists customer "Contact Us" messages through the backend's admin
   * endpoint (`GET /api/admin/contact-messages`, admin only), newest first.
   *
   * The messages collection is private: clients have no Firestore access to
   * it, so this HTTP endpoint is the only way the admin site reads it. The
   * backend strips `userId` from every row — only the submission fields and
   * the workflow status reach the browser.
   */
  async listContactMessages(
    query: {
      status?: ContactMessageStatus;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<ContactMessageListResponse> {
    const params: Record<string, string> = {};
    if (query.status) {
      params['status'] = query.status;
    }
    if (query.page !== undefined) {
      params['page'] = String(query.page);
    }
    if (query.pageSize !== undefined) {
      params['pageSize'] = String(query.pageSize);
    }
    return this.request<ContactMessageListResponse>(
      'GET',
      '/admin/contact-messages',
      undefined,
      Object.keys(params).length > 0 ? params : undefined
    );
  }

  /**
   * Changes a contact message's workflow status through the backend's
   * authorized endpoint (`PATCH /api/admin/contact-messages/:id/status`,
   * admin only). Only `READ` and `RESOLVED` are accepted; `NEW` is the
   * server-assigned initial status and can never be re-applied.
   */
  async updateContactMessageStatus(
    messageId: string,
    status: ContactMessageStatusUpdate
  ): Promise<ContactMessageStatusUpdateResponse> {
    return this.request<ContactMessageStatusUpdateResponse>(
      'PATCH',
      `/admin/contact-messages/${encodeURIComponent(messageId)}/status`,
      { status }
    );
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<T> {
    const token = await this.auth.getIdToken();
    if (!token) {
      throw new AdminApiError('You must be signed in to do that.', 401);
    }

    try {
      return await firstValueFrom(
        this.http.request<T>(method, `${this.baseUrl}${path}`, {
          body,
          params,
          headers: { Authorization: `Bearer ${token}` },
        })
      );
    } catch (error) {
      throw toAdminApiError(error);
    }
  }
}

function toAdminApiError(error: unknown): AdminApiError {
  if (error instanceof AdminApiError) {
    return error;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return new AdminApiError(
        'Could not reach the BistroBuddies server. Is the backend running?',
        0
      );
    }
    const serverMessage = extractServerMessage(error);
    if (error.status === 401 || error.status === 403) {
      return new AdminApiError(
        serverMessage ??
          'Your administrator session could not be verified. Please sign in again.',
        error.status
      );
    }
    return new AdminApiError(
      serverMessage ?? `The server rejected the request (${error.status}).`,
      error.status
    );
  }
  return new AdminApiError('Unexpected error. Please try again.', 0);
}

function extractServerMessage(error: HttpErrorResponse): string | null {
  const body = error.error as { error?: { message?: unknown } } | null;
  const message = body?.error?.message;
  return typeof message === 'string' && message.trim() ? message : null;
}
