# SafeTag — Build Memory

> Project memory file. Captures everything that has been built, where, and how it was verified. Read this before resuming work in a new session.

**Status:** Steps 1–14 of the SDD §12 build order are complete. Step 15 (production hardening) is partially complete. Application runs end-to-end with both backend and frontend. **CSRF protection has been added at the Node.js layer (per SDD §10 intent).**

**Last verified:** 2026-05-21 (sandbox integration test):
- All 22 pages render with HTTP 200.
- Scan router correctly redirects active → /emergency, inactive → /register.
- Tag registration end-to-end works with CSRF token (POST without token is rejected with friendly flash; POST with token activates the tag and shows the profile).
- Customer login → dashboard renders user's tags.
- Admin and manufacturer dashboards render.
- CSV batch generation returns valid 715-byte CSV with 3 unique tags.
- QR PNG generation returns valid 741-byte image.
- Every EJS template compiles cleanly (`ejs.compile()` lint passes on all 23 .ejs files).

---

## 1. Project Identity

| | |
|---|---|
| **Name** | SafeTag — QR + RFID/NFC emergency identity tag platform |
| **Tagline** | Scan. Know. Save a Life. |
| **Domain (prod)** | safe-tag.in |
| **Repo** | https://github.com/kumarnitish378/safe-tag |
| **Local path** | `D:\safe-tag-project` |
| **Spec** | SDD v3.0 — Complete AI Agent Build Reference (`SafeTag_SDD_v3.docx`) |
| **Target market** | India — parents, elderly, travellers, pets, schools, hospitals |

Four user roles: Customer · Saver/Hero (no account) · Manufacturer · Admin.

Tag URL format: `https://safe-tag.in/<tag_id>/<security_key>` where tag_id is 8-char uppercase alphanumeric and security_key is `secrets.token_urlsafe(12)`.

---

## 2. Architecture (SDD §2)

```
Browser
  │  HTML
  ▼
Node.js + Express + EJS   ← /frontend  (all HTML rendering; no React)
  │  JSON (axios)
  ▼
Flask 3.x REST API        ← /backend   (pure JSON; never returns HTML)
  │
  ▼
PostgreSQL (prod) / SQLite (dev)
```

**Hard rules from SDD §12:**
- Flask returns ONLY `jsonify(...)`. No `render_template`, no Jinja, no HTML in `/backend`.
- Node.js renders ALL HTML from `.ejs` files in `/frontend/views`.
- Browser may only call Flask directly for `/api/location-alert` and `/api/health`. Everything else goes through Node.js.
- Sessions live in Node.js (`express-session`). Flask uses bearer tokens issued via `AuthToken` table.

---

## 3. Repository Layout

```
D:\safe-tag-project
├── .git/                               (initial commit on feat/initial-sdd-v3-build)
├── .gitignore
├── README.md                           Build + run + deploy guide
├── MEMORY.md                           ← this file
├── SafeTag_SDD_v3.docx                 source spec (do not edit)
│
├── backend/                            ── Flask REST API (PURE JSON)
│   ├── app.py                          47 routes; create_app() factory
│   ├── models.py                       SQLAlchemy: Tag, MedicalProfile, User, Manufacturer, TagBatch, ProductListing, Order, AuthToken
│   ├── config.py                       env-driven settings; postgres:// → postgresql://
│   ├── extensions.py                   shared db, mail, limiter, migrate
│   ├── helpers.py                      tag id gen, validators, auth decorators (login_required, admin_required, manufacturer_required, internal_only)
│   ├── requirements.txt                flask 3.x, sqlalchemy, qrcode, razorpay, twilio, gunicorn …
│   ├── Procfile                        web: gunicorn app:app --workers 2 --bind 0.0.0.0:$PORT
│   ├── .env.example                    template — copy to .env on each machine
│   ├── scripts/
│   │   ├── factory.py                  CLI: python scripts/factory.py --qty 100 --batch "Name"
│   │   ├── seed.py                     populate dev DB with SDD §13 test data
│   │   └── __init__.py
│   └── migrations/                     empty; ready for flask db init/migrate
│
└── frontend/                           ── Node.js + Express + EJS
    ├── server.js                       30+ routes; case-sensitive routing enabled
    ├── package.json                    express 4, ejs 3, axios 1, express-session, connect-flash, multer, dotenv
    ├── .env.example
    ├── public/
    │   └── css/safetag.css             supplemental (Tailwind via CDN)
    └── views/
        ├── layout/
        │   ├── _head.ejs               <head>, Tailwind, fonts, common styles, flash messages
        │   ├── _foot.ejs               closing </main>, footer include, </body></html>
        │   ├── _navbar.ejs             sticky nav with role-aware right side + "Manufacturer" link when not signed in
        │   ├── _footer.ejs             navy footer with links
        │   └── _csrf.ejs               hidden CSRF input — included in every POST form
        ├── index.ejs                   P1 homepage (hero with 3 CTAs incl. Manufacturer Login, how-it-works, who-for, featured store, story, "For manufacturers" CTA, FAQ)
        ├── store.ejs                   P2 store grid + category filter
        ├── store_product.ejs           P3 product detail + buy form
        ├── register_tag.ejs            P5 tag activation form (no account required)
        ├── emergency.ejs               P6 emergency profile (full-width mobile-first, navy header, call buttons, WhatsApp location)
        ├── dashboard.ejs               P9 customer dashboard
        ├── profile_edit.ejs            P10 edit medical profile
        ├── orders.ejs                  P11 order history
        ├── account_settings.ejs        P12 customer settings (mobile/name/password)
        ├── checkout.ejs                Razorpay checkout (live mode only)
        ├── 404.ejs                     P26 not-found
        ├── auth/
        │   ├── login.ejs               P7
        │   └── register.ejs            P8
        ├── manufacturer/
        │   ├── register.ejs            P13
        │   ├── login.ejs               P14
        │   ├── dashboard.ejs           P15
        │   ├── batch_new.ejs           P16
        │   ├── batch_detail.ejs        P17
        │   ├── listings.ejs            P18
        │   └── listing_new.ejs         P19
        └── admin/
            ├── dashboard.ejs           P20
            ├── manufacturers.ejs       P21
            ├── store.ejs               P22
            ├── users.ejs               P23
            └── orders.ejs              P24
```

---

## 4. Database Models (`backend/models.py`)

All UTC timestamps. Integer PKs unless noted.

| Model | Key fields | Notes |
|---|---|---|
| `Tag` | `tag_id` VARCHAR(10) PK, `security_key`, `is_active`, `owner_id`, `manufacturer_id`, `batch_id`, `scan_count`, `activated_at` | Core. 1:1 with MedicalProfile via `profile` relationship. |
| `MedicalProfile` | `tag_id` FK UNIQUE, `name*`, `age*`, `mobile_primary*`, blood_group, address, lat/lng, allergies, medications, conditions, custom_message, owner_whatsapp, photo_url, `category` (CHILD/ELDERLY/TRAVELER/PET/ADULT) | * = required. |
| `User` | `id`, `email` UNIQUE, `mobile`, `password_hash` (Werkzeug PBKDF2), `name`, `is_admin`, `is_active` | Customer + admin share table. |
| `Manufacturer` | `id`, `email` UNIQUE, `password_hash`, `business_name`, `mobile`, `is_approved`, `is_blocked` | Approval-gated. |
| `TagBatch` | `id`, `manufacturer_id`, `batch_name`, `quantity` | Traceability for tag batches. |
| `ProductListing` | `id`, `manufacturer_id`, `name`, `price` (paise), `category` (keychain/card/sticker/wristband), `quantity_available`, `is_approved`, `is_featured`, `is_rejected`, `photo_url` | |
| `Order` | `id`, `user_id`, `product_listing_id`, `quantity`, `amount` (paise), `status` (pending/dispatched/delivered/cancelled), `tracking_id`, razorpay_order_id, razorpay_payment_id, shipping_address | |
| `AuthToken` | `id`, `token` UNIQUE, `user_id` or `manufacturer_id`, `last_used_at` | Bearer token issued at login; sent as `Authorization: Bearer <token>` to Flask. |

Every model has a `to_dict()` for JSON serialization. `User`/`Manufacturer` have `set_password()` / `check_password()` using Werkzeug.

---

## 5. Flask API Endpoints (`backend/app.py`)

All routes are JSON. Auth via `Authorization: Bearer <token>` header. `@admin_required`, `@manufacturer_required`, `@login_required` decorators in `helpers.py`. Rate limits applied to scan/emergency (30/min) and location-alert (10/min).

### Public (no auth)
- `GET  /api/health`
- `GET  /api/scan/<tag_id>/<security_key>` → `{is_active, tag_id}` or 404. Increments `scan_count`.
- `GET  /api/tag/<tag_id>/status`
- `GET  /api/emergency/<tag_id>` → full MedicalProfile JSON if active
- `POST /api/tag/<tag_id>/register` → creates MedicalProfile, activates tag, optionally links to logged-in user
- `GET  /api/qr/<tag_id>` → PNG via `qrcode[pil]`
- `POST /api/location-alert` → Twilio WhatsApp to owner; graceful no-op if Twilio not configured
- `GET  /api/store/products` (`?category=&featured=true`)
- `GET  /api/store/products/<id>`

### Customer auth + user
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET  /api/user/tags`, `GET /api/user/orders`, `PUT /api/user/settings`, `POST /api/user/claim-tag`
- `GET/PUT /api/tag/<tag_id>/profile` (owner-only)

### Manufacturer
- `POST /api/manufacturer/register`, `POST /api/manufacturer/login`, `GET /api/manufacturer/me`
- `POST /api/manufacturer/batch` → creates tags + returns CSV file (Content-Type: text/csv)
- `GET  /api/manufacturer/batches`, `GET /api/manufacturer/batch/<id>`, `GET /api/manufacturer/batch/<id>/csv`
- `GET/POST/PUT/DELETE /api/manufacturer/listings[/<id>]`

### Payment
- `POST /api/payment/initiate` → Razorpay order (or dummy in DUMMY_PAYMENT mode)
- `POST /api/payment/success` → verifies Razorpay signature (HMAC-SHA256) then creates Order. Dummy mode skips verification.

### Admin
- `GET  /api/admin/stats` → tags, activation rate, users, mfrs, orders, revenue_week + recent_activity feed
- `GET  /api/admin/manufacturers`, `POST /api/admin/manufacturers/<id>/approve|block`
- `GET  /api/admin/listings`, `POST /api/admin/listings/<id>/approve|reject|feature`
- `GET  /api/admin/orders` (`?status=`), `POST /api/admin/orders/<id>/dispatch|status`
- `GET  /api/admin/orders.csv` → CSV export
- `GET  /api/admin/users`, `POST /api/admin/users/<id>/activate|deactivate`

47 routes total registered. Verified with `app.url_map.iter_rules()`.

---

## 6. Node.js Routes (`frontend/server.js`)

Routes call Flask via axios and render EJS. **`app.set('case sensitive routing', true)`** is critical — the scan route `/:tag_id([A-Z0-9]{6,12})/:security_key([A-Za-z0-9_-]{8,32})` must NOT match lowercase paths like `/emergency` or `/register`.

Auth lives in `req.session` (express-session): `req.session.user`, `req.session.userToken`, `req.session.manufacturer`, `req.session.manufacturerToken`. `authHeaders(req)` builds the Bearer header for axios.

**CSRF protection (added 2026-05-21).** Per-session token, hand-rolled — no extra dependency. Lives in `server.js`:
- `ensureCsrfToken(req)` writes a 24-byte hex token to `req.session.csrfToken` on first request.
- A middleware rejects every non-GET request whose `_csrf` field (or `X-CSRF-Token` header) doesn't match the session token. On mismatch it rotates the token, flashes `"Your session expired. Please reload the page and try again."`, and redirects to `Referer` (or `/`).
- The exemption list `CSRF_SKIP_PATHS` is currently `[ /^\/qr\// ]` (QR endpoint is GET-only anyway, but listed for clarity).
- `res.locals.csrfToken` exposes the token to every EJS template.
- All 17 POST forms now include `<%- include('layout/_csrf') %>` (relative path adjusted to `'../layout/_csrf'` for templates in subfolders), which renders to `<input type="hidden" name="_csrf" value="..." />`.
- The partial file is at `views/layout/_csrf.ejs`.
- Note: `express-session` is configured with `saveUninitialized: true` so the CSRF token persists across the first GET → POST round trip.

Guards: `requireUser`, `requireAdmin`, `requireManufacturer` redirect to the appropriate login if absent.

Special endpoints:
- `POST /manufacturer/batch/new` — receives the Flask CSV as `arraybuffer` and proxies it as a browser download
- `POST /checkout/:productId` — in dummy mode, calls initiate + success in one shot; in live mode, renders `checkout.ejs` with Razorpay Checkout JS that posts back to `/checkout/:productId/verify`
- Browser JS on `emergency.ejs` calls Flask `/api/location-alert` directly (skips Node.js), passing geolocation coords

---

## 7. Environment Variables

### Backend (`backend/.env.example`)
```
SECRET_KEY               required
DATABASE_URL             sqlite:///dev.db locally; postgres URL in prod
BASE_URL                 http://localhost:3000 (no trailing slash) — used in QR + WhatsApp links
DUMMY_PAYMENT            true for dev, false for prod
INTERNAL_API_TOKEN       shared with Node.js for X-Internal-Token header
RAZORPAY_KEY_ID/SECRET   prod only
TWILIO_*                 optional (graceful fallback)
MAIL_*                   Flask-Mail / Gmail SMTP
CLOUDINARY_URL           optional
GOOGLE_MAPS_API_KEY      optional (frontend reads this via /api/config — not exposed yet)
SENTRY_DSN               optional
SESSION_COOKIE_SECURE    set true in production
```

### Frontend (`frontend/.env.example`)
```
FLASK_API_URL            http://localhost:5000 locally; http://safetag-api:5000 on Render private network
NODE_SESSION_SECRET      required
PORT                     3000 locally; assigned in production
BASE_URL                 must match Flask BASE_URL
INTERNAL_API_TOKEN       must match Flask INTERNAL_API_TOKEN
GOOGLE_MAPS_API_KEY      surfaced to EJS templates
NODE_ENV                 production sets secure cookies
```

---

## 8. Seed Data (per SDD §13)

`python scripts/seed.py` creates:

| Account | Email | Password | Notes |
|---|---|---|---|
| Admin | admin@test.com | Admin@1234 | `is_admin=True` |
| Customer | customer@test.com | Test@1234 | owns TESTACT1 |
| Manufacturer | mfr@test.com | Test@1234 | `is_approved=True`, owns the Test Batch + Steel listing |

Test tags:
- `TESTACT1` / `testkey00001` — **active**, MedicalProfile = Aarav Sharma (age 8, O+, allergies Peanuts/Penicillin, parent Riya, lat/lng Pune, custom message, owner_whatsapp set, category CHILD)
- `TESTINAC` / `testkey00002` — **inactive**, for registration flow

Test product: "SafeTag Key — Steel" — ₹149, keychain, featured, stock 100.

Test URLs:
- Emergency: `http://localhost:3000/TESTACT1/testkey00001`
- Registration: `http://localhost:3000/TESTINAC/testkey00002`

---

## 9. Build Status (SDD §12)

| # | Step | Status |
|---|---|---|
| 1 | Database models + Flask app skeleton | ✅ |
| 2 | Tag generation script (factory.py) | ✅ |
| 3 | Scan router + Emergency page | ✅ |
| 4 | Registration page | ✅ |
| 5 | Customer auth | ✅ |
| 6 | Customer dashboard + profile edit | ✅ |
| 7 | Homepage | ✅ |
| 8 | Manufacturer auth + batch creation | ✅ |
| 9 | Store + product listings | ✅ |
| 10 | Orders + payment (Razorpay dummy + signature verification) | ✅ |
| 11 | Admin panel | ✅ |
| 12 | QR code route | ✅ |
| 13 | Location alert API (Twilio with graceful fallback) | ✅ |
| 14 | Account settings + order history | ✅ |
| 15 | Production hardening | 🟡 partial — Razorpay signature done, rate limits done, validation done, Sentry wired. **CSRF protection added at the Node.js layer** (per-session token, generated by `ensureCsrfToken()` middleware in `server.js`, served via `res.locals.csrfToken`, included in every POST form through `views/layout/_csrf.ejs` partial, rejected with friendly flash if missing). HTTPS-secure cookie flag toggled via env. Pending: end-to-end signature verification on a real Razorpay sandbox order, real Twilio sandbox test. |

---

## 10. Integration Test Results (most recent run, 2026-05-21 — post-CSRF)

Both servers booted in the sandbox; 22 pages exercised; all returned HTTP 200 with the expected rendered content. Five additional CSRF-specific tests added:

| Group | Pages / Scenario | Result |
|---|---|---|
| Public | Homepage, store, product detail, emergency, register_tag, login, register, mfr login/register, qr png | 9/9 |
| Customer | dashboard, edit profile, orders, settings | 4/4 |
| Admin | dashboard, manufacturers, store, orders, users | 5/5 |
| Manufacturer | dashboard, batch new, listings, listing new | 4/4 |
| Scan router | active → 302 /emergency/…; inactive → 302 /register/…; bad key → 404 | ✓ |
| CSV download | POST /manufacturer/batch/new → text/csv, 3 unique tags | ✓ |
| QR PNG | /qr/TESTACT1 → image/png, 741 bytes | ✓ |
| **CSRF — Reject** | POST /register/TESTINAC without `_csrf` field | bounced 302 with flash "Your session expired. Please reload the page and try again." ✓ |
| **CSRF — Accept** | POST /register/TESTINAC with valid `_csrf` from the GET form | activated tag, redirected to /emergency/TESTINAC?activated=1, profile shows Nitish Kumar / B+ / Penicillin ✓ |
| **CSRF — Login flow** | POST /login with valid `_csrf` → /dashboard renders "My SafeTags" ✓ |
| **Homepage Manufacturer button** | "Manufacturer Login" (hero), "Become a Manufacturer" (CTA section), "For manufacturers" (heading) all present | ✓ |
| **EJS lint** | `ejs.compile()` against every .ejs file (23 templates) | all compile ✓ |

---

## 11. Git Status

- Initial commit `5c23a91` on branch **`feat/initial-sdd-v3-build`** (47 files).
- Remote `origin` configured: https://github.com/kumarnitish378/safe-tag.git
- Three zero-byte `.lock` files in `.git/` are stuck on the Windows mount and may need to be deleted on Windows before push (`del /F .git\config.lock .git\index.lock .git\HEAD.lock 2>$null`).
- Push and follow-up commit must run from the user's Windows machine (sandbox has no GitHub credentials).

**Unpushed changes** (need a follow-up commit before pushing to GitHub):

- `frontend/server.js` — boot section dedup + CSRF middleware (per-session token, validation, exemption list)
- `frontend/views/layout/_csrf.ejs` — new partial (hidden input)
- `frontend/views/layout/_navbar.ejs` — added "Manufacturer" link
- `frontend/views/index.ejs` — added "Manufacturer Login" CTA in hero + dedicated "For manufacturers" section
- 17 form templates updated with `<%- include('…layout/_csrf') %>`:
  - `auth/{login,register}.ejs`, `register_tag.ejs`, `dashboard.ejs`, `profile_edit.ejs`, `account_settings.ejs`, `store_product.ejs`
  - `manufacturer/{register,login,batch_new,listings,listing_new}.ejs`
  - `admin/{manufacturers,store,orders,users}.ejs`
  - `layout/_navbar.ejs` (logout forms)
- `MEMORY.md` — this update

To commit and push from PowerShell:

```powershell
cd D:\safe-tag-project
# Clean up the stale lock files from the Linux sandbox (if Windows lets you):
del /F .git\config.lock .git\index.lock .git\HEAD.lock 2>$null
git add .
git -c user.name="NITISH KUMAR" -c user.email="nitish.ns378@gmail.com" `
  commit -m "feat: CSRF protection at Node.js layer + manufacturer CTAs on homepage

- Add per-session CSRF token middleware in server.js (ensureCsrfToken)
- Create views/layout/_csrf.ejs partial and include it in all 17 POST forms
- Friendly 'Your session expired' flash on mismatch (rotates token)
- Set saveUninitialized:true so the token survives the first GET->POST
- Add 'Manufacturer Login' button to homepage hero
- Add dedicated 'For manufacturers' CTA section on homepage
- Add 'Manufacturer' nav link when no one is signed in
- Fix server.js boot section (dedup app.listen after Windows-mount truncation)
- Repair 8 form templates corrupted by greedy CSRF auto-insert regex"
git push -u origin feat/initial-sdd-v3-build
```

---

## 12. Known Quirks / Lessons Learned

1. **Windows-mount FS truncation (recurring).** Writing files through the sandbox to `D:\` repeatedly truncates large writes mid-line. Concrete cases hit during this build:
   - `server.js` lost its `app.listen(...)` block twice during edits.
   - `_navbar.ejs` got cut off mid-attribute when written via the `Write` tool, producing an "Unexpected token 'catch'" EJS compile error (because the JS that EJS generated had an unclosed brace).
   **Reliable workaround:** write to `/tmp/file` first via a bash heredoc, then `cp /tmp/file /sessions/.../mnt/file`. Single-line appends via `python3 -c "open(p,'a').write(...)"` also survive. Always verify with `tail -c 200 file | od -c` and `node --check` / `ejs.compile()` after large writes.
2. **EJS form-include regex hazard.** When auto-inserting `<%- include('layout/_csrf') %>` into form templates, my first regex `<form\b[^>]*>` greedily stopped at the first `>` — which inside actions like `action="/admin/users/<%= u.id %>/delete"` is the `>` of the `<%= %>` expression. That corrupted 8 templates by splitting the action attribute across the include. **Fix:** match `<form\b[^>]*>` only on lines whose action attribute doesn't contain `<%= %>`, or post-process to re-join attributes. The repair script (in /tmp history) detects the broken pattern `action="…<%= … %>\n\s*<%- include … %>…">` and joins it back.
3. **Express path-to-regexp is case-insensitive by default.** Routes like `/:tag_id([A-Z0-9]{6,12})/...` will match lowercase paths unless `app.set('case sensitive routing', true)` is set. Fixed.
4. **SQLite over a Windows mount in Linux sandbox fails with "disk I/O error"** because of locking semantics. Set `DATABASE_URL=sqlite:////tmp/safetag-dev.db` for sandbox testing. Native Windows SQLite works fine.
5. **`frontend/node_modules` symlink** — I created one in the sandbox pointing to `/tmp/safetag-frontend-nm/node_modules` so I could share an install across runs. That broke npm on Windows (EACCES on mkdir). Fix: `Remove-Item -Force frontend\node_modules` on Windows, then re-run `npm install`. Now in `.gitignore` so it can't recur.
6. **Sandbox `/tmp` is wiped between sessions.** The npm modules I installed at `/tmp/safetag-frontend-nm/node_modules` and the working copy at `/tmp/safetag-frontend/` don't survive a fresh sandbox boot. To re-verify, re-run `npm install --omit=dev` into a `/tmp` directory, then mirror `views/` and `server.js` from the workspace.
7. **Background processes inside `mcp__workspace__bash`** don't survive across calls — each bash invocation is a fresh sandbox. All integration tests must boot both servers and exercise endpoints in a single bash call.
8. **The Render postgres URL prefix** is `postgres://` but SQLAlchemy 1.4+ requires `postgresql://`. `config.py` already rewrites this.
9. **The original "CSRF token missing or invalid" message the user saw** could not be reproduced from our codebase — the string does not appear in any of our Python or JS files. The likely cause was a stale Flask process running an older version of the code from before `WTF_CSRF_ENABLED = False` was set. Regardless, the fix is now bulletproof: CSRF is enforced at the Node.js layer with a clear "Your session expired" message rather than the cryptic Flask-WTF default.

---

## 13. To Do / Future Work

- [ ] Open Razorpay sandbox account; test PAY1 + PAY2 with a real test card; verify signature path.
- [ ] Wire up Twilio sandbox; test `/api/location-alert` actually delivers a WhatsApp message.
- [ ] Add Flask-Migrate migrations (`flask db init/migrate`) — currently `db.create_all()` runs in `seed.py` and on first `python app.py`.
- [ ] Add a `/api/config` JSON endpoint that exposes the Google Maps API key + Razorpay key id so the frontend doesn't have to read those env vars from its own .env (single source of truth in Flask).
- [ ] Implement Cloudinary photo upload on the manufacturer listing form and customer profile edit (currently accepts a URL only).
- [ ] Add the recent activity types from §5.4 ("new registrations, new orders, new manufacturer signups") to the admin recent feed — already done; double-check ordering.
- [ ] Write a Postman / Bruno collection from the route table in §5.
- [ ] Pre-launch checklist (SDD §14): set `DUMMY_PAYMENT=false`, `SESSION_COOKIE_SECURE=true`, remove seed data from prod DB, configure SENTRY_DSN, run an end-to-end real-phone scan.
- [ ] CI: GitHub Actions workflow that boots both services with a SQLite DB and runs the integration smoke suite that lives effectively as the shell snippet in §10.

---

## 14. How to Resume Work in a New Session

1. Read this file first.
2. Check git state: `git status`, `git log --oneline`. Note the **Unpushed changes** list in §11 — there's a follow-up commit pending.
3. **Sanity sweep** before believing anything works:
   ```bash
   # In the Linux sandbox / WSL — verify every EJS template compiles
   cd /tmp && mkdir -p safetag-check && cd safetag-check
   cp -r /sessions/<session>/mnt/safe-tag-project/frontend/{views,package.json} .
   npm install --omit=dev --silent
   node -e "const e=require('ejs'),f=require('fs'),p=require('path');
            function w(d){for(const x of f.readdirSync(d,{withFileTypes:true})){const q=p.join(d,x.name);
            if(x.isDirectory())w(q);else if(q.endsWith('.ejs'))try{e.compile(f.readFileSync(q,'utf8'),{filename:q})}catch(e){console.log('FAIL:',q,'-',e.message.split(String.fromCharCode(10))[0])}}};w('views');console.log('done')"
   ```
4. **Run the integration smoke** from §10 (two terminals on Windows, then in PowerShell):
   ```powershell
   irm http://localhost:3000/emergency/TESTACT1 | sls "Aarav Sharma"
   ```
5. If anything is broken, the most likely culprit is a corrupted file from a previous Windows-mount write — check `tail -c 200` of any recently edited file before debugging logic. See §12.1 and §12.2.
6. **CSRF flow** for new POST forms you might add: include `<%- include('layout/_csrf') %>` (or `'../layout/_csrf'` from subfolders) **inside the `<form>` tag, on its own line, after the opening tag**. Never inside `action="…"` or any attribute value.

---

*SafeTag — Scan. Know. Save a Life. | safe-tag.in | SDD v3.0 | Memory file last updated 2026-05-21 (post-CSRF, post-manufacturer-CTA)*
