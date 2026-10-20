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
| `src/environments/environment.prod.ts` | Prod config: `apiBaseUrl: 'https://bistrobuddies-backend.onrender.com/api'`, Firebase web config |

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
  backend's status graph before they are offered. Delivery orders move
  `READY → OUT_FOR_DELIVERY → COMPLETED` (the UI labels
  `OUT_FOR_DELIVERY` "On the Way"); pickup orders move `READY → COMPLETED`
  and never pass through `OUT_FOR_DELIVERY`. Confirming payment never changes
  the fulfilment status.
- **Manual GCash verification** (no gateway) also goes through the backend:
  the Orders page shows the submitted GCash account name + mobile number and
  records the admin decision with
  `POST /api/admin/orders/:id/payment` (`{"decision":"PAID"}` or
  `{"decision":"REJECTED"}`) after an out-of-band check of the actual GCash
  transaction. Only `VERIFYING` GCash orders with submitted details offer
  Confirm/Reject; COD orders, orders without details, and `PAID` orders
  offer no decision. Payment state is never written to Firestore from this
  app — the live order listener refreshes the row once the backend writes
  the decision.
- **Products are single-price**: the form sends one `price`, and the backend
  keeps the legacy `small/medium/largePrice` fields in sync for
  compatibility. A legacy tiered document is flattened to its medium price on
  first save; historic order snapshots are never rewritten.
- **Product image upload** is not part of the backend contract
  (`../bistrobuddies-backend/docs/API_CONTRACT.md` §6), so the form sets image
  URLs only and says so in the UI — `ProductImageUploadService.upload()`
  throws until that endpoint exists.

- **In-app admin notifications** come from the same admin-only live
  `orders` listener (`src/app/core/notifications/` and
  `src/app/services/admin-notifications.service.ts`). The first snapshot only
  establishes a baseline, so signing in never replays old orders. After that
  the header bell (`src/app/components/admin-notifications-bell/`) raises
  alerts for newly created orders and for GCash proofs awaiting verification;
  repeated snapshots and payment/status updates do not duplicate alerts.
  Clicking an alert opens `/orders?order=<id>`, which focuses that order's
  card. Alerts are in-memory only and disappear on reload/sign-out.

See `../integration-docs/` for the API contract and architecture.

## Browser push notifications (manual setup — not enabled yet)

The admin site currently has **in-app alerts only**. Browser push is not
wired up because this repository has no web-push VAPID key, no
`firebase-messaging-sw.js` service worker, and no `firebase-messaging`
client registration. The backend already supports it
(`ADMIN_NEW_ORDER` / `ADMIN_PAYMENT_PROOF` FCM event types and
`POST /api/notifications/devices`), so enabling it requires the following,
all outside the current implementation:

1. Generate a Firebase Web Push certificate (VAPID key) in the Firebase
   console and add it to `src/environments/environment*.ts` (public value).
2. Register a service worker (for example `src/firebase-messaging-sw.js`
   served from the site root) that imports `firebase/messaging` and handles
   `onBackgroundMessage`.
3. After an administrator signs in, request notification permission, call
   `getToken({ vapidKey })` from `firebase/messaging`, and POST the token to
   the backend's device-registration endpoint with the admin's ID token.
4. Keep the existing role checks: never request push permission or register a
   device for a non-admin profile.

Do not commit the VAPID private key; only the public web-push key belongs in
the client configuration.

## Known issues

- `npm run lint` passes.
- Pre-existing browserslist warnings (old Chrome/Safari versions outside
  Angular 22 support) are inherited from the original repository and are
  cosmetic.
