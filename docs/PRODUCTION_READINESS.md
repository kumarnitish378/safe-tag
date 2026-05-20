# Safe-Tag Production Readiness

This document captures the current state of the project, the Phase 1 changes just applied, and the remaining Phase 2/3 work needed for production.

## Current status

- Flask application skeleton exists with authentication, tag activation, profile setup, public emergency view, mock payments, and alert stubs.
- The app now includes server-side validation for:
  - registration
  - login
  - tag activation
  - profile setup/edit
- CSRF protection is enabled for all server-side HTML forms using `Flask-WTF`.
- Session cookies are hardened with `HttpOnly`, `SameSite=Lax`, and optional `SESSION_COOKIE_SECURE` via environment variable.
- All forms in `register.html`, `login.html`, `activate.html`, and `setup_profile.html` now include `{{ csrf_token() }}`.

## Phase 1 — Implemented

- [x] Form-level CSRF protection for user-facing POST routes
- [x] Server-side validation for user input and phone normalization
- [x] Profile editing flow supported via `/setup-profile/<tag_id>` for active tags
- [x] Improved activation validation for serial numbers
- [x] Added `Flask-WTF` to `requirements.txt`
- [x] Added documentation and production checklist guidance

## Phase 2 — Operational readiness (remaining)

- [x] Add an admin dashboard to manage orders, inventory, and fulfillment
- [x] Build an order model and purchase history tracking
- [ ] Add shipment / dispatch state for purchased tags
- [ ] Add QR generation and tag printing workflow in the admin area
- [ ] Add event/reporting logs for alerts, failed payments, and abuse
- [ ] Integrate real WhatsApp dispatch with Twilio or Meta Cloud API

## Migration setup

- [x] Added Flask-Migrate integration
- [x] Created `migrations/` repository and initial migration script
- [x] Stamped the current SQLite schema to the latest migration revision
- [x] Local dev SQLite database is stored at `instance/safe_tag_dev.db`
- [x] Added CLI admin user creation via `flask --app app create-admin`
- [x] Added development seed script support for an admin user

## Phase 3 — Go-live production roll-out (remaining)

- [ ] Replace mock payment flow with Razorpay order creation and signature verification
- [ ] Configure and secure Render deployment with production database
- [ ] Disable Flask debug mode in production
- [ ] Add monitoring, error reporting, and background job handling if needed
- [ ] Add email verification or password reset flows for customer accounts

## Deployment notes

- `Procfile` is ready for Render: `gunicorn app:app --workers 2 --timeout 60 --bind 0.0.0.0:$PORT`
- Use `.env.example` as a template for environment variables.
- In production, set `SESSION_COOKIE_SECURE=true` when using HTTPS.
- A PostgreSQL `DATABASE_URL` should be configured for live deployment.
