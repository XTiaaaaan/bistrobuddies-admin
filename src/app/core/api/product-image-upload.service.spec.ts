import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '@shared/services/auth.service';
import { AdminApiError } from './admin-api.service';
import {
  MAX_IMAGE_BYTES,
  ProductImageUploadService,
} from './product-image-upload.service';

/** Lets the awaited id-token lookup finish so the HTTP request is issued. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function pngFile(name = 'latte.png'): File {
  return new File(['image-bytes'], name, { type: 'image/png' });
}

describe('ProductImageUploadService', () => {
  let upload: ProductImageUploadService;
  let httpMock: HttpTestingController;
  const getIdToken = vi.fn();
  const uploadUrl = `${environment.apiBaseUrl}/admin/uploads`;

  beforeEach(() => {
    getIdToken.mockResolvedValue('test-id-token');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken } },
      ],
    });
    upload = TestBed.inject(ProductImageUploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('POSTs the file as multipart field "file" with the admin bearer token', async () => {
    const file = pngFile();
    const promise = upload.upload(file);
    await tick();

    const request = httpMock.expectOne(uploadUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);

    const form = request.request.body as FormData;
    const sent = form.get('file');
    expect(form.getAll('file')).toHaveLength(1);
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe('latte.png');
    expect((sent as File).size).toBe(file.size);

    // Only the bearer token is set by the app: the multipart boundary must
    // come from the runtime, so Content-Type is left untouched.
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );
    expect(request.request.headers.get('Content-Type')).toBeNull();

    request.flush({
      imageUrl: 'http://localhost:3001/uploads/1-latte.png',
      path: '/uploads/1-latte.png',
      fileName: '1-latte.png',
      mimeType: 'image/png',
      size: file.size,
    });

    await expect(promise).resolves.toBe(
      'http://localhost:3001/uploads/1-latte.png'
    );
  });

  it('surfaces backend upload failures with their status', async () => {
    const promise = upload.upload(pngFile());
    await tick();

    httpMock.expectOne(uploadUrl).flush(
      {
        error: {
          code: 'unsupported_media_type',
          message: 'Unsupported image type.',
        },
      },
      { status: 415, statusText: 'Unsupported Media Type' }
    );

    await expect(promise).rejects.toBeInstanceOf(AdminApiError);
    await expect(promise).rejects.toMatchObject({
      status: 415,
      message: 'Unsupported image type.',
    });
  });

  it('reports an unreachable backend instead of claiming success', async () => {
    const promise = upload.upload(pngFile());
    await tick();

    httpMock.expectOne(uploadUrl).error(new ProgressEvent('error'));

    await expect(promise).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach the BistroBuddies server. Is the backend running?',
    });
  });

  it('rejects files the backend would refuse before sending anything', async () => {
    expect(upload.validate(new File(['x'], 'menu.pdf', { type: 'application/pdf' }))).toMatch(
      /JPEG, PNG, or WebP/
    );
    expect(upload.validate(new File([], 'empty.png', { type: 'image/png' }))).toMatch(/empty/);
    expect(
      upload.validate(
        new File([new ArrayBuffer(MAX_IMAGE_BYTES + 1)], 'huge.png', { type: 'image/png' })
      )
    ).toMatch(/5 MB/);
    expect(upload.validate(new File(['x'], 'latte.jpg', { type: 'image/jpeg' }))).toBeNull();
    expect(upload.validate(new File(['x'], 'latte.webp', { type: 'image/webp' }))).toBeNull();

    const oversized = new File([new ArrayBuffer(MAX_IMAGE_BYTES + 1)], 'huge.png', {
      type: 'image/png',
    });
    await expect(upload.upload(oversized)).rejects.toThrow(/5 MB/);
    httpMock.expectNone(uploadUrl);
  });

  it('requires the endpoint to return an imageUrl', async () => {
    const promise = upload.upload(pngFile());
    await tick();

    httpMock.expectOne(uploadUrl).flush({ path: '/uploads/1.png' });

    await expect(promise).rejects.toThrow(/image URL/);
  });
});
