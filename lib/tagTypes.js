/**
 * Tag-type registry — single source of truth for every NON-medical tag type.
 *
 * Each type declares its interaction class, privacy rule, the form fields used
 * for registration, and the EJS view that renders the scan landing page. Adding
 * a new first-party type = add an entry here (+ a view). No uploadable templates.
 *
 * `medical` is intentionally NOT defined here — it keeps its mature, dedicated
 * MedicalProfile + emergency.ejs path untouched. The scan/register routes treat
 * `medical` as a special case and everything else through this registry.
 *
 * Interaction classes: display | redirect | collect | access
 * Privacy rules:       reveal-on-scan | contact-relay | public | public-redirect | public-submit
 */

const { normaliseMobile, isValidMobile, isValidEmail } = require('./helpers');

// ---------------------------------------------------------------------------
// Field validation — one validator per field `type`
// ---------------------------------------------------------------------------

function validateField(f, raw) {
  const val = raw == null ? '' : String(raw).trim();

  if (!val) {
    if (f.required) return { error: `${f.label} is required` };
    return { value: f.type === 'list' ? [] : null };
  }

  switch (f.type) {
    case 'text':
    case 'textarea': {
      if (f.max && val.length > f.max) return { error: `${f.label} must be ≤ ${f.max} characters` };
      if (f.min && val.length < f.min) return { error: `${f.label} must be ≥ ${f.min} characters` };
      return { value: val };
    }
    case 'mobile': {
      if (!isValidMobile(val)) return { error: `${f.label} must be a valid 10-digit Indian mobile` };
      return { value: normaliseMobile(val) };
    }
    case 'email': {
      if (!isValidEmail(val)) return { error: `${f.label} is not a valid email` };
      return { value: val };
    }
    case 'url': {
      if (!/^https?:\/\/.+/i.test(val)) return { error: `${f.label} must start with http:// or https://` };
      if (val.length > 2000) return { error: `${f.label} is too long` };
      return { value: val };
    }
    case 'number': {
      const n = parseInt(val, 10);
      if (isNaN(n)) return { error: `${f.label} must be a number` };
      if (f.min != null && n < f.min) return { error: `${f.label} must be ≥ ${f.min}` };
      if (f.max != null && n > f.max) return { error: `${f.label} must be ≤ ${f.max}` };
      return { value: n };
    }
    case 'select': {
      if (f.options && !f.options.includes(val)) return { error: `${f.label} is invalid` };
      return { value: val };
    }
    case 'list': {
      const items = val.split('\n').map(s => s.trim()).filter(Boolean);
      if (f.max && items.length > f.max) return { error: `${f.label}: max ${f.max} items` };
      return { value: items };
    }
    default:
      return { value: val };
  }
}

// ---------------------------------------------------------------------------
// Type registry
// ---------------------------------------------------------------------------

const TAG_TYPES = {
  vcard: {
    label: 'Digital Visiting Card',
    icon: 'badge',
    interaction: 'display',
    privacy: 'public',
    pageView: 'types/vcard',
    tagline: 'Share your contact details with one tap.',
    fields: [
      { name: 'name',    label: 'Full name',  type: 'text',     required: true, max: 100 },
      { name: 'title',   label: 'Job title',  type: 'text',     max: 100 },
      { name: 'company', label: 'Company',    type: 'text',     max: 100 },
      { name: 'phone',   label: 'Phone',      type: 'mobile' },
      { name: 'email',   label: 'Email',      type: 'email' },
      { name: 'website', label: 'Website',    type: 'url' },
      { name: 'about',   label: 'About',      type: 'textarea', max: 500 },
    ],
  },

  vehicle: {
    label: 'Car / Vehicle Owner',
    icon: 'directions_car',
    interaction: 'display',
    privacy: 'contact-relay', // shows a "notify owner" action, never the raw number
    pageView: 'types/vehicle',
    tagline: 'Let people reach you about your vehicle — without exposing your number.',
    fields: [
      { name: 'name',      label: 'Owner name',     type: 'text',   required: true, max: 100 },
      { name: 'vehicleNo', label: 'Vehicle number', type: 'text',   required: true, max: 20 },
      { name: 'contact',   label: 'Your mobile (kept private)', type: 'mobile', required: true },
      { name: 'note',      label: 'Note to finders', type: 'textarea', max: 300 },
    ],
  },

  pet: {
    label: 'Pet ID',
    icon: 'pets',
    interaction: 'display',
    privacy: 'reveal-on-scan',
    pageView: 'types/pet',
    tagline: 'Help a lost pet get home fast.',
    fields: [
      { name: 'petName',   label: 'Pet name',       type: 'text',   required: true, max: 60 },
      { name: 'species',   label: 'Species / breed', type: 'text',  max: 80 },
      { name: 'ownerName', label: 'Owner name',     type: 'text',   required: true, max: 100 },
      { name: 'contact',   label: 'Owner contact',  type: 'mobile', required: true },
      { name: 'address',   label: 'Home address',   type: 'textarea', max: 300 },
      { name: 'medical',   label: 'Medical notes',  type: 'textarea', max: 300 },
    ],
  },

  lostfound: {
    label: 'Lost & Found',
    icon: 'key',
    interaction: 'display',
    privacy: 'contact-relay',
    pageView: 'types/lostfound',
    tagline: 'If found, the owner can be notified privately.',
    fields: [
      { name: 'itemName', label: 'Item description', type: 'text',   required: true, max: 100 },
      { name: 'ownerName', label: 'Owner name',      type: 'text',   max: 100 },
      { name: 'contact',  label: 'Owner mobile (kept private)', type: 'mobile', required: true },
      { name: 'reward',   label: 'Reward (optional)', type: 'text',  max: 100 },
      { name: 'note',     label: 'Note to finder',    type: 'textarea', max: 300 },
    ],
  },

  catalog: {
    label: 'Product Catalog / Business',
    icon: 'storefront',
    interaction: 'display',
    privacy: 'public',
    pageView: 'types/catalog',
    tagline: 'Showcase your products and contact in one scan.',
    fields: [
      { name: 'business', label: 'Business name', type: 'text',     required: true, max: 120 },
      { name: 'about',    label: 'About',         type: 'textarea', max: 500 },
      { name: 'phone',    label: 'Phone',         type: 'mobile' },
      { name: 'whatsapp', label: 'WhatsApp',      type: 'mobile' },
      { name: 'website',  label: 'Website',       type: 'url' },
      { name: 'products', label: 'Products (one per line)', type: 'list', max: 30 },
    ],
  },

  social: {
    label: 'Social Media Hub',
    icon: 'share',
    interaction: 'display',
    privacy: 'public',
    pageView: 'types/social',
    tagline: 'All your social profiles in one tap — easy to share.',
    fields: [
      { name: 'name',      label: 'Display name',   type: 'text',     required: true, max: 100 },
      { name: 'bio',       label: 'Short bio',      type: 'textarea', max: 300 },
      { name: 'instagram', label: 'Instagram URL',  type: 'url' },
      { name: 'youtube',   label: 'YouTube URL',    type: 'url' },
      { name: 'facebook',  label: 'Facebook URL',   type: 'url' },
      { name: 'twitter',   label: 'X / Twitter URL', type: 'url' },
      { name: 'linkedin',  label: 'LinkedIn URL',   type: 'url' },
      { name: 'whatsapp',  label: 'WhatsApp number', type: 'mobile' },
      { name: 'website',   label: 'Website URL',    type: 'url' },
    ],
  },

  url: {
    label: 'Smart Link',
    icon: 'link',
    interaction: 'redirect',
    privacy: 'public-redirect',
    // no pageView — scan 302-redirects to data.url
    tagline: 'Point this tag at any link. Change it anytime.',
    fields: [
      { name: 'url',   label: 'Destination URL', type: 'url',  required: true },
      { name: 'label', label: 'Label (optional)', type: 'text', max: 100 },
    ],
  },

  survey: {
    label: 'Survey / Feedback',
    icon: 'assignment',
    interaction: 'collect',
    privacy: 'public-submit',
    pageView: 'types/survey',
    tagline: 'Collect feedback from anyone who scans.',
    // The OWNER configures these during registration; SCANNERS submit answers.
    fields: [
      { name: 'title',     label: 'Survey title',  type: 'text',     required: true, max: 120 },
      { name: 'intro',     label: 'Intro message', type: 'textarea', max: 300 },
      { name: 'questions', label: 'Questions (one per line)', type: 'list', required: true, max: 15 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const MEDICAL = 'medical';

// A "universal" tag is manufactured WITHOUT a fixed type — the person who
// activates it chooses any first-party type at registration. The manufactured
// origin (`universal`) is immutable; the chosen concrete type is stored on the
// tag as `resolvedType`. `effectiveType()` collapses the two for every consumer.
const UNIVERSAL = 'universal';

// Business rule (v1): once a universal tag is activated as a concrete type it
// stays that type. Flip to `false` to let owners re-choose later — the schema
// (immutable tagType + separate resolvedType) already supports it, so this is
// the ONLY switch that gates reconfiguration.
const LOCK_AFTER_ACTIVATION = true;

// Per-type visual theme (accent colour + header gradient) — keeps each tag
// type visually distinct so a vCard is never mistaken for a Pet or Lost&Found.
const THEMES = {
  vcard:     { accent: '#4f46e5', headBg: 'linear-gradient(135deg,#6366f1 0%,#4338ca 60%,#312e81 130%)' },
  vehicle:   { accent: '#f59e0b', headBg: 'linear-gradient(135deg,#334155 0%,#1e293b 60%,#0f172a 130%)' },
  pet:       { accent: '#ea580c', headBg: 'linear-gradient(135deg,#fb923c 0%,#ea580c 55%,#9a3412 130%)' },
  lostfound: { accent: '#0284c7', headBg: 'linear-gradient(135deg,#38bdf8 0%,#0284c7 55%,#075985 130%)' },
  catalog:   { accent: '#7c3aed', headBg: 'linear-gradient(135deg,#a78bfa 0%,#7c3aed 55%,#4c1d95 130%)' },
  social:    { accent: '#8b5cf6', headBg: 'linear-gradient(135deg,#ec4899 0%,#8b5cf6 60%,#6366f1 130%)' },
  url:       { accent: '#0D9488', headBg: 'linear-gradient(135deg,#0D9488 0%,#0f766e 55%,#0A2342 130%)' },
  survey:    { accent: '#059669', headBg: 'linear-gradient(135deg,#34d399 0%,#059669 55%,#065f46 130%)' },
};

function isMedical(type) {
  return !type || type === MEDICAL;
}

function isUniversal(type) {
  return type === UNIVERSAL;
}

// The concrete type in effect for a tag: the user-chosen `resolvedType` when the
// tag was manufactured universal, otherwise its manufactured `tagType`.
function effectiveType(tag) {
  if (!tag) return MEDICAL;
  return tag.resolvedType || tag.tagType || MEDICAL;
}

function getType(type) {
  const t = TAG_TYPES[type];
  if (!t) return null;
  return { ...t, ...(THEMES[type] || {}) };
}

// Concrete types a USER may pick when activating a universal tag (medical +
// every registry type). Universal itself is never choosable here.
function choosableTypes() {
  return [
    {
      id: MEDICAL, label: 'Medical Emergency', icon: 'emergency',
      interaction: 'display', privacy: 'reveal-on-scan',
      tagline: 'Show blood group, allergies & emergency contacts on scan.',
      accent: '#0D9488', headBg: 'linear-gradient(135deg,#14b8a6 0%,#0D9488 55%,#0A2342 130%)',
    },
    ...Object.entries(TAG_TYPES).map(([id, t]) => ({
      id, label: t.label, icon: t.icon, interaction: t.interaction,
      privacy: t.privacy, tagline: t.tagline, ...(THEMES[id] || {}),
    })),
  ];
}

// A user-choosable concrete type (medical or any registry type, NOT universal).
function isChoosable(type) {
  return isMedical(type) || !!TAG_TYPES[type];
}

// All selectable types for the manufacturer batch form: every choosable type
// plus the special "universal" option (defer the choice to the buyer).
function listTypes() {
  return [
    ...choosableTypes().map(({ id, label, icon, interaction, privacy }) => ({
      id, label, icon, interaction, privacy,
    })),
    {
      id: UNIVERSAL, label: 'Universal — buyer chooses at activation', icon: 'auto_awesome',
      interaction: 'universal', privacy: 'deferred',
    },
  ];
}

// Types whose owner dashboard collects inbound data (survey answers, contact relays)
function hasInbox(type) {
  const def = getType(type);
  return !!def && (def.interaction === 'collect' || def.privacy === 'contact-relay');
}

function isValidType(type) {
  return isMedical(type) || isUniversal(type) || !!TAG_TYPES[type];
}

/**
 * Validate registration form `body` against a type's field definitions.
 * Returns { errors, data, values } — `data` is the clean object to persist,
 * `values` is the raw submission echoed back to re-render the form on error.
 */
function validateProfile(type, body) {
  const def = getType(type);
  if (!def) return { errors: { _form: 'Unknown tag type' }, data: {}, values: body };

  const errors = {};
  const data = {};
  for (const f of def.fields) {
    const { error, value } = validateField(f, body[f.name]);
    if (error) errors[f.name] = error;
    else data[f.name] = value;
  }
  return { errors, data, values: body };
}

module.exports = {
  TAG_TYPES,
  MEDICAL,
  UNIVERSAL,
  LOCK_AFTER_ACTIVATION,
  isMedical,
  isUniversal,
  isChoosable,
  isValidType,
  effectiveType,
  getType,
  choosableTypes,
  listTypes,
  hasInbox,
  validateProfile,
  validateField,
};
