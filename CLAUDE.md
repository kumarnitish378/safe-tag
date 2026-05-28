# SafeTag — Claude Developer Guide

This file exists so every new Claude session starts with full project context. Update it whenever a design decision is finalized or a convention changes.

---

## Project Overview
SafeTag is a Node.js/Express + EJS SSR app for emergency QR+NFC identity tags sold in India. A first responder scans the physical tag → immediately sees blood group, allergies, and emergency contacts — no app required on either side.

- **Live URL**: https://safe-tag.onrender.com
- **Domain** (pending): sftg.in (GoDaddy clientHold resolution needed)
- **Admin email**: support@safe-tag.in

---

## Tech Stack
| Layer | Tech |
|---|---|
| Runtime | Node.js 20, Express 4 |
| Templating | EJS — shared layout in `views/layout/` |
| Database | SQLite via Prisma ORM |
| Auth | bcrypt + express-session (stored in SQLite) |
| CSS | Tailwind v3 CLI (build) / CDN (dev) |
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
- `feat/ux-improvements-v2` — active branch for UX improvements
- Create `feat/` branches for new work; merge to master locally (no GitHub PR needed — user can't create GitHub PRs from this account)

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
- **Left panel** (desktop only): dark navy `#0A2342` background, SafeTag logo, tagline "Emergency identity. One scan.", 4 trust-signal bullet points
- **Right panel**: white background, centered form — always white even in dark mode
- No full site navbar or footer (`hideNav: true, hideFooter: true` passed from route)
- Mobile: stacked (just logo above the form)
- DO NOT revert to the card-on-dark-background layout

---

## Security Rules
- **NEVER commit `.env`** — it contains real SMTP credentials and session secret
- `NODE_SESSION_SECRET` must be a real 64-char hex string in production (not a placeholder)
- CSRF tokens: always include `<%- include('../layout/_csrf') %>` in every POST form

---

## Render.com Deployment
- Build command: `npm ci --include=dev && npx prisma generate && npx tailwindcss -i ./public/css/input.css -o ./public/css/safetag.build.css --minify && npx prisma db push`
- `safetag.build.css` being pre-committed means the CSS still serves even if the build step fails (fallback)
- Set `RENDER_DEPLOY_HOOK` in GitHub Secrets to enable gated deploys via CI

---

## Key File Map
```
server.js              — Express app, all routes, session config, res.locals
views/
  layout/
    _head.ejs          — <head>, Google Fonts, IS_PROD CSS switch, component CSS, dark mode, navbar
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
  manufacturer/        — manufacturer portal
public/
  css/
    input.css          — Tailwind entry point
    safetag.css        — custom classes (imported via input.css)
    safetag.build.css  — COMMITTED built output
  js/                  — client-side JS
prisma/
  schema.prisma        — DB schema
  migrations/          — Prisma migrations
```
