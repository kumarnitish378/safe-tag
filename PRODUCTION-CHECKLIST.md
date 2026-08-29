# SafeTag — Production Readiness Checklist

Status of the live deployment (Render + Neon). **Payments run in Razorpay TEST
mode** by design — no real money is charged.

---

## 1. Render environment variables (set in the dashboard)

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | enables built CSS, view cache, HSTS |
| `SECURE_COOKIES` | `true` | secure session cookies (HTTPS only) |
| `NODE_SESSION_SECRET` | 64-char random hex | Render can auto-generate; must NOT be the dev placeholder |
| `DATABASE_URL` | Neon **pooled** string | app runtime (see `.env.production`) |
| `DATABASE_URL_UNPOOLED` | Neon **direct** string | migrations / `prisma db push` |
| `BASE_URL` | `https://safe-tag.onrender.com` | canonical URLs, QR codes, emails |
| `DUMMY_PAYMENT` | `false` | use real Razorpay checkout UI (TEST keys → no real charge) |
| `RAZORPAY_KEY_ID` | `rzp_test_…` | **TEST** key — keep test until go-live |
| `RAZORPAY_KEY_SECRET` | test secret | **TEST** secret |
| `RAZORPAY_WEBHOOK_SECRET` | webhook signing secret | set the same value in the Razorpay dashboard webhook |
| `GOOGLE_MAPS_API_KEY` | maps key | emergency-page location link |
| `SMTP_HOST` | `smtp.gmail.com` | approval emails |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | Gmail address | |
| `SMTP_PASS` | Gmail **App Password** | requires 2FA on the account |
| `ADMIN_EMAIL` | admin inbox | receives manufacturer approval requests |

> **Payment = TEST mode.** With `DUMMY_PAYMENT=false` + `rzp_test_` keys, the
> Razorpay modal shows a "Test Mode" badge and accepts test cards/UPI without
> charging. To go live later: swap in `rzp_live_` keys (and update the webhook).

## 2. Handled in code (no action needed)
- **Security headers** — `helmet` (HSTS, nosniff, frameguard SAMEORIGIN, referrer-policy). CSP intentionally off (inline scripts + Razorpay/Maps/Fonts).
- **Rate limiting** — `express-rate-limit` on `/login`, `/register`, `/manufacturer/login`, `/manufacturer/register`, `/manufacturer/request-approval` (30 / 15 min / IP).
- **Sessions** — persistent Prisma-backed store (survives restarts; no MemoryStore).
- **CSRF** — hand-rolled per-session token on all POST forms.
- **CSS** — production serves the committed `safetag.build.css` (Tailwind CDN only in dev).
- **Reverse proxy** — `trust proxy = 1`; secure cookies work behind Render.
- **Errors** — custom 404/500 pages; no stack traces leaked to clients.
- **Compression** — gzip via `compression`.
- **DB** — Neon (Lakebase Postgres); schema pushed at build via `patch-schema-for-prod.js` (adds `directUrl`).

## 3. Post-deploy verification
- [ ] `https://safe-tag.onrender.com/` loads the new design (theme.css, Material icons)
- [ ] `/store` shows 5 products; a product page opens
- [ ] Admin login works (`/login` → `/admin`)
- [ ] A manufacturer approval request emails `ADMIN_EMAIL`
- [ ] A test payment completes with a Razorpay test card
- [ ] Response headers include `Strict-Transport-Security` and `X-Content-Type-Options`

## 4. Known / deferred
- Blog is served separately at `www.sftg.in/blog/` (GitHub Pages).
- Custom domain `sftg.in` not yet connected (see the domain setup plan).
- `DEMO-CREDENTIALS.md` documents **local** seed accounts only — they don't exist in production.
