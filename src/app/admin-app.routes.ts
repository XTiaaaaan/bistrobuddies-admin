import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/admin.guard';

export const adminRoutes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/admin-login/admin-login.page').then(
        (m) => m.AdminLoginPage
      ),
  },
  {
    path: 'dashboard',
    canMatch: [adminGuard],
    loadComponent: () =>
      import('./pages/admin-dashboard/admin-dashboard.page').then(
        (m) => m.AdminDashboardPage
      ),
  },
  {
    path: 'products',
    canMatch: [adminGuard],
    loadComponent: () =>
      import('./pages/admin-products/admin-products.page').then(
        (m) => m.AdminProductsPage
      ),
  },
  {
    path: 'products/new',
    canMatch: [adminGuard],
    loadComponent: () =>
      import('./pages/admin-product-form/admin-product-form.page').then(
        (m) => m.AdminProductFormPage
      ),
  },
  {
    path: 'products/:id',
    canMatch: [adminGuard],
    loadComponent: () =>
      import('./pages/admin-product-form/admin-product-form.page').then(
        (m) => m.AdminProductFormPage
      ),
  },
  {
    path: 'orders',
    canMatch: [adminGuard],
    loadComponent: () =>
      import('./pages/admin-orders/admin-orders.page').then(
        (m) => m.AdminOrdersPage
      ),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
