# BistroBuddies Admin (browser site)

Browser-based admin dashboard: Ionic + Angular 22, deployed as a static
site (no Capacitor, no native platforms).

## Prerequisites

- Node.js >= 20.12 (developed with Node 24)
- npm >= 10

## Setup

```bash
npm install
```

## Development

```bash
# Terminal 1 — backend API (separate repo: bistrobuddies-backend)
cd ../bistrobuddies-backend && npm install && npm run dev   # listens on :3001

# Terminal 2 — this app
npm start        # ng serve admin
```

Signing in requires a Firebase Auth user whose Firestore `users/{uid}`
document has `role: 'admin'`. Role checks are enforced in Firestore rules
*and* re-verified server-side by the backend for every admin API call.

## Configuration

| File | Purpose |
| --- | --- |
| `src/environments/environment.ts` | Dev config: `apiBaseUrl: 'http://localhost:3001/api'`, Firebase web config |
| `src/environments/environment.prod.ts` | Prod config: `apiBaseUrl: 'https://your-bistrobuddies-backend.example/api'` (**must be replaced before a production build**), Firebase web config |

The Firebase values are the public Firebase web SDK config — safe to commit.
No secrets belong in this repository.

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Dev server (`ng serve admin`) |
| `npm run build` | Production build to `dist/admin/` (host with any static server) |
| `npm run watch` | Dev build in watch mode |
| `npm test` | Unit tests (Vitest via Angular builder) |
| `npm run lint` | ESLint (`ng lint admin`) |

## Data access after separation

- **Product create / update / delete / availability toggle** go through the
  backend: `POST|PATCH|DELETE /api/admin/products[/:id]`
  (`src/app/core/api/admin-api.service.ts`). Prices are validated
  server-side.
- **Reads** (dashboard numbers, product list, order list, user list) still go
  directly to the Firestore client SDK under the existing rules — unchanged
  behaviour. The API contract has no `GET /api/admin/orders`, so the Orders
  page reads `orders/{id}` documents live and sorts them client-side.
- **Order status transitions** go through the backend
  (`POST /api/admin/orders/:id/status`) from the Orders page
  (`src/app/pages/admin-orders/`). Allowed moves are checked against the
  backend's status graph before they are offered; payment status is
  display-only because only the backend may change it.
- **Products are single-price**: the form sends one `price`, and the backend
  keeps the legacy `small/medium/largePrice` fields in sync for
  compatibility. A legacy tiered document is flattened to its medium price on
  first save; historic order snapshots are never rewritten.
- **Product image upload** is not part of the backend contract
  (`../bistrobuddies-backend/docs/API_CONTRACT.md` §6), so the form sets image
  URLs only and says so in the UI — `ProductImageUploadService.upload()`
  throws until that endpoint exists.

See `../integration-docs/` for the API contract and architecture.

## Known issues

- `npm run lint` passes.
- Pre-existing browserslist warnings (old Chrome/Safari versions outside
  Angular 22 support) are inherited from the original repository and are
  cosmetic.
