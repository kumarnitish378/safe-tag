# SafeTag

> Scan. Know. Save a Life.

SafeTag is a QR + RFID/NFC emergency identity tag platform. One scan opens an emergency profile in under 3 seconds — no app required.

This repository implements the platform exactly as specified in **SDD v3.0**.

---

## Architecture

```
Browser
  ↓  HTML
Node.js + Express + EJS  (this is the entire frontend; lives in /frontend)
  ↓  JSON
Flask REST API           (pure JSON, no HTML rendering; lives in /backend)
  ↓
PostgreSQL  (SQLite in local development)
```

- Flask backend is a **pure REST API** — every route returns `jsonify(...)`. No Jinja, no `render_template`, no HTML.
- Node.js renders every page from `views/*.ejs` and calls Flask for data.
- Browsers may only call Flask directly for two endpoints: `/api/location-alert` and `/api/health`.

---

## Repository layout

```
/backend                  Flask REST API
  app.py                  application factory + all /api/* routes
  models.py               SQLAlchemy models (Tag, MedicalProfile, User, …)
  config.py               env-driven configuration
  extensions.py           shared Flask extensions
  helpers.py              tag id gen, validators, auth decorators
  scripts/
    factory.py            CLI: generate tag batches → CSV
    seed.py               populate dev database with test data
  requirements.txt
  Procfile
  .env.example

/frontend                 Node.js + Express + EJS frontend
  server.js               all routes — calls Flask APIs, renders EJS
  views/
    layout/               base + nav + footer partials
    auth/                 customer login & register
    manufacturer/         manufacturer pages
    admin/                admin pages
    *.ejs                 homepage, store, emergency, register_tag, etc
  public/
    css/safetag.css
  package.json
  .env.example
```

---

## Run locally

### 1. Flask backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate           # Windows
# source .venv/bin/activate      # macOS/Linux
pip install -r requirements.txt
copy .env.example .env           # then edit secrets
python scripts/seed.py           # populates dev DB with test tags + users
python app.py                    # http://localhost:5000
```

Verify:

```
GET  http://localhost:5000/api/health
GET  http://localhost:5000/api/scan/TESTACT1/testkey00001
GET  http://localhost:5000/api/emergency/TESTACT1
GET  http://localhost:5000/api/qr/TESTACT1
```

### 2. Node.js frontend

```bash
cd ../frontend
copy .env.example .env           # set FLASK_API_URL=http://localhost:5000
npm install
node server.js                   # http://localhost:3000
```

Try:

- Homepage: <http://localhost:3000/>
- Store: <http://localhost:3000/store>
- Scan a test tag (active): <http://localhost:3000/TESTACT1/testkey00001> → emergency page
- Scan inactive: <http://localhost:3000/TESTINAC/testkey00002> → registration page
- Customer login: <http://localhost:3000/login> — customer@test.com / Test@1234
- Admin: <http://localhost:3000/admin> — admin@test.com / Admin@1234
- Manufacturer: <http://localhost:3000/manufacturer/login> — mfr@test.com / Test@1234

---

## Generate a batch of tags

```bash
cd backend
python scripts/factory.py --qty 100 --batch "Batch-Jan-2025-Keychains" \
  --manufacturer-email mfr@test.com
```

This inserts 100 fresh tags into the DB and writes a CSV with columns:
`tag_id, security_key, full_url, qr_data, rfid_payload, batch_id, batch_name, created_at`
ready for RFID programming and QR printing.

---

## Deployment (Render.com)

| Service | Type | Build | Start | Root |
|---|---|---|---|---|
| Flask | Web | `pip install -r requirements.txt && flask db upgrade` | `gunicorn app:app --bind 0.0.0.0:$PORT` | `/backend` |
| Node.js | Web | `npm install` | `node server.js` | `/frontend` |
| Database | PostgreSQL addon | — | — | — |

Set the env vars from each `.env.example` in the Render dashboard. Point Node.js at Flask via the internal URL (`FLASK_API_URL=http://safetag-api:5000`).

Pre-launch checklist (from SDD §14):

- [ ] `DUMMY_PAYMENT=false` and Razorpay signature verification implemented (already in `app.py`)
- [ ] `flask db upgrade` has run on production DB
- [ ] Test tags removed from production DB
- [ ] `SENTRY_DSN` configured
- [ ] `SESSION_COOKIE_SECURE=true`
- [ ] Domain points to Render. SSL active.

---

## Git workflow

```bash
git init
git add .
git commit -m "Initial SafeTag implementation per SDD v3.0"
git branch -M main
git remote add origin https://github.com/kumarnitish378/safe-tag.git
git checkout -b feat/initial-build
git push -u origin feat/initial-build
```

Then open a PR from `feat/initial-build` → `main` on GitHub.

---

*SafeTag — Scan. Know. Save a Life. | safe-tag.in | SDD v3.0*
