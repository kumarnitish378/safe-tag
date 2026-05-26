/**
 * Shared helpers: generators, validators, and Prisma→template formatters.
 * Formatters convert Prisma camelCase records to the snake_case shape that
 * EJS templates expect (matching the original Python to_dict() output).
 */

const crypto = require('crypto');

const TAG_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Unknown']);
const ALLOWED_CATEGORIES = new Set(['keychain', 'card', 'sticker', 'wristband']);
const ALLOWED_ORDER_STATUS = new Set(['pending', 'dispatched', 'delivered', 'cancelled']);

const INDIA_MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// -----------------------------------------------------------------------------
// Generators
// -----------------------------------------------------------------------------

function generateTagId(length = 6) {
  const arr = [];
  for (let i = 0; i < length; i++) {
    arr.push(TAG_ID_ALPHABET[crypto.randomInt(TAG_ID_ALPHABET.length)]);
  }
  return arr.join('');
}

function generateSecurityKey() {
  // 6 bytes → 8 base64url chars. Shorter URL = simpler QR code on small tags.
  return crypto.randomBytes(6).toString('base64url');
}

// -----------------------------------------------------------------------------
// Validators
// -----------------------------------------------------------------------------

function normaliseMobile(raw) {
  if (raw == null) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return digits || null;
}

function isValidMobile(raw) {
  const digits = normaliseMobile(raw);
  return digits != null && INDIA_MOBILE_RE.test(digits);
}

function isValidEmail(raw) {
  return !!raw && EMAIL_RE.test(String(raw).trim());
}

// -----------------------------------------------------------------------------
// Formatters (Prisma camelCase → EJS snake_case)
// -----------------------------------------------------------------------------

function formatUser(u) {
  return {
    id: u.id,
    email: u.email,
    mobile: u.mobile,
    name: u.name,
    is_admin: u.isAdmin,
    is_active: u.isActive,
    created_at: u.createdAt?.toISOString() || null,
  };
}

function formatManufacturer(m) {
  return {
    id: m.id,
    business_name: m.businessName,
    email: m.email,
    mobile: m.mobile,
    address: m.address || null,
    description: m.description || null,
    is_approved: m.isApproved,
    is_blocked: m.isBlocked,
    created_at: m.createdAt?.toISOString() || null,
  };
}

function formatProfile(p) {
  return {
    id: p.id,
    tag_id: p.tagId,
    name: p.name,
    age: p.age,
    parent_name: p.parentName,
    blood_group: p.bloodGroup,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    mobile_primary: p.mobilePrimary,
    mobile_secondary: p.mobileSecondary,
    email: p.email,
    medical_conditions: p.medicalConditions,
    allergies: p.allergies,
    medications: p.medications,
    custom_message: p.customMessage,
    owner_whatsapp: p.ownerWhatsapp,
    photo_url: p.photoUrl,
    category: p.category,
    theme: p.theme || 'classic',
  };
}

function formatTag(tag, includeProfile = false) {
  const d = {
    tag_id: tag.tagId,
    is_active: tag.isActive,
    scan_count: tag.scanCount,
    created_at: tag.createdAt?.toISOString() || null,
    activated_at: tag.activatedAt?.toISOString() || null,
    owner_id: tag.ownerId,
    batch_id: tag.batchId,
    manufacturer_id: tag.manufacturerId,
  };
  if (includeProfile && tag.profile) {
    d.profile = formatProfile(tag.profile);
  }
  return d;
}

function formatBatch(b) {
  return {
    id: b.id,
    manufacturer_id: b.manufacturerId,
    batch_name: b.batchName,
    quantity: b.quantity,
    created_at: b.createdAt?.toISOString() || null,
  };
}

function formatProduct(l) {
  return {
    id: l.id,
    manufacturer_id: l.manufacturerId,
    manufacturer_name: l.manufacturer?.businessName || null,
    name: l.name,
    description: l.description,
    price: l.price,
    price_inr: Math.round(l.price / 100 * 100) / 100,
    category: l.category,
    quantity_available: l.quantityAvailable,
    is_approved: l.isApproved,
    is_featured: l.isFeatured,
    is_rejected: l.isRejected,
    photo_url: l.photoUrl,
    created_at: l.createdAt?.toISOString() || null,
  };
}

function formatOrder(o, includeUser = false, includeProduct = false) {
  const d = {
    id: o.id,
    user_id: o.userId,
    product_listing_id: o.productListingId,
    quantity: o.quantity,
    amount: o.amount,
    amount_inr: Math.round(o.amount / 100 * 100) / 100,
    status: o.status,
    tracking_id: o.trackingId,
    razorpay_order_id: o.razorpayOrderId,
    razorpay_payment_id: o.razorpayPaymentId,
    shipping_address: o.shippingAddress,
    created_at: o.createdAt?.toISOString() || null,
  };
  if (includeUser && o.user) {
    d.user = { email: o.user.email, name: o.user.name, mobile: o.user.mobile };
  }
  if (includeProduct && o.productListing) {
    d.product = {
      name: o.productListing.name,
      photo_url: o.productListing.photoUrl,
      category: o.productListing.category,
    };
  }
  return d;
}

// -----------------------------------------------------------------------------
// Listing validator (used for create and partial update)
// -----------------------------------------------------------------------------

function validateListing(data, partial = false) {
  const errors = {};
  const parsed = {};

  const name = (data.name || '').trim();
  if (!name && !partial) errors.name = 'Name 2–255 chars required';
  else if (name && (name.length < 2 || name.length > 255)) errors.name = 'Name 2–255 chars required';
  else if (name) parsed.name = name;

  const desc = (data.description || '').trim();
  if (!desc && !partial) errors.description = 'Description required';
  else if (desc) parsed.description = desc;

  if (data.price != null && data.price !== '') {
    const p = parseInt(data.price, 10);
    if (isNaN(p) || p < 1 || p > 100000000) errors.price = 'Price (paise) must be a positive integer';
    else parsed.price = p;
  } else if (!partial) {
    errors.price = 'Price (paise) must be a positive integer';
  }

  if (data.category != null && data.category !== '') {
    const cat = String(data.category).trim().toLowerCase();
    if (!ALLOWED_CATEGORIES.has(cat)) errors.category = 'Category must be one of keychain/card/sticker/wristband';
    else parsed.category = cat;
  } else if (!partial) {
    errors.category = 'Category must be one of keychain/card/sticker/wristband';
  }

  if (data.quantity_available != null && data.quantity_available !== '') {
    const q = parseInt(data.quantity_available, 10);
    if (isNaN(q) || q < 0) errors.quantity_available = 'Quantity must be a non-negative integer';
    else parsed.quantityAvailable = q;
  } else if (!partial) {
    errors.quantity_available = 'Quantity must be a non-negative integer';
  }

  if ('photo_url' in data) parsed.photoUrl = (data.photo_url || '').trim() || null;

  return { errors, parsed };
}

module.exports = {
  generateTagId,
  generateSecurityKey,
  normaliseMobile,
  isValidMobile,
  isValidEmail,
  formatUser,
  formatManufacturer,
  formatProfile,
  formatTag,
  formatBatch,
  formatProduct,
  formatOrder,
  validateListing,
  BLOOD_GROUPS,
  ALLOWED_CATEGORIES,
  ALLOWED_ORDER_STATUS,
};
