# SafeTag — Claude Developer Guide

This file exists so every new Claude session starts with full project context. Update it whenever a design decision is finalized or a convention changes.

---

## Project Overview
SafeTag is a Node.js/Express + EJS SSR app for emergency QR+NFC identity tags sold in India. A first responder scans the physical tag → immediately sees blood group, allergies, and emergency contacts — no app required on either side.

- **Live URL**: https://safe-tag.onrender.com
- **Domain**: sftg.in (purchased, not yet connected — Cloudflare Worker proxy ready, pending deployment)
- **Admin email**: support@safe-tag.in
- **Trademark**: SAFETAG applied/refused in India Class 9 (electrical accessories) — clear to use for emergency identity tags

---

## Tech Stack
| Layer | Tech |
|---|---|
| Runtime | Node.js 20, Express 4 |
| Templating | EJS — shared layout in `views/layout/` |
| Database | SQLite (local dev) / PostgreSQL (Render) via Prisma ORM |
| Auth | bcrypt + express-session (stored in SQLite/PostgreSQL) |
| CSS | Tailwind v3 CLI (build) / CDN (dev) |
| QR codes | `qrcode` npm package — server-side PNG generation |
| Payments | Razorpay (production) / DUMMY_PAYMENT=true (dev) |
| Email | nodemailer + Gmail SMTP — HTML transactional emails |
| Deployment | Render.com free tier |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`) |

---

## Running Locally

### Development (no build needed — CDN loads all Tailwind classes)
```bash
node server.js
# http://localhost:3000
```

### Production-like (built CSS)
```powershell
npm run build:css
$env:NODE_ENV='production'; node server.js
```

### Local env vars (`.env` — never commit)
```
DATABASE_URL=file:./prisma/dev.db
NODE_SESSION_SECRET=<64-char hex>
DUMMY_PAYMENT=true
BASE_URL=http://localhost:3000
SMTP_USER=your@gmail.com
SMTP_PASS=<gmail app password>
ADMIN_EMAIL=nitish.ns378@gmail.com
```

---

## Dual-Database Strategy (SQLite local ↔ PostgreSQL on Render)
- `prisma/schema.prisma` keeps `provider = "sqlite"` so local dev works with `file:./prisma/dev.db`
- **Render build** runs `node scripts/patch-schema-for-prod.js` first — swaps `sqlite → postgresql` before `prisma generate` and `prisma db push`
- This is permanent and requires no maintenance — never manually change `provider` in schema.prisma
- Render build command (set in Render dashboard — render.yaml is ignored for manually-created services):
  ```
  npm ci --include=dev && node scripts/patch-schema-for-prod.js && npx prisma generate && npx tailwindcss -i ./public/css/input.css -o ./public/css/safetag.build.css --minify && npx prisma db push
  ```

---

## CSS Build System
- Source: `public/css/input.css` → Output: `public/css/safetag.build.css`
- `safetag.build.css` **IS committed** to the repo so Render can serve it without installing devDeps
- **After any template changes that add new Tailwind classes**: run `npm run build:css` and commit the updated CSS file
- Dev/prod switch: `IS_PROD = process.env.NODE_ENV === 'production'` set in `server.js` → `res.locals` → `_head.ejs`
- Component CSS (`.card`, `.btn-brand`, `.input`, `.label`, dark mode overrides, etc.) lives in the `<style>` block inside `views/layout/_head.ejs`

---

## Commit Convention
**Every commit** must end with exactly this line (no exceptions):
```
Co-Authored-By: Nitish | Claude
```
Do NOT use the default `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

---

## Branch Strategy
- `master` — production, auto-deploys to Render on push
- Create `feat/` branches for new work; merge to master locally (no GitHub PR needed)

---

## Finalized Designs — DO NOT CHANGE

### Emergency Page (`/e/:token` and `/demo`)
Clean single-page medical ID card layout. Key rules:
- Header background: teal `#0D9488`
- Card body: white
- Patient name: **navy `#0A2342` with `!important`** — must have high contrast, never faded
- Location/alert button label: **"🆘 Alert Emergency Contact via WhatsApp"** — not "Share My Location" (sounds like surveillance)
- Logo in header: **inline SVG price-tag icon** (`stroke="white"`) — NOT `<img>` (causes white box on teal)
- No multi-theme swipe cards; no red alert bars

### Auth Pages (`/login` and `/register`)
Split-screen layout:
- **Left panel** (desktop only): dark navy `#0A2342` background, SafeTag logo, tagline, 4 trust-signal bullet points
- **Right panel**: white background, centered form — always white even in dark mode
- No full site navbar or footer (`hideNav: true, hideFooter: true` passed from route)
- Mobile: stacked (just logo above the form)
- DO NOT revert to the card-on-dark-background layout

---

## Security Rules
- **NEVER commit `.env`** — it contains real SMTP credentials and session secret
- `NODE_SESSION_SECRET` must be a real 64-char hex string in production (not a placeholder)
- CSRF tokens: always include `<%- include('../layout/_csrf') %>` in every POST form
- Session cookies: `secure` flag controlled by `SECURE_COOKIES=true` env var (NOT NODE_ENV) — set this in Render dashboard

---

## SEO Setup (in `_head.ejs` and home route)
- Meta title/description: customisable per-route via `title` and `seoDesc` locals; defaults set in `_head.ejs`
- Title target: 50–60 chars. Description target: 145–155 chars.
- OG tags: title, description, image, url, locale (`en_IN`), site_name
- Twitter card: `summary_large_image`
- Canonical URL: `<%= baseUrl + path %>`
- JSON-LD: Organization schema + WebSite schema (with SearchAction for Sitelinks Searchbox)
- No `sameAs` social links in Organization schema unless accounts are verified

---

## QR Code System
- **Package**: `qrcode` (already in dependencies)
- **Live endpoint**: `GET /qr/:tagId` — public, no auth, returns 300×300 navy-on-white PNG
  - Encodes `${BASE_URL}/t/${tagId}` as the QR URL
  - Cached 24h (`Cache-Control: public, max-age=86400`)
  - Used as `<img src="/qr/SFTG-XXXX">` in batch detail table
- **CSV download** (`GET /manufacturer/batch/:id/csv`):
  - Always includes `qr_image_url` column (URL to the `/qr/:tagId` endpoint)
  - Batches ≤ 500 tags: also includes `qr_png_base64` column (raw base64 PNG, ~2 KB/tag)
  - Batches > 500: `qr_image_url` only (avoids slow generation timeout)

---

## Manufacturer Batch Payment Flow
1. `POST /manufacturer/batch/new` → always creates **pending** batch → redirects to `/pay` page
2. `GET /manufacturer/batch/:id/pay`:
   - **DUMMY_PAYMENT=true** (dev): shows "Simulate Payment" button, no Razorpay
   - **Production**: shows Razorpay checkout modal
3. `POST /manufacturer/batch/:id/pay-verify`:
   - DUMMY: skips signature check, marks paid, generates tags
   - Real: verifies Razorpay signature, marks paid, generates tags
4. Both paths redirect to batch detail page with success flash
5. Tags are **never** generated before payment is confirmed

### Pricing tiers
| Quantity | Rate |
|---|---|
| 1–100 | ₹5.00 / tag |
| 101–1,000 | ₹3.00 / tag |
| 1,001–10,000 | ₹1.50 / tag |

---

## Email (nodemailer + Gmail SMTP)
- Config: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` env vars
- `SMTP_PASS` must be a **Gmail App Password** (not regular password) — requires 2FA enabled
- All `sendMail` calls are wrapped in `Promise.race` with a 10s timeout to prevent route hanging
- nodemailer options include `connectionTimeout`, `greetingTimeout`, `socketTimeout` to fail fast
- Emails use HTML templates with inline CSS (no external stylesheets — email clients strip them)
- `ADMIN_EMAIL` fallback: `nitish.ns378@gmail.com`

---

## Render.com Environment Variables (set in dashboard)
| Variable | Value |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NODE_SESSION_SECRET` | auto-generated by Render |
| `BASE_URL` | `https://safe-tag.onrender.com` |
| `DUMMY_PAYMENT` | `true` (change to `false` when Razorpay live keys are ready) |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail App Password |
| `ADMIN_EMAIL` | `nitish.ns378@gmail.com` |
| `SECURE_COOKIES` | `true` |

---

## Key File Map
```
server.js              — Express app, all routes, session config, res.locals
scripts/
  patch-schema-for-prod.js  — Render build step: patches sqlite→postgresql in schema.prisma
lib/
  helpers.js           — formatBatch, formatProduct, calcBatchPrice, etc.
  db.js                — Prisma client singleton
views/
  layout/
    _head.ejs          — <head>, SEO meta, JSON-LD, Tailwind, component CSS, dark mode, navbar
    _navbar.ejs        — site navigation
    _foot.ejs          — </main>, optional footer, </body></html>
    _footer.ejs        — full site footer content
    _csrf.ejs          — CSRF hidden input
  auth/
    login.ejs          — split-screen login (hideNav, hideFooter)
    register.ejs       — split-screen register (hideNav, hideFooter)
  emergency.ejs        — public emergency page (no auth, scanned by anyone)
  dashboard/           — authenticated user pages
  admin/               — admin-only pages
  manufacturer/
    dashboard.ejs      — manufacturer home, batches list, approval request
    batch_new.ejs      — new batch form with pricing tiers + live price calculator
    batch_payment.ejs  — payment page (Razorpay or Simulate button in dev)
    batch_detail.ejs   — tag list with QR thumbnails, status filter, page-size selector
public/
  css/
    input.css          — Tailwind entry point
    safetag.css        — custom classes (imported via input.css)
    safetag.build.css  — COMMITTED built output
  images/
    og-homepage.jpg    — Open Graph image for homepage
  js/                  — client-side JS
prisma/
  schema.prisma        — DB schema (provider=sqlite locally; patched to postgresql on Render)
cloudflare-worker/
  proxy.js             — sftg.in → safe-tag.onrender.com proxy (PENDING deployment)
```
