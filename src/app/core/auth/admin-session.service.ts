import { Injectable, inject } from '@angular/core';
import { Observable, catchError, firstValueFrom, of, switchMap } from 'rxjs';
import { AuthService, AuthProgress } from '@shared/services/auth.service';
import { UsersService } from '@shared/services/users.service';
import { User } from '@shared/models/user.model';

/**
 * Result of checking whether the current session may use the Admin Web.
 *
 * - `granted`: signed in and the Firestore profile has role = admin.
 * - `signed-out`: no Firebase auth session.
 * - `denied`: signed in but the profile is missing or role is not admin.
 * - `error`: the profile could not be read (e.g. offline) — access stays closed.
 */
export type AdminAccess = 'granted' | 'signed-out' | 'denied' | 'error';

/** Thrown when a login succeeds but the account is not an administrator. */
export class AdminAccessDeniedError extends Error {
  constructor(readonly access: Extract<AdminAccess, 'denied' | 'error'>) {
    super(
      access === 'denied'
        ? 'This account does not have administrator access.'
        : 'Your administrator access could not be verified. Please try again.'
    );
    this.name = 'AdminAccessDeniedError';
  }
}

/**
 * Admin Web session handling. Uses the shared Firebase Authentication and the
 * shared `users` Firestore collection; the administrator role always comes
 * from the Firestore profile (role = admin), never from the client.
 */
@Injectable({ providedIn: 'root' })
export class AdminSessionService {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UsersService);

  readonly signedIn$: Observable<boolean> = this.auth.isAuthenticated$;

  /** Firestore profile of the signed-in user. Null when signed out. */
  readonly profile$: Observable<User | null> = this.auth.user$.pipe(
    switchMap((user) => (user ? this.users.watchUser(user.uid) : of(null))),
    catchError(() => of(null))
  );

  /** Signs in with email/password and only keeps the session for admins. */
  async loginAsAdmin(
    email: string,
    password: string,
    onProgress?: AuthProgress
  ): Promise<void> {
    await this.auth.login(email, password, onProgress);
    const access = await this.checkAdminAccess();
    if (access !== 'granted') {
      await this.logoutSafely();
      throw new AdminAccessDeniedError(
        access === 'error' ? 'error' : 'denied'
      );
    }
  }

  /**
   * Verifies the current session against the Firestore profile.
   * Never grants access on a read failure.
   */
  async checkAdminAccess(): Promise<AdminAccess> {
    const user = await firstValueFrom(
      this.auth.user$.pipe(catchError(() => of(null)))
    );
    if (!user) {
      return 'signed-out';
    }

    let profile: User | null;
    try {
      profile = await this.users.getUser(user.uid);
    } catch {
      return 'error';
    }

    if (profile?.role === 'admin') {
      return 'granted';
    }
    return 'denied';
  }

  logout(): Promise<void> {
    return this.auth.logout();
  }

  private logoutSafely(): Promise<void> {
    return this.auth.logout().catch(() => undefined);
  }
}
