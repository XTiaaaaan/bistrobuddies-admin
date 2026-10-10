import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '@shared/services/auth.service';
import { AdminApiError, AdminApiService } from './admin-api.service';

/** Lets the awaited id-token lookup finish so the HTTP request is issued. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AdminApiService', () => {
  let api: AdminApiService;
  let httpMock: HttpTestingController;
  const getIdToken = vi.fn();

  const statusUrl = (orderId: string) =>
    `${environment.apiBaseUrl}/admin/orders/${orderId}/status`;

  beforeEach(() => {
    getIdToken.mockResolvedValue('test-id-token');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken } },
      ],
    });
    api = TestBed.inject(AdminApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('changes order status through the authorized backend endpoint', async () => {
    const promise = api.updateOrderStatus('order-1', 'CONFIRMED');
    await tick();

    const request = httpMock.expectOne(statusUrl('order-1'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ orderStatus: 'CONFIRMED' });
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );

    request.flush({ id: 'order-1', orderStatus: 'CONFIRMED' });

    await expect(promise).resolves.toEqual({
      id: 'order-1',
      orderStatus: 'CONFIRMED',
    });
    expect(getIdToken).toHaveBeenCalled();
  });

  it('never sends payment status with a status transition', async () => {
    const promise = api.updateOrderStatus('order-2', 'CANCELLED');
    await tick();

    const request = httpMock.expectOne(statusUrl('order-2'));
    expect(request.request.body).toEqual({ orderStatus: 'CANCELLED' });
    expect(JSON.stringify(request.request.body)).not.toContain('payment');

    request.flush({ id: 'order-2', orderStatus: 'CANCELLED' });
    await promise;
  });

  it('surfaces an invalid transition reported by the backend', async () => {
    const promise = api.updateOrderStatus('order-3', 'COMPLETED');
    await tick();

    const request = httpMock.expectOne(statusUrl('order-3'));
    request.flush(
      {
        error: {
          code: 'invalid_status_transition',
          message: 'Cannot change order status from PENDING to COMPLETED.',
        },
      },
      { status: 400, statusText: 'Bad Request' }
    );

    await expect(promise).rejects.toMatchObject({
      name: 'AdminApiError',
      status: 400,
      message: 'Cannot change order status from PENDING to COMPLETED.',
    });
  });

  it('reports a rejected administrator session', async () => {
    const promise = api.updateOrderStatus('order-4', 'CONFIRMED');
    await tick();

    const request = httpMock.expectOne(statusUrl('order-4'));
    request.flush(
      { error: { code: 'forbidden', message: 'Admin only.' } },
      { status: 403, statusText: 'Forbidden' }
    );

    await expect(promise).rejects.toBeInstanceOf(AdminApiError);
    await expect(promise).rejects.toMatchObject({ status: 403 });
  });

  it('does not call the API when nobody is signed in', async () => {
    getIdToken.mockResolvedValue(null);

    await expect(api.updateOrderStatus('order-5', 'CONFIRMED')).rejects.toMatchObject(
      { name: 'AdminApiError', status: 401 }
    );
    await tick();
    httpMock.expectNone(statusUrl('order-5'));
  });

  it('patches products through the admin products endpoint', async () => {
    const promise = api.updateProduct('product-1', { available: false });
    await tick();

    const request = httpMock.expectOne(
      `${environment.apiBaseUrl}/admin/products/product-1`
    );
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ available: false });
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );

    request.flush({ id: 'product-1' });
    await expect(promise).resolves.toEqual({ id: 'product-1' });
  });

  it('creates a product carrying the three distinct size prices', async () => {
    const input = {
      name: 'House Latte',
      description: 'Creamy latte',
      category: 'Hot',
      imageUrl: 'http://localhost:3001/uploads/1-latte.png',
      cloudinaryPublicId: '',
      smallPrice: 100,
      mediumPrice: 120,
      largePrice: 150,
      price: 120,
      sugarOptions: ['Regular'],
      available: true,
    };
    const promise = api.createProduct(input);
    await tick();

    const request = httpMock.expectOne(`${environment.apiBaseUrl}/admin/products`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      imageUrl: 'http://localhost:3001/uploads/1-latte.png',
      smallPrice: 100,
      mediumPrice: 120,
      largePrice: 150,
      price: 120,
    });
    expect(request.request.body.smallPrice).not.toBe(request.request.body.largePrice);
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );

    request.flush({ id: 'new-product' });
    await expect(promise).resolves.toEqual({ id: 'new-product' });
  });

  it('patches a product with three distinct size prices', async () => {
    const promise = api.updateProduct('product-1', {
      smallPrice: 100,
      mediumPrice: 120,
      largePrice: 150,
      price: 120,
    });
    await tick();

    const request = httpMock.expectOne(
      `${environment.apiBaseUrl}/admin/products/product-1`
    );
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      smallPrice: 100,
      mediumPrice: 120,
      largePrice: 150,
      price: 120,
    });

    request.flush({ id: 'product-1' });
    await expect(promise).resolves.toEqual({ id: 'product-1' });
  });

  it('uploads product images as multipart form data to the upload endpoint', async () => {
    const file = new File(['image-bytes'], 'latte.png', { type: 'image/png' });
    const promise = api.uploadProductImage(file);
    await tick();

    const request = httpMock.expectOne(
      `${environment.apiBaseUrl}/admin/uploads`
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('file')).toBeInstanceOf(File);
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );

    request.flush({ imageUrl: 'http://localhost:3001/uploads/1-latte.png' });
    await expect(promise).resolves.toEqual({
      imageUrl: 'http://localhost:3001/uploads/1-latte.png',
    });
  });
});
