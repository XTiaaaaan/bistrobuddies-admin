import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '@shared/services/auth.service';
import { ContactMessage } from '@shared/models/contact-message.model';
import { AdminMessagesPage } from './admin-messages.page';

const listUrl = `${environment.apiBaseUrl}/admin/contact-messages`;
const statusUrl = (id: string) => `${listUrl}/${id}/status`;

/** Lets the awaited id-token lookup finish so the HTTP request is issued. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for the expected state.');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Waits until a request hit `url` with `method` and returns it. `match()` is
 * the only non-asserting lookup on the testing controller, and it consumes
 * the matched requests, so the result must be handed back to the caller.
 */
async function waitForRequest(
  httpMock: HttpTestingController,
  url: string,
  method = 'GET'
): Promise<TestRequest> {
  let found: TestRequest[] = [];
  await waitFor(() => {
    found = httpMock.match((req) => req.url === url && req.method === method);
    return found.length > 0;
  });
  return found[0];
}

function message(overrides: Partial<ContactMessage> = {}): ContactMessage {
  return {
    id: 'msg-1',
    name: 'Juan dela Cruz',
    email: 'juan@example.com',
    subject: 'Question about an order',
    message: 'Full message body from the customer.',
    status: 'NEW',
    createdAt: '2026-10-09T12:00:00.000Z',
    updatedAt: '2026-10-09T12:00:00.000Z',
    replies: [],
    ...overrides,
  };
}

function pageResponse(
  messages: ContactMessage[],
  overrides: Partial<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> = {}
) {
  return {
    messages,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 25,
    total: overrides.total ?? messages.length,
    totalPages: overrides.totalPages ?? 1,
  };
}

describe('AdminMessagesPage', () => {
  let page: AdminMessagesPage;
  let httpMock: HttpTestingController;

  const getIdToken = vi.fn();
  const toastCreate = vi.fn();
  const toastPresent = vi.fn();

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        AdminMessagesPage,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken } },
        { provide: ToastController, useValue: { create: toastCreate } },
      ],
    });
    page = TestBed.inject(AdminMessagesPage);
    httpMock = TestBed.inject(HttpTestingController);
  }

  /** Loads the first page and waits until the list is ready. */
  async function loadFirstPage(
    response: ReturnType<typeof pageResponse>
  ): Promise<void> {
    page.ngOnInit();
    const request = await waitForRequest(httpMock, listUrl);
    request.flush(response);
    await waitFor(() => page.loadStatus() === 'ready');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getIdToken.mockResolvedValue('test-id-token');
    toastPresent.mockResolvedValue(undefined);
    toastCreate.mockResolvedValue({ present: toastPresent });
    setup();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads messages on init with the Firebase ID token as a Bearer token', async () => {
    page.ngOnInit();

    const request = await waitForRequest(httpMock, listUrl);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );
    expect(request.request.params.has('status')).toBe(false);
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('25');

    request.flush(pageResponse([message()]));
    await waitFor(() => page.loadStatus() === 'ready');

    expect(page.messages()).toHaveLength(1);
    expect(page.total()).toBe(1);
    expect(page.errorMessage()).toBe('');
  });

  it('sends the status filter as a query parameter and resets to page 1', async () => {
    await loadFirstPage(
      pageResponse([message()], { page: 1, total: 30, totalPages: 2 })
    );

    page.page.set(2);
    const filtering = page.onStatusFilterChange('NEW');
    const filtered = await waitForRequest(httpMock, listUrl);
    expect(filtered.request.params.get('status')).toBe('NEW');
    expect(filtered.request.params.get('page')).toBe('1');

    filtered.flush(
      pageResponse([message({ id: 'msg-2', status: 'NEW' })])
    );
    await filtering;

    expect(page.statusFilter()).toBe('NEW');
    expect(page.page()).toBe(1);
    expect(page.loadStatus()).toBe('ready');
  });

  it('omits the status parameter for the All Messages filter', async () => {
    await loadFirstPage(pageResponse([message()]));

    const filteringResolved = page.onStatusFilterChange('RESOLVED');
    const resolved = await waitForRequest(httpMock, listUrl);
    expect(resolved.request.params.get('status')).toBe('RESOLVED');
    resolved.flush(pageResponse([]));
    await filteringResolved;

    const filteringAll = page.onStatusFilterChange('ALL');
    const all = await waitForRequest(httpMock, listUrl);
    expect(all.request.params.has('status')).toBe(false);
    all.flush(pageResponse([message()]));
    await filteringAll;

    expect(page.statusFilter()).toBe('ALL');
  });

  it('paginates with the server values and keeps the status filter', async () => {
    await loadFirstPage(
      pageResponse([message()], { page: 1, total: 30, totalPages: 2 })
    );

    const filtering = page.onStatusFilterChange('READ');
    const filtered = await waitForRequest(httpMock, listUrl);
    filtered.flush(
      pageResponse([message({ id: 'msg-2', status: 'READ' })], {
        page: 1,
        total: 30,
        totalPages: 2,
      })
    );
    await filtering;

    expect(page.canGoNext()).toBe(true);
    expect(page.canGoPrevious()).toBe(false);

    const goingNext = page.nextPage();
    const secondPage = await waitForRequest(httpMock, listUrl);
    expect(secondPage.request.params.get('page')).toBe('2');
    expect(secondPage.request.params.get('status')).toBe('READ');
    secondPage.flush(
      pageResponse([message({ id: 'msg-3', status: 'READ' })], {
        page: 2,
        total: 30,
        totalPages: 2,
      })
    );
    await goingNext;

    expect(page.page()).toBe(2);
    // Last page: Next is disabled, Previous is available.
    expect(page.canGoNext()).toBe(false);
    expect(page.canGoPrevious()).toBe(true);

    const goingBack = page.previousPage();
    const backToFirst = await waitForRequest(httpMock, listUrl);
    expect(backToFirst.request.params.get('page')).toBe('1');
    expect(backToFirst.request.params.get('status')).toBe('READ');
    backToFirst.flush(
      pageResponse([message({ id: 'msg-2', status: 'READ' })], {
        page: 1,
        total: 30,
        totalPages: 2,
      })
    );
    await goingBack;

    expect(page.page()).toBe(1);
  });

  it('does not request another page at the boundaries', async () => {
    await loadFirstPage(
      pageResponse([message()], { page: 1, total: 1, totalPages: 1 })
    );

    expect(page.canGoPrevious()).toBe(false);
    expect(page.canGoNext()).toBe(false);

    await page.previousPage();
    await page.nextPage();

    httpMock.expectNone(
      (req) => req.url === listUrl && req.method === 'GET'
    );
  });

  it('opens the detail view with the complete message text', async () => {
    const full = message({ message: 'A very long message '.repeat(50) });
    await loadFirstPage(pageResponse([full]));

    page.openMessage(page.messages()[0]);

    expect(page.selected()?.message).toBe(full.message);
    expect(page.selectedUpdates()).toEqual(['READ', 'RESOLVED']);

    page.closeDetail();
    expect(page.selected()).toBeNull();
  });

  it('marks a NEW message as Read only after the backend confirms', async () => {
    await loadFirstPage(pageResponse([message()]));

    const target = page.messages()[0];
    page.openMessage(target);
    const updating = page.updateStatus(target, 'READ');

    // Status stays NEW until the PATCH response arrives.
    await tick();
    expect(page.messages()[0].status).toBe('NEW');
    expect(page.selected()?.status).toBe('NEW');
    expect(page.isBusy(target)).toBe(true);

    const patch = await waitForRequest(httpMock, statusUrl('msg-1'), 'PATCH');
    expect(patch.request.body).toEqual({ status: 'READ' });
    expect(patch.request.headers.get('Authorization')).toBe(
      'Bearer test-id-token'
    );
    patch.flush({ id: 'msg-1', status: 'READ' });
    await updating;

    expect(page.messages()[0].status).toBe('READ');
    expect(page.selected()?.status).toBe('READ');
    expect(page.busyId()).toBeNull();
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Message marked as Read.',
        color: 'success',
      })
    );
  });

  it('marks a message as Resolved through the PATCH endpoint', async () => {
    await loadFirstPage(pageResponse([message({ status: 'READ' })]));

    const target = page.messages()[0];
    const updating = page.updateStatus(target, 'RESOLVED');
    const patch = await waitForRequest(httpMock, statusUrl('msg-1'), 'PATCH');
    expect(patch.request.body).toEqual({ status: 'RESOLVED' });
    patch.flush({ id: 'msg-1', status: 'RESOLVED' });
    await updating;

    expect(page.messages()[0].status).toBe('RESOLVED');
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Message marked as Resolved.',
        color: 'success',
      })
    );
  });

  it('keeps the current status and shows an error when the update fails', async () => {
    await loadFirstPage(pageResponse([message()]));

    const target = page.messages()[0];
    const updating = page.updateStatus(target, 'READ');
    const patch = await waitForRequest(httpMock, statusUrl('msg-1'), 'PATCH');
    patch.flush(
      { error: { code: 'invalid_request', message: 'Nope.' } },
      { status: 400, statusText: 'Bad Request' }
    );
    await updating;

    expect(page.messages()[0].status).toBe('NEW');
    expect(page.busyId()).toBeNull();
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger', message: 'Nope.' })
    );
    // The failure never reports success.
    expect(
      toastCreate.mock.calls.some(
        ([options]) => (options as { color?: string }).color === 'success'
      )
    ).toBe(false);
  });

  it('prevents duplicate status requests while one is in flight', async () => {
    await loadFirstPage(pageResponse([message()]));

    const target = page.messages()[0];
    const first = page.updateStatus(target, 'READ');
    const second = page.updateStatus(target, 'RESOLVED');

    const patch = await waitForRequest(httpMock, statusUrl('msg-1'), 'PATCH');
    patch.flush({ id: 'msg-1', status: 'READ' });
    await Promise.all([first, second]);

    // Only the first update reached the backend.
    httpMock.expectNone(
      (req) => req.method === 'PATCH' && req.url === statusUrl('msg-1')
    );
    expect(page.messages()[0].status).toBe('READ');
  });

  it('refuses an invalid transition without calling the API', async () => {
    await loadFirstPage(pageResponse([message({ status: 'RESOLVED' })]));

    const target = page.messages()[0];
    await page.updateStatus(target, 'READ');

    httpMock.expectNone(
      (req) => req.method === 'PATCH' && req.url === statusUrl('msg-1')
    );
    expect(page.messages()[0].status).toBe('RESOLVED');
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger' })
    );
  });

  it('shows an error state with retry when the list request fails', async () => {
    page.ngOnInit();
    const request = await waitForRequest(httpMock, listUrl);
    request.flush(
      { error: { code: 'server_error', message: 'Boom.' } },
      { status: 500, statusText: 'Server Error' }
    );
    await waitFor(() => page.loadStatus() === 'error');

    expect(page.errorMessage()).toBe('Boom.');

    // Retry issues a fresh request.
    void page.load();
    const retry = await waitForRequest(httpMock, listUrl);
    retry.flush(pageResponse([message()]));
    await waitFor(() => page.loadStatus() === 'ready');
    expect(page.messages()).toHaveLength(1);
  });

  it('shows a clear access-denied message for a 403 response', async () => {
    page.ngOnInit();
    const request = await waitForRequest(httpMock, listUrl);
    request.flush(
      {
        error: {
          code: 'forbidden',
          message: 'You are not allowed to perform this action.',
        },
      },
      { status: 403, statusText: 'Forbidden' }
    );
    await waitFor(() => page.loadStatus() === 'error');

    expect(page.errorMessage()).toMatch(/Access denied/i);
  });

  it('shows a session message for a 401 response', async () => {
    page.ngOnInit();
    const request = await waitForRequest(httpMock, listUrl);
    request.flush(
      {
        error: { code: 'unauthorized', message: 'Authentication is required.' },
      },
      { status: 401, statusText: 'Unauthorized' }
    );
    await waitFor(() => page.loadStatus() === 'error');

    expect(page.errorMessage()).toMatch(/sign in again/i);
  });

  it('does not call the API when nobody is signed in', async () => {
    getIdToken.mockResolvedValue(null);

    page.ngOnInit();
    await waitFor(() => page.loadStatus() === 'error');

    expect(page.errorMessage()).toMatch(/sign in again/i);
    await tick();
    httpMock.expectNone((req) => req.url === listUrl && req.method === 'GET');
  });

  it('handles an empty list as ready with no messages', async () => {
    await loadFirstPage(pageResponse([]));

    expect(page.messages()).toHaveLength(0);
    expect(page.total()).toBe(0);
    expect(page.loadStatus()).toBe('ready');
    expect(page.canGoNext()).toBe(false);
    expect(page.canGoPrevious()).toBe(false);
  });

  it('keeps the visible list when a refresh fails', async () => {
    await loadFirstPage(pageResponse([message()]));

    page.refresh();
    const failedRefresh = await waitForRequest(httpMock, listUrl);
    failedRefresh.flush(
      { error: { code: 'server_error', message: 'Boom.' } },
      { status: 500, statusText: 'Server Error' }
    );
    await waitFor(() => page.refreshing() === false);

    // The already-loaded messages stay on screen; the failure is a toast.
    expect(page.loadStatus()).toBe('ready');
    expect(page.messages()).toHaveLength(1);
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger' })
    );
  });

  describe('replying to a message', () => {
    const replyUrl = (id: string) => `${listUrl}/${id}/replies`;

    function replyResponse(overrides: Record<string, unknown> = {}) {
      return {
        id: 'msg-1',
        status: 'READ',
        reply: {
          id: 'reply-1',
          senderRole: 'ADMIN',
          reply: 'We shipped it today.',
          createdAt: '2026-10-09T13:00:00.000Z',
          ...overrides,
        },
      };
    }

    it('opens the reply composer with a clean draft', async () => {
      await loadFirstPage(pageResponse([message()]));

      page.openReply(page.messages()[0]);
      expect(page.selected()?.id).toBe('msg-1');
      expect(page.replyDraft()).toBe('');
      expect(page.replyError()).toBe('');
      expect(page.sendingReply()).toBe(false);

      page.closeDetail();
      expect(page.selected()).toBeNull();
      expect(page.replyDraft()).toBe('');
    });

    it('sends the reply and applies the backend-confirmed result', async () => {
      await loadFirstPage(pageResponse([message()]));

      const target = page.messages()[0];
      page.openReply(target);
      page.replyDraft.set('We shipped it today.');
      const sending = page.sendReply();

      // Nothing optimistic: the list keeps NEW with no replies until the
      // backend confirms.
      await tick();
      expect(page.messages()[0].status).toBe('NEW');
      expect(page.messages()[0].replies).toEqual([]);
      expect(page.sendingReply()).toBe(true);

      const request = await waitForRequest(
        httpMock,
        replyUrl('msg-1'),
        'POST'
      );
      expect(request.request.body).toEqual({ reply: 'We shipped it today.' });
      expect(request.request.headers.get('Authorization')).toBe(
        'Bearer test-id-token'
      );
      request.flush(replyResponse());
      await sending;

      expect(page.sendingReply()).toBe(false);
      expect(page.messages()[0].status).toBe('READ');
      expect(page.messages()[0].replies).toEqual([
        replyResponse().reply,
      ]);
      expect(page.selected()?.status).toBe('READ');
      expect(page.selected()?.replies).toEqual([replyResponse().reply]);
      expect(page.replyDraft()).toBe('');
      expect(page.replyError()).toBe('');
      expect(toastCreate).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'success' })
      );
    });

    it('preserves the draft and shows the error when sending fails', async () => {
      await loadFirstPage(pageResponse([message()]));

      page.openReply(page.messages()[0]);
      page.replyDraft.set('We shipped it today.');
      const sending = page.sendReply();

      const request = await waitForRequest(
        httpMock,
        replyUrl('msg-1'),
        'POST'
      );
      request.flush(
        { error: { code: 'server_error', message: 'Boom.' } },
        { status: 500, statusText: 'Server Error' }
      );
      await sending;

      // Failure never fakes a sent reply and never clears the draft.
      expect(page.messages()[0].replies).toEqual([]);
      expect(page.messages()[0].status).toBe('NEW');
      expect(page.replyDraft()).toBe('We shipped it today.');
      expect(page.replyError()).toBe('Boom.');
      expect(
        toastCreate.mock.calls.some(
          ([options]) => (options as { color?: string }).color === 'success'
        )
      ).toBe(false);
    });

    it('rejects an empty or whitespace-only draft without an API call', async () => {
      await loadFirstPage(pageResponse([message()]));
      page.openReply(page.messages()[0]);

      await page.sendReply();
      expect(page.replyError()).toContain('required');

      page.replyDraft.set('   ');
      await page.sendReply();
      expect(page.replyError()).toContain('required');

      await tick();
      httpMock.expectNone(
        (req) => req.method === 'POST' && req.url === replyUrl('msg-1')
      );
    });

    it('rejects an overly long draft without an API call', async () => {
      await loadFirstPage(pageResponse([message()]));
      page.openReply(page.messages()[0]);

      page.replyDraft.set('r'.repeat(5001));
      await page.sendReply();

      expect(page.replyError()).toContain('5000');
      httpMock.expectNone(
        (req) => req.method === 'POST' && req.url === replyUrl('msg-1')
      );
    });

    it('prevents duplicate submissions while a reply is in flight', async () => {
      await loadFirstPage(pageResponse([message()]));

      const target = page.messages()[0];
      page.openReply(target);
      page.replyDraft.set('First reply.');
      const first = page.sendReply();
      const second = page.sendReply();

      const request = await waitForRequest(
        httpMock,
        replyUrl('msg-1'),
        'POST'
      );
      request.flush(replyResponse());
      await Promise.all([first, second]);

      // Only the first reply reached the backend.
      httpMock.expectNone(
        (req) => req.method === 'POST' && req.url === replyUrl('msg-1')
      );
      expect(page.messages()[0].replies).toHaveLength(1);
    });

    it('shows stored replies for the selected message', async () => {
      const replied = message({
        status: 'READ',
        updatedAt: '2026-10-09T13:00:00.000Z',
        replies: [
          {
            id: 'reply-1',
            senderRole: 'ADMIN',
            reply: 'We shipped it today.',
            createdAt: '2026-10-09T13:00:00.000Z',
          },
        ],
      });
      await loadFirstPage(pageResponse([replied]));

      page.openReply(page.messages()[0]);

      expect(page.selected()?.replies).toHaveLength(1);
    });
  });
});
