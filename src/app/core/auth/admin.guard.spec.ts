import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, UrlSegment, provideRouter } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AdminAccess, AdminSessionService } from './admin-session.service';

type MockFn = ReturnType<typeof vi.fn>;

describe('adminGuard', () => {
  const route = { path: 'products' } as Route;
  const segments = [{ path: 'products' }] as UrlSegment[];

  let session: {
    checkAdminAccess: MockFn;
    logout: MockFn;
  };

  const runGuard = () =>
    runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      adminGuard(route, segments, {} as never)
    );

  const configure = (access: AdminAccess) => {
    session = {
      checkAdminAccess: vi.fn().mockResolvedValue(access),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminSessionService, useValue: session },
      ],
    });
  };

  it('should allow administrators', async () => {
    configure('granted');

    await expect(runGuard()).resolves.toBe(true);
    expect(session.logout).not.toHaveBeenCalled();
  });

  it('should redirect signed-out visitors to the login page', async () => {
    configure('signed-out');

    const result = await runGuard();
    const router = TestBed.inject(Router);

    expect(router.serializeUrl(result as never)).toContain('/login');
    expect(session.logout).not.toHaveBeenCalled();
  });

  it('should deny customers and end their session', async () => {
    configure('denied');

    const result = await runGuard();
    const router = TestBed.inject(Router);

    expect(router.serializeUrl(result as never)).toContain('/login');
    expect(router.serializeUrl(result as never)).toContain('denied=1');
    expect(session.logout).toHaveBeenCalledTimes(1);
  });

  it('should deny access when the profile cannot be read', async () => {
    configure('error');

    const result = await runGuard();
    const router = TestBed.inject(Router);

    expect(router.serializeUrl(result as never)).toContain('/login');
    expect(session.logout).not.toHaveBeenCalled();
  });
});
