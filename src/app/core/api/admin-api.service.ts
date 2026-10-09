import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProductInput } from '@shared/models/product.model';
import { OrderStatus } from '@shared/models/order.model';
import { AuthService } from '@shared/services/auth.service';

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
   * Uploads a product image through the backend's local upload endpoint
   * (`POST /api/admin/uploads`, `multipart/form-data` with exactly one file
   * field named `file`) and resolves with the stored absolute `imageUrl`.
   *
   * The backend keeps the bytes on its own disk (development-only storage)
   * and returns just a URL, so the caller sends that URL with the product
   * write and Firestore stores the URL string — never image data. The
   * browser must not set `Content-Type` here: it has to include the
   * multipart boundary, which the runtime adds for a `FormData` body.
   */
  async uploadProductImage(file: File): Promise<{ imageUrl: string }> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.request<{ imageUrl: string }>('POST', '/admin/uploads', form);
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

  private async request<T>(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.auth.getIdToken();
    if (!token) {
      throw new AdminApiError('You must be signed in to do that.', 401);
    }

    try {
      return await firstValueFrom(
        this.http.request<T>(method, `${this.baseUrl}${path}`, {
          body,
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
