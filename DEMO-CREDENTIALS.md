# SafeTag — Demo Credentials (local dev only)

> ⚠️ These are **local development seed accounts** created by `prisma/seed.js`.
> They only exist in your local SQLite DB (`prisma/dev.db`) — **not** in
> production. Do not use these passwords for any real/production account.

Base URL (local): **http://localhost:3000**  (`npm start`)

## Login accounts

| Role | Email | Password | Signs in at |
|---|---|---|---|
| **Admin** | `admin@test.com` | `Admin@1234` | `/login` → then `/admin` |
| **Customer** | `customer@test.com` | `Test@1234` | `/login` → then `/dashboard` |
| **Manufacturer** | `mfr@test.com` (Test Workshop, approved) | `Test@1234` | `/manufacturer/login` → `/manufacturer/dashboard` |

## Demo scan pages (no login needed)
Open these to see each tag-type landing page:

| Type | URL |
|---|---|
| Medical / Emergency | http://localhost:3000/demo  ·  http://localhost:3000/t/TESTACT1 |
| Digital Visiting Card | http://localhost:3000/t/demoVcard |
| Vehicle Owner (contact-relay) | http://localhost:3000/t/demoVehcl |
| Pet ID | http://localhost:3000/t/demoPet01 |
| Lost & Found (contact-relay) | http://localhost:3000/t/demoLost1 |
| Product Catalog / Business | http://localhost:3000/t/demoCatlg |
| Social Media Hub | http://localhost:3000/t/demoSocl1 |
| Survey / Feedback | http://localhost:3000/t/demoSrvy1 |
| Smart Link (redirect) | http://localhost:3000/t/demoUrl01 |
| Registration form (inactive tag) | http://localhost:3000/register/demoNew01 |

## Re-seed the demo data
If the accounts/tags are missing (e.g. after a DB reset), run:

```bash
node prisma/seed.js
```

This (re)creates the three accounts above (idempotent upserts) plus sample
products. Passwords are hashed with bcrypt from `Admin@1234` / `Test@1234`.
