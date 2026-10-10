import { adminRoutes } from './admin-app.routes';
import { adminGuard } from './core/auth/admin.guard';

describe('adminRoutes', () => {
  // The login page and the redirects are the only public entries.
  const publicPaths = new Set(['', 'login', '**']);

  it('protects every admin page with the admin guard', () => {
    const protectedRoutes = adminRoutes.filter(
      (route) => !publicPaths.has(route.path ?? '')
    );

    expect(protectedRoutes.length).toBeGreaterThanOrEqual(5);
    for (const route of protectedRoutes) {
      expect(route.canMatch).toContain(adminGuard);
    }
  });

  it('registers the orders page behind the guard', () => {
    const ordersRoute = adminRoutes.find((route) => route.path === 'orders');

    expect(ordersRoute).toBeDefined();
    expect(ordersRoute?.canMatch).toContain(adminGuard);
    expect(typeof ordersRoute?.loadComponent).toBe('function');
  });

  it('keeps the login page reachable without a guard', () => {
    const loginRoute = adminRoutes.find((route) => route.path === 'login');

    expect(loginRoute).toBeDefined();
    expect(loginRoute?.canMatch).toBeUndefined();
  });
});
