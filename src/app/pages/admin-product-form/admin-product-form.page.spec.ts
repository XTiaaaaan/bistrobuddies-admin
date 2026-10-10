import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '@shared/services/auth.service';
import { ProductsService } from '@shared/services/products.service';
import { AdminProductFormPage } from './admin-product-form.page';

const uploadUrl = `${environment.apiBaseUrl}/admin/uploads`;
const createUrl = `${environment.apiBaseUrl}/admin/products`;
const patchUrl = `${environment.apiBaseUrl}/admin/products/p9`;
const imageUrl = 'http://localhost:3001/uploads/1760000000000-latte.png';

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for the expected state.');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Waits until at least one request hit `url` and returns it. `match()` is the
 * only non-asserting lookup on the testing controller, and it also consumes
 * the matched requests, so the result must be handed back to the caller.
 */
async function waitForRequest(
  httpMock: HttpTestingController,
  url: string
): Promise<TestRequest[]> {
  let found: TestRequest[] = [];
  await waitFor(() => {
    found = httpMock.match(url);
    return found.length > 0;
  });
  return found;
}

function selectionEvent(file: File | null): Event {
  return {
    target: {
      files: file ? [file] : [],
      value: file ? `C:\\fakepath\\${file.name}` : '',
    },
  } as unknown as Event;
}

function pngFile(name = 'latte.png'): File {
  return new File(['image-bytes'], name, { type: 'image/png' });
}

describe('AdminProductFormPage image upload', () => {
  let page: AdminProductFormPage;
  let httpMock: HttpTestingController;

  const getIdToken = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const navigate = vi.fn();
  const toastCreate = vi.fn();
  const toastPresent = vi.fn();
  const watchProducts = vi.fn();
  const getProduct = vi.fn();

  function setup(params: Record<string, string> = {}): void {
    TestBed.configureTestingModule({
      providers: [
        AdminProductFormPage,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken } },
        { provide: Router, useValue: { navigate } },
        { provide: ToastController, useValue: { create: toastCreate } },
        { provide: ProductsService, useValue: { watchProducts, getProduct } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap(params)) },
        },
      ],
    });
    page = TestBed.inject(AdminProductFormPage);
    httpMock = TestBed.inject(HttpTestingController);
    page.ngOnInit();
  }

  function fillValidForm(): void {
    page.name = 'House Latte';
    page.category = 'Hot';
    // Size prices are left at the standard defaults on purpose.
  }

  /** A product stored with the three canonical size prices. */
  function tieredProduct() {
    return {
      id: 'p9',
      name: 'Old Latte',
      description: '',
      category: 'Hot',
      imageUrl: 'http://localhost:3001/uploads/old.png',
      cloudinaryPublicId: 'legacy-id',
      price: 120,
      smallPrice: 100,
      mediumPrice: 120,
      largePrice: 150,
      sugarOptions: ['Regular'],
      available: true,
      createdAt: null,
      updatedAt: null,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getIdToken.mockResolvedValue('test-id-token');
    create.mockResolvedValue({ id: 'new-product' });
    update.mockResolvedValue({ id: 'p9' });
    navigate.mockResolvedValue(true);
    toastPresent.mockResolvedValue(undefined);
    toastCreate.mockResolvedValue({ present: toastPresent });
    watchProducts.mockReturnValue(of([]));
    getProduct.mockResolvedValue(null);
  });

  afterEach(() => {
    httpMock?.verify();
  });

  it('previews a selected image and uploads it through the backend endpoint', async () => {
    setup();
    const selection = page.onFileSelected(selectionEvent(pngFile()));

    await waitFor(() => page.imagePreview() !== null);
    expect(page.imagePreview()).toMatch(/^data:image\/png/);
    expect(page.uploading()).toBe(true);
    expect(page.uploadNotice()).toBe('');

    const [request] = await waitForRequest(httpMock, uploadUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('file')).toBeInstanceOf(File);
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );
    request.flush({ imageUrl });

    await selection;
    expect(page.imageUrl).toBe(imageUrl);
    expect(page.uploading()).toBe(false);
    expect(page.uploadNoticeError()).toBe(false);
    expect(page.uploadNotice()).toMatch(/Image uploaded/);
    // The upload alone never reports the product as saved.
    expect(toastCreate).not.toHaveBeenCalled();
  });

  it('uploads first, then saves the returned URL, and reports success only after both', async () => {
    setup();
    const selection = page.onFileSelected(selectionEvent(pngFile()));
    const [uploadRequest] = await waitForRequest(httpMock, uploadUrl);

    fillValidForm();
    const saving = page.save();

    // save() waits for the upload already in flight instead of sending it twice.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(httpMock.match(uploadUrl)).toHaveLength(0);
    expect(page.saving()).toBe(true);

    uploadRequest.flush({ imageUrl });
    await selection;

    const [createRequest] = await waitForRequest(httpMock, createUrl);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toMatchObject({
      name: 'House Latte',
      category: 'Hot',
      // Standard prices pre-filled for a new coffee product.
      smallPrice: 100,
      mediumPrice: 120,
      largePrice: 150,
      price: 120,
      imageUrl,
    });
    createRequest.flush({ id: 'new-product' });

    await saving;
    expect(page.saving()).toBe(false);
    expect(page.errorMessage()).toBe('');
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Product saved.', color: 'success' })
    );
    expect(toastPresent).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/products'], { replaceUrl: true });
  });

  it('does not report success when the image upload fails', async () => {
    setup();
    const selection = page.onFileSelected(selectionEvent(pngFile()));
    const [firstAttempt] = await waitForRequest(httpMock, uploadUrl);
    firstAttempt.flush(
      { error: { code: 'forbidden', message: 'Admin only.' } },
      { status: 403, statusText: 'Forbidden' }
    );
    await selection;

    expect(page.uploadNoticeError()).toBe(true);
    expect(page.uploadNotice()).toContain('Admin only.');
    expect(page.imageUrl).toBe('');

    fillValidForm();
    const saving = page.save();

    // The save retries the upload and aborts if it fails again.
    const [retry] = await waitForRequest(httpMock, uploadUrl);
    retry.flush(
      { error: { code: 'forbidden', message: 'Admin only.' } },
      { status: 403, statusText: 'Forbidden' }
    );
    await saving;

    expect(page.errorMessage()).toContain('Admin only.');
    expect(page.saving()).toBe(false);
    expect(page.uploadNoticeError()).toBe(true);
    expect(httpMock.match(createUrl)).toHaveLength(0);
    expect(toastCreate).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file before any request is sent', async () => {
    setup();
    await page.onFileSelected(
      selectionEvent(new File(['x'], 'menu.pdf', { type: 'application/pdf' }))
    );

    expect(page.imagePreview()).toBeNull();
    expect(page.uploadNoticeError()).toBe(true);
    expect(page.uploadNotice()).toMatch(/JPEG, PNG, or WebP/);
    httpMock.expectNone(uploadUrl);
  });

  it('shows a validation error and writes nothing when required fields are missing', async () => {
    setup();
    page.name = '   ';

    await page.save();

    expect(page.errorMessage()).toBe('Product name is required.');
    expect(page.saving()).toBe(false);
    httpMock.expectNone(createUrl);
    expect(toastCreate).not.toHaveBeenCalled();
  });

  it('starts a new product at the standard size prices', () => {
    setup();

    expect(page.smallPrice).toBe('100');
    expect(page.mediumPrice).toBe('120');
    expect(page.largePrice).toBe('150');
    expect(page.legacyFlatPrice()).toBeNull();
    expect(page.imageUrl).toBe('');
  });

  it('sends three distinct size prices on create', async () => {
    setup();
    fillValidForm();
    page.smallPrice = '95';
    page.mediumPrice = '110';
    page.largePrice = '135';

    const saving = page.save();
    const [createRequest] = await waitForRequest(httpMock, createUrl);
    const body = createRequest.request.body;

    expect(body).toMatchObject({
      smallPrice: 95,
      mediumPrice: 110,
      largePrice: 135,
      price: 110,
    });
    expect(body.smallPrice).not.toBe(body.mediumPrice);
    expect(body.mediumPrice).not.toBe(body.largePrice);
    // No image was chosen, so nothing is uploaded for this save.
    expect(httpMock.match(uploadUrl)).toHaveLength(0);

    createRequest.flush({ id: 'new-product' });
    await saving;
    expect(page.errorMessage()).toBe('');
  });

  it('requires every size price and writes nothing when one is missing', async () => {
    setup();
    fillValidForm();
    page.largePrice = '   ';

    await page.save();

    expect(page.errorMessage()).toBe('Large price is required.');
    expect(page.saving()).toBe(false);
    httpMock.expectNone(createUrl);
    expect(toastCreate).not.toHaveBeenCalled();
  });

  it('keeps the saved image and size prices when no replacement is chosen', async () => {
    getProduct.mockResolvedValue(tieredProduct());
    setup({ id: 'p9' });
    await waitFor(() => !page.loading());

    expect(page.name).toBe('Old Latte');
    expect(page.imageUrl).toBe('http://localhost:3001/uploads/old.png');
    expect(page.imageSelected()).toBe(false);
    expect(page.legacyFlatPrice()).toBeNull();
    expect(page.smallPrice).toBe('100');
    expect(page.mediumPrice).toBe('120');
    expect(page.largePrice).toBe('150');

    page.description = 'Now with oat milk';
    const saving = page.save();

    const [patchRequest] = await waitForRequest(httpMock, patchUrl);
    expect(patchRequest.request.method).toBe('PATCH');
    expect(patchRequest.request.body).toMatchObject({
      description: 'Now with oat milk',
      imageUrl: 'http://localhost:3001/uploads/old.png',
      smallPrice: 100,
      mediumPrice: 120,
      largePrice: 150,
      price: 120,
      cloudinaryPublicId: 'legacy-id',
    });
    patchRequest.flush({ id: 'p9' });

    await saving;
    expect(page.errorMessage()).toBe('');
    // The existing image is never re-uploaded or overwritten.
    httpMock.expectNone(uploadUrl);
    expect(page.uploadNotice()).toBe('');
  });

  it('uploads a replacement image and saves it with the three size prices', async () => {
    getProduct.mockResolvedValue(tieredProduct());
    setup({ id: 'p9' });
    await waitFor(() => !page.loading());

    const selection = page.onFileSelected(selectionEvent(pngFile('new.png')));
    const [uploadRequest] = await waitForRequest(httpMock, uploadUrl);
    expect(uploadRequest.request.method).toBe('POST');
    expect((uploadRequest.request.body as FormData).get('file')).toBeInstanceOf(File);
    uploadRequest.flush({ imageUrl });
    await selection;
    expect(page.imageUrl).toBe(imageUrl);
    expect(page.imageSelected()).toBe(true);

    page.smallPrice = '105';
    page.mediumPrice = '125';
    page.largePrice = '155';
    const saving = page.save();

    const [patchRequest] = await waitForRequest(httpMock, patchUrl);
    expect(patchRequest.request.body).toMatchObject({
      imageUrl,
      smallPrice: 105,
      mediumPrice: 125,
      largePrice: 155,
      price: 125,
      cloudinaryPublicId: 'legacy-id',
    });
    patchRequest.flush({ id: 'p9' });

    await saving;
    expect(page.errorMessage()).toBe('');
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Product saved.' })
    );
    expect(httpMock.match(createUrl)).toHaveLength(0);
  });

  it('handles a legacy product with only a flat price deliberately', async () => {
    getProduct.mockResolvedValue({
      ...tieredProduct(),
      price: 95,
      smallPrice: undefined,
      mediumPrice: undefined,
      largePrice: undefined,
    });
    setup({ id: 'p9' });
    await waitFor(() => !page.loading());

    // The product has no size tiers, so the form says so instead of
    // pretending it already has three distinct prices.
    expect(page.legacyFlatPrice()).toBe(95);
    expect(page.smallPrice).toBe('95');
    expect(page.mediumPrice).toBe('95');
    expect(page.largePrice).toBe('95');

    // The admin puts the product on the standard size prices.
    page.smallPrice = '100';
    page.mediumPrice = '120';
    page.largePrice = '150';
    const saving = page.save();

    const [patchRequest] = await waitForRequest(httpMock, patchUrl);
    expect(patchRequest.request.body).toMatchObject({
      imageUrl: 'http://localhost:3001/uploads/old.png',
      smallPrice: 100,
      mediumPrice: 120,
      largePrice: 150,
      price: 120,
    });
    patchRequest.flush({ id: 'p9' });

    await saving;
    expect(page.errorMessage()).toBe('');
    httpMock.expectNone(uploadUrl);
  });
});
