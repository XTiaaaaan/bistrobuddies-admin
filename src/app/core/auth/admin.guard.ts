import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { AdminSessionService } from './admin-session.service';

/**
 * Restricts every Admin Web route to accounts whose Firestore profile has
 * role = admin. Customers and signed-out visitors are redirected to /login.
 */
export const adminGuard: CanMatchFn = async (_route, segments) => {
  const session = inject(AdminSessionService);
  const router = inject(Router);

  const access = await session.checkAdminAccess();
  if (access === 'granted') {
    return true;
  }

  const url = '/' + segments.map((segment) => segment.path).join('/');
  const loginUrl: UrlTree = router.createUrlTree(['/login'], {
    queryParams: access === 'denied' ? { denied: 1, redirect: url } : { redirect: url },
  });

  if (access === 'denied') {
    // Confirmed non-admin session: end it so the Admin Web never keeps one.
    await session.logout().catch(() => undefined);
  }

  return loginUrl;
};
