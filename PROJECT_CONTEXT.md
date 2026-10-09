# PROJECT_CONTEXT.md — BistroBuddies Admin (admin-only website)

> Generated from a read-only audit of the existing repository. No application code, Firebase settings,
> or data were changed. Secrets are intentionally not reproduced in this file.

---

## 1. What this repository is

The **separate, admin-only website**. A static Ionic/Angular SPA (no Capacitor, no native platforms)
where staff sign in, manage the product catalogue, and (planned) manage orders.

| Attribute | Verified value |
|---|---|
| Framework | Angular **22.0.1** (standalone-only, esbuild `@angular/build:application`) |
| UI | Ionic `@ionic/angular` **9.0.3** + `ionicons` 8 |
| Native | **None** — no `capacitor.config.ts` in this repo |
| Firebase | raw modular `firebase` JS SDK **12.19.0** (NOT `@angular/fire`) |
| Tests | Vitest 4.1.11 + jsdom via `@angular/build:unit-test` |
| Package manager | npm (`package-lock.json` lockfileVersion 3) |
| Output | `dist/admin` (static files at root) |
| Firebase project | `bistrobuddies-4f179` (`src/environments/environment.ts:18`) |
| Git | 1 commit (`3c8397f Initial commit: BistroBuddies admin site`), tree clean, remote `github.com/XTiaaaaan/bistrobuddies-admin` |

**Not present (verified):** no `vercel.json`, no `capacitor.config.ts`, no Order model/page/service,
no image-upload code, no `firebase/storage` import, no `@media` queries in `src/**/*.scss`.

Path alias: `@shared/*` → `./src/app/*` (defined in `tsconfig.app.json:7-9` and `tsconfig.spec.json:9-11`).

---

## 2. Entry points and routes

- `src/main.ts:6` → `bootstrapApplication(AdminAppComponent, adminAppConfig)`
- `src/index.html:18` → `<admin-root>`, title "BistroBuddies Admin", `<base href="/">`
- **`src/app/admin-app.routes.ts`** is the only route table (no `app.routes.ts`).

| Path | Component | Guard |
|---|---|---|
| `''` | redirect → `dashboard` | — |
| `login` | AdminLoginPage | **none (public)** |
| `dashboard` | AdminDashboardPage | `canMatch: [adminGuard]` |
| `products` | AdminProductsPage | `canMatch: [adminGuard]` |
| `products/new` | AdminProductFormPage (create) | `canMatch: [adminGuard]` |
| `products/:id` | AdminProductFormPage (edit) | `canMatch: [adminGuard]` |
| `**` | redirect → `dashboard` | — |

All lazy routes use `loadComponent` + dynamic `import()`, with `withPreloading(PreloadAllModules)`.

**Pages that exist:** admin-login, admin-dashboard, admin-products, admin-product-form.
**No orders page, no customers page, no settings page.**

---

## 3. Responsibilities (what this app owns)

| Area | Implementation |
|---|---|
| Admin sign-in | Firebase Auth email/password — `services/auth.service.ts:91-105` (`signInWithEmailAndPassword`) |
| Admin authorization | `AdminSessionService.checkAdminAccess()` reads Firestore `users/{uid}` and grants only if `profile.role === 'admin'` (`core/auth/admin-session.service.ts:82`); fail-closed on read error; forced sign-out on denial |
| Route gating | `adminGuard` (`core/auth/admin.guard.ts:9-29`) — `CanMatchFn`; denied → `/login?denied=1&redirect=…` **and logout** |
| Product reads | Live Firestore — `services/products.service.ts:36-52` (**read-only by design**) |
| Product writes | Backend API only — `core/api/admin-api.service.ts:35-55` |
| Profile sync | Writes `users/{uid}` (`auth.service.ts:126-168`), always `role: 'customer'` if creating |
| Orders | **Not implemented** (dashboard shows product counts only) |
| Payments | **Not implemented** (zero PayMongo references) |

**Authorization is not merely UI hiding:** there is a real `canMatch` guard, plus every privileged write
is re-verified server-side by the backend (`admin-api.service.ts:19-27`). Firestore **reads** from the
browser are protected only by the backend repo's `firestore.rules`.

---

## 4. API contract used by this app

Base URL: `environment.apiBaseUrl`

| Env file | Value |
|---|---|
| `src/environments/environment.ts:14` (dev) | `http://localhost:3001/api` |
| `src/environments/environment.prod.ts:12` (prod) | `https://your-bistrobuddies-backend.example/api` — **⚠️ unresolved placeholder** |

All requests attach `Authorization: Bearer <Firebase ID token>` (`admin-api.service.ts:71`).

| Method | Endpoint | Used by |
|---|---|---|
| `POST` | `{apiBaseUrl}/admin/products` | product form — create (`admin-product-form.page.ts:104`) |
| `PATCH` | `{apiBaseUrl}/admin/products/:id` | product form — update (`:102`); availability toggle (`admin-products.page.ts:81-91`) |
| `DELETE` | `{apiBaseUrl}/admin/products/:id` | product list — delete with confirm (`admin-products.page.ts:111-120`) |

Error mapping (`admin-api.service.ts:80-111`): 401/403 → "session could not be verified";
status 0 → "Could not reach the BistroBuddies server. Is the backend running?";
server message read from `body.error.message`.

**Not used by this app (backend endpoints that exist):** `POST /api/admin/orders/:id/status`.
The backend README states order-management UI "was planned and not yet built".

Firestore reads: `products`, `users`. Firestore writes: `users` only (profile sync) — **never `products`**.

---

## 5. Data models (`src/app/models/`)

### product.model.ts (the whole model)
```ts
type ProductSize = 'small' | 'medium' | 'large';
interface Product {
  id, name, description, category, imageUrl, cloudinaryPublicId: string;
  smallPrice: number; mediumPrice: number; largePrice: number;   // PHP
  sugarOptions: string[]; available: boolean;
  createdAt: Timestamp | null; updatedAt: Timestamp | null;
}
```
- **Price: three PHP numbers (`₱`), size-tiered, single currency** — entered and displayed as
  `Small/Medium/Large price (₱)` (`admin-product-form.page.html:64-93`, `admin-products.page.ts:75-78`).
- Validation: name + category required, all three prices finite and `> 0`, ≥1 sugar option
  (`admin-product-form.page.ts:153-204`).
- Image field is a **free-text `imageUrl` string** — there is no upload.
- `cloudinaryPublicId` is only carried forward on edit (`:188`) and never set by any upload flow.

### user.model.ts
`UserRole = 'customer' | 'admin'`; `User{uid,name,email,phone,address,role,createdAt,updatedAt}`.

### **No Order model exists.**

---

## 6. Firebase configuration

Both files under `src/environments/`, swapped by `angular.json` `fileReplacements` for production.

| Key | Dev (`environment.ts`) | Prod (`environment.prod.ts`) |
|---|---|---|
| `production` | `false` | `true` |
| `deliveryFee` | `0` (defined, **unused** here) | `0` |
| `apiBaseUrl` | `http://localhost:3001/api` | placeholder — **must be replaced** |
| `firebase.apiKey` | present (public web SDK key — value not reproduced here) | same |
| `firebase.authDomain` | `bistrobuddies-4f179.firebaseapp.com` | same |
| `firebase.projectId` | **`bistrobuddies-4f179`** | same |
| `firebase.storageBucket` | `bistrobuddies-4f179.firebasestorage.app` | same (present, **unused** — `firebase/storage` never imported) |
| `firebase.messagingSenderId` / `appId` | present (identifiers, not secrets) | same |

No `.env*` files in this repo. Firebase web config is public-by-design; real protection comes from
Firestore rules + the backend's server-side role check.

---

## 7. Build / test / lint commands (executed during this audit)

| Script | Command | Result |
|---|---|---|
| `npm start` | `ng serve admin` | dev server on :4200 (not started in audit) |
| `npm run build` | `ng build admin` | **PASS (exit 0)** → `dist/admin`, 1.37 MB initial / 309 kB transfer |
| `npm test` | `ng test admin` | **PASS — 3 files, 17/17 tests** |
| `npm run lint` | `ng lint admin` | **PASS — "All files pass linting."** |
| `npm run watch` | `ng build admin --watch --configuration development` | — |

Tests cover `admin.guard.spec.ts`, `admin-session.service.spec.ts`, `auth-errors.spec.ts`.
Builds/tests emit a non-fatal Browserslist "unsupported browsers" warning (legacy targets).

---

## 8. Security requirements (must hold for any future change)

1. **Admin role lives in Firestore `users/{uid}.role`**, checked on every sign-in
   (`admin-session.service.ts:82`) and re-verified by the backend on every privileged call. There are
   **no Firebase custom claims** — do not weaken the Firestore role doc.
2. **All product writes must go through the backend API** — never write `products` directly from here.
   The backend enforces `requireAuth + requireAdmin`; Firestore rules additionally require `isAdmin()`.
3. **Never send or store secrets in this repo.** No PayMongo keys, no service accounts — those belong
   only in the backend's server-side environment.
4. ⚠️ `UsersService.updateUser(uid, patch: Partial<User>)` (`users.service.ts:42-47`) accepts `role`;
   `createUser` honors `input.role` (`:36`). Both are currently called only with safe values —
   never pass `role` from this app (backend `firestore.rules` line 33-37 preserves `role` on self-update).
5. ⚠️ **Replace the placeholder prod `apiBaseUrl` before any production build** — otherwise admin Bearer
   tokens are sent to a domain the team does not control.
6. Bearer tokens are fetched per request and never persisted (`auth.service.ts:59-70`) — keep it that way.
7. Product reads are direct from the browser; the client-side guard is advisory. Backend
   `firestore.rules` must keep `products` admin-writable and `users` list admin-only.
8. Dev CORS depends on the backend allowlisting `http://localhost:4200`; a Vercel origin must be added to
   the backend's `ALLOWED_ORIGINS`.

---

## 9. Remaining work (requirement status)

| Requirement | Status | Evidence / what is missing |
|---|---|---|
| Separate admin login and authorization | ✅ **WORKS** | Dedicated `AdminLoginPage`; `role === 'admin'` check (`admin-session.service.ts:82`); `canMatch: [adminGuard]` on all 4 protected routes; fail-closed + force logout (`admin.guard.ts:9-29`); backend re-verifies every write; guard/session unit tests pass |
| Product CRUD | ⚠️ **PARTIAL** | Create/Update/Delete via API ✅, list/detail via Firestore ✅. **Image is a URL text field only** (`admin-product-form.page.html:52-60`) — no upload, no preview, no file input |
| — category | ✅ | required field (`admin-product-form.page.ts:161-164`) |
| — description | ✅ | optional field (`html:42-50`) |
| — price in PHP | ✅ | three `₱`-labelled number inputs, all validated `> 0` |
| — availability | ✅ | toggle (`html:95-103`) wired to `PATCH … {available}` (`admin-products.page.ts:81-91`) |
| Localhost image uploads during development | ❌ **MISSING** | Zero hits for `<input type="file">`, `FormData`, `FileReader`, or any upload endpoint in `src/**` |
| Firebase Storage support for production | ❌ **MISSING** | `storageBucket` exists in both env files but `firebase/storage` is never imported; `core/firebase/firebase.ts` initializes only app/auth/firestore |
| Admin order management | ❌ **MISSING** | No orders route, page, model, or service. Backend `POST /api/admin/orders/:id/status` exists but is unused by this UI (`README.md:59-61`) |
| PayMongo | ❌ **MISSING** | Zero references in `src/**` |
| Vercel deployment readiness | ⚠️ **PARTIAL** | Static build to `dist/admin` with `<base href="/">` ✅; **no `vercel.json` and no SPA rewrite**, so deep links like `/products/:id` would 404 on a naive deploy; prod `apiBaseUrl` still a placeholder |
| Responsive UI | ⚠️ **PARTIAL** | Viewport meta, `max-width:1100px` container (`global.scss:71-75`), auto-fit stat grid `minmax(200px,1fr)`, `flex-wrap` on cards/header — but **zero `@media` breakpoints** in `src/**/*.scss` |

---

## 10. Product price note (single PHP price decision)

Prices are **three PHP numbers per product** (size tiers), single currency — the "price in PHP"
requirement is satisfied. Collapsing to one price is **unsafe**: this app's form has three required
price inputs, and the backend (`PRICE_FIELDS`, `validateProductInput`) plus the mobile app's size
selector/cart all require three tiers. **Keep the current schema** — see the backend repo's
`PROJECT_CONTEXT.md` §10 for the full dependency list. Old orders are safe because they snapshot
`unitPrice`/`subtotal`. **No migration performed.**

---

## 11. Related repositories

| Repo | Role |
|---|---|
| `../bistrobuddies-backend` | Trusted API on `:3001` — owns pricing, admin auth re-verification, product writes |
| `../bistrobuddies-mobile` | Customer app — shares the same Firestore collections and Firebase project |

⚠️ `README.md:63` references `../integration-docs/` — **that directory does not exist** in `D:\bistrobuddies`.
