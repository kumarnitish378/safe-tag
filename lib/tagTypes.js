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
    icon: '💼',
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
    icon: '🚗',
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
    icon: '🐾',
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
    icon: '🔑',
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
    icon: '🛍️',
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

  url: {
    label: 'Smart Link',
    icon: '🔗',
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
    icon: '📝',
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

function isMedical(type) {
  return !type || type === MEDICAL;
}

function getType(type) {
  return TAG_TYPES[type] || null;
}

// All selectable types for the manufacturer batch form (medical + registry)
function listTypes() {
  return [
    { id: MEDICAL, label: 'Medical Emergency', icon: '🚑', interaction: 'display', privacy: 'reveal-on-scan' },
    ...Object.entries(TAG_TYPES).map(([id, t]) => ({
      id, label: t.label, icon: t.icon, interaction: t.interaction, privacy: t.privacy,
    })),
  ];
}

// Types whose owner dashboard collects inbound data (survey answers, contact relays)
function hasInbox(type) {
  const def = getType(type);
  return !!def && (def.interaction === 'collect' || def.privacy === 'contact-relay');
}

function isValidType(type) {
  return isMedical(type) || !!TAG_TYPES[type];
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
  isMedical,
  isValidType,
  getType,
  listTypes,
  hasInbox,
  validateProfile,
  validateField,
};
