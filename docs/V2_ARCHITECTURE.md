# SafeTag v2 — Multi-Type Tag Platform (Architecture Plan)

Status: **planning** · Branch: `feat/multi-type-tags` · Merges to `master` only via reviewed PR.

This plan turns SafeTag from emergency-only into a multi-type smart-tag platform
**without touching the live medical flow**. The guiding constraint: existing
production medical tags must keep working byte-for-byte.

---

## 1. Core model

A tag's **type is fixed at manufacture (batch level)**. Every type belongs to one
of four **interaction classes**, which decide what a scan does:

| Class | Scan behaviour | Privacy |
|---|---|---|
| Display | shows owner info | `reveal-on-scan` (or `contact-relay`) |
| Collect | scanner submits data to owner | `public-submit` |
| Redirect | sends scanner to a URL/action | `public-redirect` |
| Access | identity / entry / attendance | `restricted` |

---

## 2. Schema changes (additive — no destructive migration)

```prisma
model TagBatch {
  // ...existing...
  tagType String @default("medical") @map("tag_type")   // NEW — chosen at batch creation
}

model Tag {
  // ...existing...
  tagType String @default("medical") @map("tag_type")   // NEW — inherited from batch
  // existing 1:1 medical profile stays:
  profile        MedicalProfile?
  genericProfile TagProfile?                              // NEW (non-medical types)
  submissions    Submission[]                             // NEW (collect types)
}

// Generic profile for ALL NON-medical types. Medical stays on MedicalProfile
// untouched, so the life-safety path carries zero regression risk.
model TagProfile {
  id        Int      @id @default(autoincrement())
  tagId     String   @unique @map("tag_id")
  type      String                                        // mirrors Tag.tagType
  data      Json                                          // type-specific fields
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  tag       Tag      @relation(fields: [tagId], references: [tagId])
  @@map("tag_profiles")
}

// Inbound data for Collect-class types (survey, feedback, RSVP, lead, complaint)
model Submission {
  id        Int      @id @default(autoincrement())
  tagId     String   @map("tag_id")
  data      Json
  createdAt DateTime @default(now()) @map("created_at")
  tag       Tag      @relation(fields: [tagId], references: [tagId])
  @@map("submissions")
}
```

**Why dual profile tables (MedicalProfile + TagProfile):** the medical render,
validation, and emergency page are mature and life-critical. Re-homing them onto a
JSON blob risks regressions on the page that matters most. New types use the
generic JSON table; medical is left exactly as-is. Unifying later is optional cleanup.

`Json` works on both SQLite (local) and PostgreSQL (Render) via Prisma, so the
`patch-schema-for-prod.js` dual-DB strategy is unaffected.

**Migration safety:** `tagType` defaults to `"medical"`, so every existing tag and
batch becomes `medical` automatically → existing scans behave identically.

---

## 3. Type registry (`lib/tagTypes.js`)

One declarative module is the single source of truth per type. Adding a type =
add a registry entry + a page template (and a form partial if custom). This is the
"custom template = manual service" mechanism — first-party code, no uploads.

```js
module.exports = {
  medical: {
    label: 'Medical Emergency',
    interaction: 'display', privacy: 'reveal-on-scan',
    store: 'medical',            // uses the legacy MedicalProfile path
    pageView: 'emergency',       // existing view, unchanged
    // form + validation already handled by existing register route
  },
  vcard: {
    label: 'Digital Visiting Card',
    interaction: 'display', privacy: 'public',
    store: 'generic',
    fields: [
      { name: 'name',    label: 'Full name', type: 'text',  required: true, max: 100 },
      { name: 'title',   label: 'Title',     type: 'text' },
      { name: 'company', label: 'Company',   type: 'text' },
      { name: 'phone',   label: 'Phone',     type: 'mobile' },
      { name: 'email',   label: 'Email',     type: 'email' },
      { name: 'links',   label: 'Links',     type: 'list' },
    ],
    pageView: 'types/vcard',
  },
  vehicle: {
    label: 'Car / Vehicle Owner',
    interaction: 'display', privacy: 'contact-relay',
    store: 'generic',
    fields: [
      { name: 'name',       label: 'Owner name',     type: 'text', required: true },
      { name: 'vehicleNo',  label: 'Vehicle number', type: 'text', required: true },
      { name: 'contact',    label: 'Contact (hidden)', type: 'mobile', required: true },
    ],
    pageView: 'types/vehicle',
  },
  url: {
    label: 'Smart Link',
    interaction: 'redirect', privacy: 'public-redirect',
    store: 'generic',
    fields: [{ name: 'url', label: 'Destination URL', type: 'url', required: true }],
    // presets (google-review, upi, whatsapp, social) just prefill `url`
  },
  survey: {
    label: 'Survey / Feedback',
    interaction: 'collect', privacy: 'public-submit',
    store: 'generic',                    // owner-defined questions in data
    pageView: 'types/survey',
  },
  // pet, lostfound, catalog ... (all generic/display)
};
```

A generic field renderer (`views/types/_form.ejs`) builds the registration form
from `fields[]`, and a generic validator validates from the same definitions — so
most new types need **only a registry entry + a page view**, no new route code.

---

## 4. Scan routing (`GET /t/:code`)

Keep the existing case-insensitive rescue, then dispatch on `tag.tagType`:

```
find tag (+ case-insensitive rescue)         // unchanged from v1
if !tag -> 404
increment scanCount                          // unchanged
const t = registry[tag.tagType]

if !tag.isActive -> redirect /register/:code  // renders t's form

switch (t.interaction):
  display  -> render t.pageView with profile (medical->MedicalProfile, else TagProfile.data)
  redirect -> 302 to data.url
  collect  -> render submit form (t.pageView)
  access   -> identity/attendance handling
```

`medical` falls through to the **existing** emergency path → no behaviour change.

---

## 5. Registration (`/register/:code`)

- GET: look up `tag.tagType`, render its form (medical = existing view; others =
  generic `_form.ejs` from `fields[]`).
- POST: validate from `fields[]`; write to `MedicalProfile` (medical) or
  `TagProfile { type, data }` (others); set `tag.isActive`, `activatedAt`, owner.

Type-switching after activation is **not** offered (type is fixed at manufacture).

---

## 6. Manufacturer batch flow

- Batch-new form gains a **Tag Type** selector (from the registry's first-party list).
- `TagBatch.tagType` saved; generated tags inherit `tag.tagType`.
- Pricing/payment flow unchanged.
- CSV/QR endpoints unchanged (QR still encodes `/t/:code`; the landing page differs by type).

---

## 7. Collect-class handling

- Public submit form → `POST /t/:code/submit` → `Submission { tagId, data }`.
- Owner views responses in dashboard. Rate-limit + CSRF-exempt public POST with
  basic anti-spam (honeypot / simple throttle).

---

## 8. Privacy enforcement

Centralise in the scan dispatcher, never per-template:
- `reveal-on-scan` — show info (medical, pet, lostfound)
- `contact-relay` — show "Notify owner" action; never render the raw number (vehicle)
- `public` / `public-redirect` / `public-submit` — fully public
- `restricted` (access) — gated; not a public reveal

---

## 9. Testing strategy

- **Regression first:** existing medical scan/register/emergency tests stay green
  (they already cover the v1 path + case rescue).
- Per new type: scan-routing test (active → correct landing, inactive → register),
  register validation test, privacy test (e.g. vehicle never leaks the number).
- Registry-driven form/validator gets unit tests once, reused by all types.
- CI `Build & verify` must pass before the PR can merge (branch protection).

---

## 10. Phased delivery

1. **Foundation** — schema (`tagType`, `TagProfile`, `Submission`), registry,
   scan dispatcher, generic form/validator. Medical untouched. *(largest step)*
2. **Phase-1 types** — vcard, vehicle, pet, lostfound, catalog, url, survey.
3. **Batch type selector** + manufacturer UI + per-type activation manuals.
4. **Backlog types** enabled on demand / via custom service.

Each phase = its own PR, reviewed, CI-green, then merged to master.
