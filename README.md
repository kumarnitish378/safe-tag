# SafeTag

> Scan. Know. Save a Life.

SafeTag is a QR + RFID/NFC emergency identity tag platform. One scan opens an emergency profile in under 3 seconds — no app required.

This repository implements the platform as specified in **SDD v3.0**.

---

## Architecture

```
Browser
  ↓  HTML
Node.js + Express + EJS  (single process — handles routing, auth, DB)
  ↓
Prisma ORM
  ↓
SQLite (dev)  /  PostgreSQL (production)
```

Single Node.js process serves all pages and API endpoints. No separate backend service.

---

## Repository layout

```
/
  server.js               all routes — auth, admin, manufacturer, store, tags
  lib/
    db.js                 Prisma client singleton
    helpers.js            generators, validators, formatters
  views/
    layout/               base + navbar + footer partials
    auth/                 customer login & register
    manufacturer/         manufacturer portal pages
    admin/                admin dashboard pages
    *.ejs                 homepage, store, emergency, register_tag, etc.
  public/
    css/safetag.css
  prisma/
    schema.prisma         Prisma data model (7 models)
    seed.js               dev seed — test users, tags, profiles
    migrations/           auto-generated migration SQL
  package.json
  .env.example
```

---

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
copy .env.example .env
```

Minimum required values (already set in `.env.example` for local dev):

| Variable | Default | Notes |
|---|---|---|
| `NODE_SESSION_SECRET` | *(set a 64-char hex string)* | Any random string works for dev |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite file path |
| `PORT` | `3000` | |
| `BASE_URL` | `http://localhost:3000` | |
| `DUMMY_PAYMENT` | `true` | Skips Razorpay in dev |

### 3. Create database and seed

```bash
npx prisma migrate dev --name init
```

This creates `prisma/dev.db`, applies the schema, and auto-runs the seed script.

To re-seed an existing database:

```bash
npx prisma db seed
```

### 4. Start the server

```bash
npm start
# or
node server.js
```

Server runs at **http://localhost:3000**

---

## Test credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@test.com` | `Admin@1234` |
| Customer | `customer@test.com` | `Test@1234` |
| Manufacturer | `mfr@test.com` | `Test@1234` |

### Test tags

| Tag ID | Security Key | State |
|---|---|---|
| `TESTACT1` | `testkey00001` | Active — has full profile (Ravi Kumar, O+) |
| `TESTINAC` | `testkey00002` | Inactive — triggers registration flow |

---

## Key URLs

### Public

| URL | Description |
|---|---|
| `http://localhost:3000/` | Homepage |
| `http://localhost:3000/store` | Product store |
| `http://localhost:3000/TESTACT1/testkey00001` | Scan active tag → emergency page |
| `http://localhost:3000/TESTINAC/testkey00002` | Scan inactive tag → registration flow |

### Customer

| URL | Description |
|---|---|
| `http://localhost:3000/login` | Customer login |
| `http://localhost:3000/register` | Customer registration |
| `http://localhost:3000/dashboard` | My tags |
| `http://localhost:3000/orders` | My orders |
| `http://localhost:3000/account` | Account settings |

### Manufacturer

| URL | Description |
|---|---|
| `http://localhost:3000/manufacturer/login` | Manufacturer login |
| `http://localhost:3000/manufacturer/register` | Manufacturer registration |
| `http://localhost:3000/manufacturer/dashboard` | Manufacturer dashboard |
| `http://localhost:3000/manufacturer/batches/new` | Create a new tag batch |
| `http://localhost:3000/manufacturer/listings` | Manage product listings |

### Admin

| URL | Description |
|---|---|
| `http://localhost:3000/admin` | Admin dashboard |
| `http://localhost:3000/admin/users` | Manage users |
| `http://localhost:3000/admin/manufacturers` | Approve / block manufacturers |
| `http://localhost:3000/admin/store` | Approve / feature products |
| `http://localhost:3000/admin/orders` | View all orders |

---

## Database

### Prisma Studio (GUI)

```bash
npm run db:studio
# opens http://localhost:5555
```

### Reset and re-seed

```bash
# Delete existing DB and re-run migration + seed from scratch
Remove-Item prisma\dev.db -ErrorAction SilentlyContinue   # Windows
npx prisma migrate dev --name init
```

### Models

| Model | Table | Description |
|---|---|---|
| `Tag` | `tags` | QR/RFID tag records |
| `MedicalProfile` | `medical_profiles` | Emergency info linked to a tag |
| `User` | `users` | Customer accounts |
| `Manufacturer` | `manufacturers` | Manufacturer accounts |
| `TagBatch` | `tag_batches` | Groups of tags created together |
| `ProductListing` | `product_listings` | Store products |
| `Order` | `orders` | Customer purchases |

---

## Payment

Set `DUMMY_PAYMENT=true` (default) to skip Razorpay and create orders directly. Set to `false` and supply `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` for real payments.

---

## Deployment (Render.com)

| Setting | Value |
|---|---|
| Environment | Node |
| Build command | `npm install && npx prisma migrate deploy` |
| Start command | `node server.js` |
| Root directory | `/` (project root) |

Switch `DATABASE_URL` to a PostgreSQL connection string in the Render environment dashboard.

Pre-launch checklist (SDD §14):

- [ ] `DUMMY_PAYMENT=false` and Razorpay key/secret configured
- [ ] `NODE_SESSION_SECRET` set to a random 64-char hex string
- [ ] `NODE_ENV=production`
- [ ] `npx prisma migrate deploy` run against production DB
- [ ] Test tags removed from production DB
- [ ] `SENTRY_DSN` configured
- [ ] Domain points to Render, SSL active

---

*SafeTag — Scan. Know. Save a Life. | SDD v3.0*
