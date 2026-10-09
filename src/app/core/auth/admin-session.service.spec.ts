import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { AuthService } from '@shared/services/auth.service';
import { UsersService } from '@shared/services/users.service';
import {
  AdminAccessDeniedError,
  AdminSessionService,
} from './admin-session.service';

type MockFn = ReturnType<typeof vi.fn>;

describe('AdminSessionService', () => {
  let auth: {
    user$: Observable<unknown>;
    isAuthenticated$: Observable<boolean>;
    login: MockFn;
    logout: MockFn;
  };
  let users: {
    getUser: MockFn;
    watchUser: MockFn;
  };

  const configure = (user: unknown, profile: unknown) => {
    auth = {
      user$: of(user),
      isAuthenticated$: of(user !== null),
      login: vi.fn().mockResolvedValue({}),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    users = {
      getUser: vi.fn().mockResolvedValue(profile),
      watchUser: vi.fn().mockReturnValue(of(null)),
    };

    TestBed.configureTestingModule({
      providers: [
        AdminSessionService,
        { provide: AuthService, useValue: auth },
        { provide: UsersService, useValue: users },
      ],
    });

    return TestBed.inject(AdminSessionService);
  };

  it('should grant access when the profile role is admin', async () => {
    const session = configure({ uid: 'admin-1' }, { role: 'admin' });

    await expect(session.checkAdminAccess()).resolves.toBe('granted');
  });

  it('should deny customers', async () => {
    const session = configure({ uid: 'customer-1' }, { role: 'customer' });

    await expect(session.checkAdminAccess()).resolves.toBe('denied');
  });

  it('should deny profiles without a role', async () => {
    const session = configure({ uid: 'someone' }, {});

    await expect(session.checkAdminAccess()).resolves.toBe('denied');
  });

  it('should report signed-out visitors', async () => {
    const session = configure(null, null);

    await expect(session.checkAdminAccess()).resolves.toBe('signed-out');
  });

  it('should fail closed when the profile cannot be read', async () => {
    const session = configure({ uid: 'admin-1' }, null);
    users.getUser.mockRejectedValue(new Error('offline'));

    await expect(session.checkAdminAccess()).resolves.toBe('error');
  });

  it('should keep the session after an admin login', async () => {
    const session = configure({ uid: 'admin-1' }, { role: 'admin' });

    await expect(
      session.loginAsAdmin('admin@example.com', 'secret')
    ).resolves.toBeUndefined();
    expect(auth.login).toHaveBeenCalledWith(
      'admin@example.com',
      'secret',
      undefined
    );
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('should sign out and reject when a customer logs in', async () => {
    const session = configure({ uid: 'customer-1' }, { role: 'customer' });

    await expect(
      session.loginAsAdmin('customer@example.com', 'secret')
    ).rejects.toBeInstanceOf(AdminAccessDeniedError);
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('should sign out and reject when the role cannot be verified', async () => {
    const session = configure({ uid: 'admin-1' }, null);
    users.getUser.mockRejectedValue(new Error('offline'));

    await expect(
      session.loginAsAdmin('admin@example.com', 'secret')
    ).rejects.toBeInstanceOf(AdminAccessDeniedError);
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
