# SafeTag — Route Reference

Generated from `server.js`. All routes use Express with CSRF protection on every POST.

---

## Public Routes (no auth)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Homepage |
| GET | `/store` | Product listing (all approved products) |
| GET | `/store/:productId` | Product detail page |
| GET | `/demo` | Demo emergency page (redirect to TESTACT1) |
| GET | `/:tag_id/:security_key` | Tag scan entry — redirects to emergency page (active) or register-tag flow (inactive) |
| GET | `/emergency/:tag_id` | Emergency profile page (Layout D swipe cards by default) |
| GET | `/register/:tag_id` | Tag registration landing page |
| POST | `/register/:tag_id` | Submit registration (activates tag, creates account/session) |
| GET | `/qr/:tag_id` | Download tag QR code as PNG image |
| POST | `/api/location-alert` | Internal — receives geolocation from emergency page JS, sends WhatsApp alert |
| GET | `/favicon.ico` | Redirects to `/static/favicon.png` |

---

## Customer Auth Routes

| Method | Path | Redirect after | Notes |
|---|---|---|---|
| GET | `/login` | — | Shows login form; `?next=` param preserved |
| POST | `/login` | `/admin` (if admin), else `next` or `/dashboard` | Admins always land on `/admin` |
| GET | `/register` | — | Customer registration form |
| POST | `/register` | `/dashboard` | Creates user, starts session |
| POST | `/logout` | `/login` (if admin), `/` (if customer) | Clears `session.user` |

---

## Customer Portal (requires `session.user`)

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | My tags + my orders |
| POST | `/dashboard/claim` | Activate / claim a tag by ID + security key |
| GET | `/profile/edit/:tag_id` | Edit emergency profile form |
| POST | `/profile/edit/:tag_id` | Save emergency profile |
| GET | `/orders` | Full order history |
| GET | `/account/settings` | Account settings form |
| POST | `/account/settings` | Save account settings |
| GET | `/checkout/:productId` | Checkout page for a product |
| POST | `/checkout/:productId` | Place order (COD or Razorpay) |
| POST | `/checkout/:productId/verify` | Razorpay payment verification callback |
| GET | `/order-confirmation/:orderId` | Order confirmation page |

---

## Manufacturer Auth Routes

| Method | Path | Redirect after | Notes |
|---|---|---|---|
| GET | `/manufacturer/login` | — | Manufacturer sign-in form |
| POST | `/manufacturer/login` | `/manufacturer/dashboard` | Starts `session.manufacturer` |
| GET | `/manufacturer/register` | — | Manufacturer registration form |
| POST | `/manufacturer/register` | `/manufacturer/dashboard` | Creates manufacturer account (pending approval) |
| POST | `/manufacturer/logout` | `/manufacturer/login` | Clears `session.manufacturer` |

---

## Manufacturer Portal (requires `session.manufacturer`)

| Method | Path | Description |
|---|---|---|
| GET | `/manufacturer/dashboard` | Batches + listings overview |
| GET | `/manufacturer/batch/new` | New batch form |
| POST | `/manufacturer/batch/new` | Create tag batch (generates unique IDs + QR/NFC payloads) |
| GET | `/manufacturer/batch/:id` | Batch detail (tag list) |
| GET | `/manufacturer/batch/:id/csv` | Download batch as CSV |
| GET | `/manufacturer/listings` | All product listings |
| GET | `/manufacturer/listings/new` | New product listing form |
| POST | `/manufacturer/listings/new` | Create product listing |
| POST | `/manufacturer/listings/:id/delete` | Delete listing |
| POST | `/manufacturer/request-approval` | Request admin approval for the manufacturer account |

---

## Admin Routes (requires `session.user.is_admin = true`)

Auth guard redirects unauthenticated requests to `/login`.

| Method | Path | Description |
|---|---|---|
| GET | `/admin` | Admin dashboard (stats overview) |
| GET | `/admin/users` | All customer accounts |
| POST | `/admin/users/:id/deactivate` | Deactivate a user |
| POST | `/admin/users/:id/activate` | Reactivate a user |
| GET | `/admin/manufacturers` | All manufacturer accounts |
| POST | `/admin/manufacturers/:id/approve` | Approve a manufacturer |
| POST | `/admin/manufacturers/:id/block` | Block a manufacturer |
| GET | `/admin/store` | All product listings (approve / feature) |
| POST | `/admin/store/:id/approve` | Approve a product listing |
| POST | `/admin/store/:id/reject` | Reject a product listing |
| POST | `/admin/store/:id/feature` | Toggle featured status |
| GET | `/admin/orders` | All orders |
| POST | `/admin/orders/:id/dispatch` | Mark order as dispatched |
| POST | `/admin/orders/:id/status` | Update order status (any status) |
| GET | `/admin/orders.csv` | Export all orders as CSV |

---

## Auth Guard Behaviour

| Guard | Condition | Redirect |
|---|---|---|
| `requireUser` | `session.user` absent | `/login?next=<original-url>` |
| `requireAdmin` | `session.user.is_admin` false or absent | `/login` |
| `requireManufacturer` | `session.manufacturer` absent | `/manufacturer/login?next=<original-url>` |

---

## Session Keys

| Key | Set by | Cleared by |
|---|---|---|
| `session.user` | `POST /login`, `POST /register`, `POST /register/:tag_id` | `POST /logout` |
| `session.manufacturer` | `POST /manufacturer/login`, `POST /manufacturer/register` | `POST /manufacturer/logout` |

---

## Logout Redirect Summary (fixed)

| Actor | Logout route | Lands on |
|---|---|---|
| Customer | `POST /logout` | `/` (homepage) |
| Admin | `POST /logout` | `/login` |
| Manufacturer | `POST /manufacturer/logout` | `/manufacturer/login` |

---

## Known Route Constraints

- `/:tag_id` pattern uses `[A-Z0-9]{6,12}` — case-sensitive routing is **on** so lowercase paths don't match
- `/:security_key` uses `[A-Za-z0-9_-]{8,32}`
- Static files served at `/static/*` from `public/`
- All state-changing forms include a hidden CSRF token via `<%- include('layout/_csrf') %>`
