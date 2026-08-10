/**
 * SafeTag — Node.js/Express full-stack server.
 *
 * Architecture (post-migration): Browser → Express (HTML + API) → Prisma → SQLite/PostgreSQL.
 * No Python backend. All business logic lives here.
 */

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const compression = require('compression');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const prisma = require('./lib/db');
const {
  generateTagId,
  generateSecurityKey,
  generateTagCode,
  normaliseMobile,
  isValidMobile,
  isValidEmail,
  calcBatchPrice,
  validateListing,
  formatTag,
  formatProfile,
  formatUser,
  formatManufacturer,
  formatBatch,
  formatProduct,
  formatOrder,
  BLOOD_GROUPS,
  ALLOWED_CATEGORIES,
  ALLOWED_ORDER_STATUS,
} = require('./lib/helpers');

const tagTypes = require('./lib/tagTypes');

const app = express();

// CRITICAL: case-sensitive routing so /:tag_id([A-Z0-9]) does NOT match /emergency etc.
app.set('case sensitive routing', true);
app.set('strict routing', false);
// Required for secure session cookies behind Render/Heroku/nginx reverse proxy.
// Without this, req.secure is false → express-session won't set the Secure cookie.
app.set('trust proxy', 1);
// Cache compiled EJS templates in production to skip re-parsing on each request.
if (process.env.NODE_ENV === 'production') app.set('view cache', true);

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const SESSION_SECRET = process.env.NODE_SESSION_SECRET || 'dev-session-secret-change-me';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const DUMMY_PAYMENT = process.env.DUMMY_PAYMENT !== 'false';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

// Verify a Razorpay payment signature: HMAC-SHA256(order_id|payment_id, secret)
// compared to the signature Razorpay returned. Done manually (not via the SDK)
// because razorpay@2.9.x does not expose `client.utility.verifyPaymentSignature`.
function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature || !RAZORPAY_KEY_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN_ENV = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

// -----------------------------------------------------------------------------
// View engine
// -----------------------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------
app.use(compression());
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));
app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
  immutable: process.env.NODE_ENV === 'production',
  etag: true,
}));
app.get('/favicon.ico', (req, res) => res.redirect('/static/favicon.png'));

// Secure cookies require HTTPS. Set SECURE_COOKIES=true only in Render env vars (never locally).
// NODE_ENV alone is NOT used — running NODE_ENV=production on localhost (HTTP) breaks sessions.
const SECURE_COOKIES = process.env.SECURE_COOKIES === 'true';
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
}));
app.use(flash());

// -----------------------------------------------------------------------------
// CSRF protection (hand-rolled per-session token — SDD §10)
// Skipped for GET requests and browser-direct API endpoints (/api/*).
// -----------------------------------------------------------------------------
function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

const CSRF_SKIP_PATHS = [
  /^\/qr\//,
  /^\/api\//,
];

app.use((req, res, next) => {
  ensureCsrfToken(req);
  if (req.method !== 'POST') return next();
  if (process.env.NODE_ENV === 'test') return next();
  if (CSRF_SKIP_PATHS.some(re => re.test(req.path))) return next();

  const submitted =
    (req.body && (req.body._csrf || req.body.csrf_token)) ||
    req.headers['x-csrf-token'];
  if (!submitted || submitted !== req.session.csrfToken) {
    console.warn('[CSRF] FAIL path=%s cookie=%s sessionId=%s', req.path,
      req.headers.cookie ? 'PRESENT' : 'MISSING', req.sessionID);
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    req.flash('error', 'Your session expired. Please reload the page and try again.');
    return res.redirect(req.get('Referer') || '/');
  }
  console.log('[CSRF] OK path=%s', req.path);
  next();
});

// Expose common locals to every template
app.use((req, res, next) => {
  res.locals.IS_PROD = process.env.NODE_ENV === 'production';
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.user = req.session.user || null;
  res.locals.userToken = null; // kept for template compat
  res.locals.manufacturer = req.session.manufacturer || null;
  res.locals.manufacturerToken = null; // kept for template compat
  res.locals.admin = (req.session.user && req.session.user.is_admin) ? req.session.user : null;
  res.locals.flash = {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info'),
  };
  res.locals.baseUrl = BASE_URL;
  res.locals.googleMapsApiKey = GOOGLE_MAPS_API_KEY;
  res.locals.path = req.path;
  res.locals.query = req.query;
  next();
});

// -----------------------------------------------------------------------------
// Auth guards
// -----------------------------------------------------------------------------
function requireUser(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please sign in to continue.');
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) {
    req.flash('error', 'Admin access only.');
    return res.redirect('/login');
  }
  next();
}

function requireManufacturer(req, res, next) {
  if (!req.session.manufacturer) {
    req.flash('error', 'Please sign in as a manufacturer.');
    return res.redirect('/manufacturer/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

// Small helper: parse float safely
function toFloat(v) {
  if (v == null || v === '') return null;
  const f = parseFloat(v);
  return isNaN(f) ? null : f;
}

// =============================================================================
// P1 — Homepage
// =============================================================================
app.get('/', async (req, res) => {
  let featured = [];
  try {
    const listings = await prisma.productListing.findMany({
      where: { isApproved: true, isRejected: false },
      include: { manufacturer: true },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
    featured = listings.map(formatProduct);
  } catch (e) { /* homepage still renders */ }
  res.render('index', {
    title: 'SafeTag — Emergency QR + NFC ID Tags India | From ₹149',
    featured,
    seoDesc: 'India\'s QR + NFC emergency ID tag. One scan shows blood group, contacts & medical info in 3 seconds. No app needed. Ships across India from ₹149.',
    seoImage: '/static/images/og-homepage.jpg',
  });
});

// =============================================================================
// QR code image — public, no auth, no CSRF (GET)
// Encodes the tag's emergency URL into a 300×300 PNG
// =============================================================================
app.get('/qr/:tagId', async (req, res) => {
  try {
    // Tag ids are case-sensitive base62 — never upper/lower-case them.
    const tagId = (req.params.tagId || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!tagId) return res.status(400).send('Invalid tag ID');
    const tag = await prisma.tag.findUnique({ where: { tagId } });
    if (!tag) return res.status(404).send('Tag not found');
    // New-style tags (securityKey null) use the short /t/<code> URL;
    // legacy tags keep the /<tagId>/<securityKey> URL.
    const url = tag.securityKey
      ? `${BASE_URL}/${tag.tagId}/${tag.securityKey}`
      : `${BASE_URL}/t/${tag.tagId}`;
    const png = await QRCode.toBuffer(url, {
      width: 300, margin: 1,
      color: { dark: '#0A2342', light: '#FFFFFF' },
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(png);
  } catch (e) {
    res.status(500).send('QR generation failed');
  }
});

// =============================================================================
// Demo emergency page (hardcoded — always works regardless of DB state)
// =============================================================================
app.get('/demo', (req, res) => {
  res.render('emergency', {
    title: 'SafeTag Demo — See How Emergency Profile Works',
    seoDesc: 'See a live SafeTag emergency profile demo. One QR scan opens blood group, allergies, emergency contacts, and medical info instantly — no app required. Protect your family today.',
    tag_id: 'DEMO',
    profile: {
      name: 'Aarav Sharma',
      age: 8,
      blood_group: 'O+',
      mobile_primary: '7004969879',
      mobile_secondary: null,
      email: 'parent@example.com',
      address: '12 MG Road, Bengaluru 560001',
      medical_conditions: 'Mild asthma',
      allergies: 'Peanuts, Penicillin',
      medications: 'Salbutamol inhaler (as needed)',
      custom_message: 'Please call the emergency contact. Father speaks English and Kannada.',
      parent_name: 'Rajesh Sharma',
      owner_whatsapp: null,
      photo_url: null,
      category: 'CHILD',
      latitude: null,
      longitude: null,
      theme: 'classic',
    },
    activated: false,
    flaskApiUrl: BASE_URL,
  });
});

// =============================================================================
// P2 — Store   P3 — Product detail
// =============================================================================
app.get('/store', async (req, res) => {
  const category = req.query.category || '';
  let products = [];
  try {
    const where = { isApproved: true, isRejected: false };
    if (category && ALLOWED_CATEGORIES.has(category)) where.category = category;
    const listings = await prisma.productListing.findMany({
      where,
      include: { manufacturer: true },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    });
    products = listings.map(formatProduct);
  } catch (e) { /* ignore */ }
  res.render('store', {
    title: 'SafeTag Store — Buy Emergency ID Tags from ₹149',
    seoDesc: 'Shop SafeTag emergency identity tags — keychains, smart cards, wristbands, and sticker packs. QR + NFC/RFID enabled. Instant emergency profile on scan. Starting ₹149. Free shipping on orders above ₹499.',
    products,
    category,
  });
});

app.get('/store/:productId', async (req, res) => {
  try {
    const id = parseInt(req.params.productId, 10);
    if (isNaN(id)) return res.status(404).render('404');
    const listing = await prisma.productListing.findFirst({
      where: { id, isApproved: true, isRejected: false },
      include: { manufacturer: true },
    });
    if (!listing) return res.status(404).render('404');
    const p = formatProduct(listing);
    const priceInr = Math.round(listing.price / 100);
    res.render('store_product', {
      title: `${listing.name} — SafeTag Emergency ID Tag`,
      seoDesc: `Buy ${listing.name} on SafeTag. QR + NFC emergency identity tag — one scan shows blood group, emergency contacts, and medical info instantly. No app needed. ₹${priceInr} only.`,
      seoImage: listing.imageUrl || '/static/images/websiteLogo.png',
      product: p,
    });
  } catch (e) {
    res.status(500).render('500');
  }
});

// =============================================================================
// P4 — Tag Scan Router
// New short format: /t/AAAAAABBBBBBBB  (6-char tagId + 8-char key, no separator)
// Old format kept for backward compat with already-printed tags.
// =============================================================================
async function handleTagScan(req, res, tag_id, security_key) {
  try {
    const tag = await prisma.tag.findUnique({ where: { tagId: tag_id } });
    if (!tag || tag.securityKey !== security_key) {
      return res.status(404).render('404', { title: 'Tag not found' });
    }
    await prisma.tag.update({
      where: { tagId: tag_id },
      data: { scanCount: { increment: 1 } },
    });
    if (tag.isActive) {
      return res.redirect(`/emergency/${tag_id}`);
    }
    req.session.lastScannedTag = { tag_id, security_key };
    return req.session.save(() => res.redirect(`/register/${tag_id}`));
  } catch (e) {
    return res.status(500).render('500', { title: 'Unable to reach server' });
  }
}

// New short URL: /t/ABcd3fg7k  (9-char base62, no split — code IS both ID and security)
// 62^9 = 13.5 quadrillion → 0.00018% guess probability → covers 3× world population
// Accepts both the current 9-char generateTagCode() tokens and legacy 8-char
// base62 ids from early batches — a hardcoded {9} 404'd real printed tags.
app.get('/t/:code([a-zA-Z0-9]{8,9})', async (req, res) => {
  const code = req.params.code;
  try {
    let tag = await prisma.tag.findUnique({ where: { tagId: code } });
    // Rescue for early-printed tags: a former bug in the /qr endpoint
    // upper-cased the encoded URL, so some physical tags carry /t/<UPPERCASED>.
    // base62 ids are case-sensitive, so fall back to a case-insensitive match
    // (Postgres only) and then ALWAYS use the tag's canonical id afterwards.
    if (!tag && (process.env.DATABASE_URL || '').includes('postgres')) {
      tag = await prisma.tag.findFirst({
        where: { tagId: { equals: code, mode: 'insensitive' } },
      });
    }
    if (!tag) return res.status(404).render('404', { title: 'Tag not found' });
    const canonical = tag.tagId;
    await prisma.tag.update({ where: { tagId: canonical }, data: { scanCount: { increment: 1 } } });

    // Not yet activated → registration form for this tag's type
    if (!tag.isActive) {
      req.session.lastScannedTag = { tag_id: canonical, security_key: null };
      return req.session.save(() => res.redirect(`/register/${canonical}`));
    }

    // Universal tags resolve to the concrete type the owner chose at activation.
    const type = tagTypes.effectiveType(tag);

    // Medical keeps its dedicated, mature emergency page (unchanged)
    if (tagTypes.isMedical(type)) return res.redirect(`/emergency/${canonical}`);

    // Non-medical types are served from the generic profile + type registry
    const def = tagTypes.getType(type);
    if (!def) return res.status(404).render('404', { title: 'Tag not found' });
    const gp = await prisma.tagProfile.findUnique({ where: { tagId: canonical } });
    if (!gp) return res.status(404).render('404', { title: 'Tag not found' });
    const p = JSON.parse(gp.data || '{}');

    if (def.interaction === 'redirect') {
      if (!p.url) return res.status(404).render('404', { title: 'Tag not found' });
      return res.redirect(p.url);
    }
    return res.render(def.pageView, {
      title: def.label, noIndex: true, tag_id: canonical, p, typeDef: def,
      submitted: req.query.done === '1',
      notified: req.query.notified === '1',
    });
  } catch (e) {
    return res.status(500).render('500', { title: 'Unable to reach server' });
  }
});

// Contact-relay: a finder notifies the owner WITHOUT ever seeing their number.
// The message is stored (and best-effort emailed) — the owner reads it in their
// dashboard. Public, no auth.
app.post('/t/:code([a-zA-Z0-9]{8,9})/notify', async (req, res) => {
  const code = req.params.code;
  try {
    const tag = await prisma.tag.findUnique({ where: { tagId: code } });
    if (!tag || !tag.isActive) return res.status(404).render('404', { title: 'Tag not found' });
    const def = tagTypes.getType(tag.tagType);
    if (!def || def.privacy !== 'contact-relay') return res.status(404).render('404');
    if (req.body.website) return res.redirect(`/t/${code}?notified=1`); // honeypot

    const message = (req.body.message || '').toString().trim().slice(0, 1000);
    const reply   = (req.body.reply || '').toString().trim().slice(0, 120);
    if (message || reply) {
      await prisma.submission.create({
        data: { tagId: code, data: JSON.stringify({ kind: 'contact', message, reply, at: new Date().toISOString() }) },
      });
    }
    return res.redirect(`/t/${code}?notified=1`);
  } catch (e) {
    return res.status(500).render('500');
  }
});

// Collect-class public submission (survey/feedback/lead). Public, no auth.
app.post('/t/:code([a-zA-Z0-9]{8,9})/submit', async (req, res) => {
  const code = req.params.code;
  try {
    const tag = await prisma.tag.findUnique({ where: { tagId: code } });
    if (!tag || !tag.isActive) return res.status(404).render('404', { title: 'Tag not found' });
    const def = tagTypes.getType(tag.tagType);
    if (!def || def.interaction !== 'collect') return res.status(404).render('404');
    // Honeypot: bots fill the hidden "website" field → silently accept, store nothing
    if (req.body.website) return res.redirect(`/t/${code}?done=1`);

    const gp = await prisma.tagProfile.findUnique({ where: { tagId: code } });
    const cfg = gp ? JSON.parse(gp.data || '{}') : {};
    const answers = {};
    (cfg.questions || []).forEach((q, i) => {
      const v = (req.body['q' + i] || '').toString().trim().slice(0, 500);
      if (v) answers[q] = v;
    });
    await prisma.submission.create({ data: { tagId: code, data: JSON.stringify(answers) } });
    return res.redirect(`/t/${code}?done=1`);
  } catch (e) {
    return res.status(500).render('500');
  }
});

// Legacy long format: /W6315VW8/5zrlgIxlKlE3PyD8 (old printed tags still work)
app.get('/:tag_id([A-Z0-9]{6,12})/:security_key([A-Za-z0-9_-]{8,32})', (req, res) =>
  handleTagScan(req, res, req.params.tag_id, req.params.security_key)
);

// =============================================================================
// P5 — Registration Page
// =============================================================================
app.get('/register/:tag_id', async (req, res) => {
  const tagId = req.params.tag_id;
  try {
    const tag = await prisma.tag.findUnique({ where: { tagId } });
    if (!tag) return res.status(404).render('404');
    if (tag.isActive) return res.redirect(`/t/${tagId}`);

    // Universal tag, not yet resolved → the buyer picks the template first.
    let chosenType = null;
    if (tagTypes.isUniversal(tag.tagType) && !tag.resolvedType) {
      const pick = (req.query.type || '').trim();
      if (!pick) {
        return res.render('types/register_choose', {
          title: 'What should this tag do?', noIndex: true,
          tag_id: tagId, choices: tagTypes.choosableTypes(),
        });
      }
      if (!tagTypes.isChoosable(pick)) return res.status(404).render('404');
      chosenType = pick; // carried into the form as a hidden field
    }

    // Concrete type to render the form for (chosen, resolved, or manufactured).
    const type = chosenType || tagTypes.effectiveType(tag);

    // Non-medical types use the generic, registry-driven form
    if (!tagTypes.isMedical(type)) {
      const def = tagTypes.getType(type);
      if (!def) return res.status(404).render('404');
      return res.render('types/register_generic', {
        title: `Set up your ${def.label}`,
        noIndex: true,
        tag_id: tagId,
        typeDef: def,
        chosenType,
        errors: {},
        values: {},
      });
    }

    res.render('register_tag', {
      title: 'Register Your SafeTag — Activate Emergency Profile',
      seoDesc: 'Activate your SafeTag emergency profile. Add blood group, emergency contacts, medical conditions, and allergies. Your profile is shown only when your tag is scanned in an emergency.',
      noIndex: true,
      tag_id: tagId,
      chosenType,
      errors: {},
      values: {},
    });
  } catch (e) {
    res.status(500).render('500');
  }
});

app.post('/register/:tag_id', async (req, res) => {
  const tagId = req.params.tag_id;
  const chosenType = (req.body.chosen_type || '').trim() || null;
  const renderErr = (errors) => res.render('register_tag', {
    title: 'Register your SafeTag',
    tag_id: tagId,
    chosenType,
    errors,
    values: req.body,
  });

  try {
    const tag = await prisma.tag.findUnique({ where: { tagId } });
    if (!tag) return res.status(404).render('404');
    if (tag.isActive) return renderErr({ _form: 'Tag already activated' });

    // Resolve the concrete type this activation targets. For a universal tag the
    // buyer's pick arrives as chosen_type; everything else uses the tag's own type.
    const universalActivation = tagTypes.isUniversal(tag.tagType) && !tag.resolvedType;
    let type;
    if (universalActivation) {
      if (!chosenType || !tagTypes.isChoosable(chosenType)) {
        return res.render('types/register_choose', {
          title: 'What should this tag do?', noIndex: true,
          tag_id: tagId, choices: tagTypes.choosableTypes(),
        });
      }
      type = chosenType;
    } else {
      type = tagTypes.effectiveType(tag);
    }
    // When a universal tag activates, lock in the chosen type via resolvedType
    // (tagType stays 'universal' as the immutable manufactured origin).
    const resolveData = universalActivation ? { resolvedType: type } : {};

    // Non-medical types: validate against the registry and store a generic profile
    if (!tagTypes.isMedical(type)) {
      const def = tagTypes.getType(type);
      if (!def) return res.status(404).render('404');
      const { errors, data: clean, values } = tagTypes.validateProfile(type, req.body);
      if (Object.keys(errors).length > 0) {
        return res.render('types/register_generic', {
          title: `Set up your ${def.label}`, noIndex: true,
          tag_id: tagId, typeDef: def, chosenType, errors, values,
        });
      }
      await prisma.tagProfile.create({
        data: { tagId: tag.tagId, type, data: JSON.stringify(clean) },
      });
      const ownerId = req.session.user ? req.session.user.id : null;
      await prisma.tag.update({
        where: { tagId: tag.tagId },
        data: { isActive: true, activatedAt: new Date(), ...resolveData, ...(ownerId ? { ownerId } : {}) },
      });
      req.flash('success', 'Your tag is active.');
      return res.redirect(`/t/${tag.tagId}`);
    }

    const data = req.body;
    const name = (data.name || '').trim();
    const mobilePrimary = normaliseMobile(data.mobile_primary);
    const errors = {};

    if (name.length < 2 || name.length > 100) errors.name = 'Name must be 2–100 characters';

    let age = null;
    if (data.age != null && data.age !== '') {
      age = parseInt(data.age, 10);
      if (isNaN(age)) age = null;
    }
    if (!age || age < 1 || age > 120) errors.age = 'Age must be between 1 and 120';

    if (!mobilePrimary || !isValidMobile(mobilePrimary)) {
      errors.mobile_primary = 'Mobile must be a valid 10-digit Indian number';
    }

    const mobileSecondary = normaliseMobile(data.mobile_secondary);
    if (data.mobile_secondary && !isValidMobile(mobileSecondary)) {
      errors.mobile_secondary = 'Secondary mobile invalid';
    }
    const ownerWhatsapp = normaliseMobile(data.owner_whatsapp);
    if (data.owner_whatsapp && !isValidMobile(ownerWhatsapp)) {
      errors.owner_whatsapp = 'WhatsApp number invalid';
    }
    const email = (data.email || '').trim() || null;
    if (email && !isValidEmail(email)) errors.email = 'Email is invalid';

    const bloodGroup = data.blood_group || null;
    if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup)) errors.blood_group = 'Invalid blood group';

    if (Object.keys(errors).length > 0) return renderErr(errors);

    await prisma.medicalProfile.create({
      data: {
        tagId: tag.tagId,
        name,
        age: parseInt(age, 10),
        mobilePrimary,
        mobileSecondary: mobileSecondary || null,
        parentName: (data.parent_name || '').trim() || null,
        bloodGroup: bloodGroup || null,
        address: (data.address || '').trim() || null,
        latitude: toFloat(data.latitude),
        longitude: toFloat(data.longitude),
        email,
        medicalConditions: (data.medical_conditions || '').trim() || null,
        allergies: (data.allergies || '').trim() || null,
        medications: (data.medications || '').trim() || null,
        customMessage: (data.custom_message || '').trim() || null,
        ownerWhatsapp: ownerWhatsapp || null,
        photoUrl: (data.photo_url || '').trim() || null,
        category: (data.category || '').trim() || null,
        theme: (data.theme || 'classic').trim(),
      },
    });

    const ownerId = req.session.user ? req.session.user.id : null;
    await prisma.tag.update({
      where: { tagId: tag.tagId },
      data: {
        isActive: true,
        activatedAt: new Date(),
        ...resolveData,
        ...(ownerId ? { ownerId } : {}),
      },
    });

    req.flash('success', 'Your SafeTag is active. Save this page or share with family.');
    return res.redirect(`/emergency/${tagId}?activated=1`);
  } catch (e) {
    console.error(e);
    renderErr({ _form: 'Server error' });
  }
});

// =============================================================================
// P6 — Emergency Page
// =============================================================================
app.get('/emergency/:tag_id', async (req, res) => {
  const tagId = req.params.tag_id;
  try {
    const tag = await prisma.tag.findUnique({
      where: { tagId },
      include: { profile: true },
    });
    if (!tag || !tag.isActive || !tag.profile) return res.status(404).render('404');
    const prof = formatProfile(tag.profile);
    res.render('emergency', {
      title: `Emergency Profile · ${tagId}${prof.name ? ' · ' + prof.name : ''}`,
      seoDesc: 'Private emergency identity profile — SafeTag.',
      noIndex: true,
      tag_id: tagId,
      profile: prof,
      activated: req.query.activated === '1',
      flaskApiUrl: BASE_URL,
    });
  } catch (e) {
    res.status(500).render('500');
  }
});

// =============================================================================
// Auth pages (P7, P8)
// =============================================================================
app.get('/login', (req, res) => {
  res.render('auth/login', {
    title: 'Sign in',
    errors: {},
    values: {},
    next: req.query.next || '/dashboard',
    hideNav: true,
    hideFooter: true,
  });
});

app.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    console.log('[LOGIN] attempt email=%s', email);
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user && user.isActive && await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.render('auth/login', {
        title: 'Sign in',
        errors: { _form: 'Invalid credentials' },
        values: { email: req.body.email },
        next: req.body.next || '/dashboard',
        hideNav: true,
        hideFooter: true,
      });
    }
    req.session.user = formatUser(user);
    req.flash('success', 'Signed in.');
    const nextUrl = user.isAdmin
      ? (req.body.next && req.body.next !== '/dashboard' ? req.body.next : '/admin')
      : (req.body.next || '/dashboard');
    return req.session.save((err) => {
      if (err) console.error('[session.save /login]', err);
      res.redirect(nextUrl);
    });
  } catch (e) {
    console.error('[LOGIN] error', e.message);
    res.render('auth/login', {
      title: 'Sign in',
      errors: { _form: 'Server error' },
      values: { email: req.body.email },
      next: req.body.next || '/dashboard',
      hideNav: true,
      hideFooter: true,
    });
  }
});

app.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Create account', errors: {}, values: {}, hideNav: true, hideFooter: true });
});

app.post('/register', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const mobile = normaliseMobile(req.body.mobile);
    const password = req.body.password || '';
    const name = (req.body.name || '').trim() || null;
    const errors = {};

    if (!isValidEmail(email)) errors.email = 'Email is invalid';
    if (!isValidMobile(mobile)) errors.mobile = 'Mobile must be a valid 10-digit Indian number';
    if (password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (!errors.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) errors.email = 'Email already registered';
    }
    if (Object.keys(errors).length > 0) {
      return res.render('auth/register', { title: 'Create account', errors, values: req.body, hideNav: true, hideFooter: true });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, mobile, passwordHash, name } });
    req.session.user = formatUser(user);
    return req.session.save((err) => {
      if (err) console.error('[session.save /register]', err);
      res.redirect('/welcome');
    });
  } catch (e) {
    console.error('[POST /register]', e);
    res.render('auth/register', {
      title: 'Create account',
      errors: { _form: 'Server error' },
      values: req.body,
      hideNav: true,
      hideFooter: true,
    });
  }
});

app.post('/logout', (req, res) => {
  const redirectTo = (req.session.user && req.session.user.is_admin) ? '/login' : '/';
  req.session.user = null;
  req.session.manufacturer = null;
  req.flash('success', 'Signed out.');
  req.session.save(() => res.redirect(redirectTo));
});

// =============================================================================
// Welcome / Onboarding (shown once after registration)
// =============================================================================
app.get('/welcome', requireUser, (req, res) => {
  res.render('welcome', { title: 'Welcome to SafeTag' });
});

// =============================================================================
// P9 — Customer Dashboard
// =============================================================================
app.get('/dashboard', requireUser, async (req, res) => {
  try {
    const [tags, orders] = await Promise.all([
      prisma.tag.findMany({
        where: { ownerId: req.session.user.id },
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.findMany({
        where: { userId: req.session.user.id },
        include: { productListing: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const formatted = tags.map(t => formatTag(t, true));
    const formattedOrders = orders.map(o => formatOrder(o, false, true));
    res.render('dashboard', {
      title: 'My SafeTags',
      tags: formatted,
      orders: formattedOrders,
      typeMap: Object.fromEntries(tagTypes.listTypes().map(t => [t.id, t])),
      stats: {
        total: formatted.length,
        active: formatted.filter(t => t.is_active).length,
        pending: formatted.filter(t => !t.is_active).length,
      },
    });
  } catch (e) {
    console.error(e);
    res.render('dashboard', { title: 'My SafeTags', tags: [], orders: [], typeMap: {}, stats: { total: 0, active: 0, pending: 0 } });
  }
});

// Owner view of Collect-class responses (survey/feedback)
app.get('/dashboard/tag/:tagId/submissions', requireUser, async (req, res) => {
  const tagId = req.params.tagId;
  try {
    const tag = await prisma.tag.findUnique({ where: { tagId } });
    if (!tag || tag.ownerId !== req.session.user.id) return res.status(404).render('404');
    if (!tagTypes.hasInbox(tag.tagType)) return res.status(404).render('404');
    const def = tagTypes.getType(tag.tagType);
    const gp = await prisma.tagProfile.findUnique({ where: { tagId } });
    const cfg = gp ? JSON.parse(gp.data || '{}') : {};
    const rows = await prisma.submission.findMany({
      where: { tagId }, orderBy: { createdAt: 'desc' }, take: 500,
    });
    const submissions = rows.map(r => ({
      created_at: r.createdAt.toISOString(),
      answers: JSON.parse(r.data || '{}'),
    }));
    res.render('dashboard_submissions', {
      title: cfg.title || 'Responses', tag_id: tagId, cfg, submissions,
    });
  } catch (e) {
    console.error(e);
    res.status(500).render('500');
  }
});

app.post('/dashboard/claim', requireUser, async (req, res) => {
  try {
    // base62 ids are case-sensitive — try as typed first, then fall back to
    // upper-case for legacy (all-caps) tags.
    const raw = (req.body.tag_id || '').trim();
    const securityKey = (req.body.security_key || '').trim();
    let tag = await prisma.tag.findUnique({ where: { tagId: raw } });
    if (!tag && raw) tag = await prisma.tag.findUnique({ where: { tagId: raw.toUpperCase() } });
    if (!tag || tag.securityKey !== securityKey) {
      req.flash('error', 'Tag not found or invalid security key.');
    } else if (tag.ownerId && tag.ownerId !== req.session.user.id) {
      req.flash('error', 'Tag already claimed by another user.');
    } else {
      await prisma.tag.update({ where: { tagId: tag.tagId }, data: { ownerId: req.session.user.id } });
      req.flash('success', 'Tag added to your account.');
    }
  } catch (e) {
    req.flash('error', 'Server error.');
  }
  res.redirect('/dashboard');
});

// =============================================================================
// P10 — Edit Profile
// =============================================================================
app.get('/profile/edit/:tag_id', requireUser, async (req, res) => {
  const tagId = req.params.tag_id;
  try {
    const tag = await prisma.tag.findUnique({ where: { tagId }, include: { profile: true } });
    if (!tag) return res.status(404).render('404');
    if (tag.ownerId !== req.session.user.id && !req.session.user.is_admin) {
      req.flash('error', 'You do not own this tag.');
      return res.redirect('/dashboard');
    }

    // Non-medical types: edit the generic profile with the registry-driven form
    if (!tagTypes.isMedical(tagTypes.effectiveType(tag))) {
      const def = tagTypes.getType(tagTypes.effectiveType(tag));
      const gp = await prisma.tagProfile.findUnique({ where: { tagId } });
      if (!def || !gp) return res.status(404).render('404');
      return res.render('types/register_generic', {
        title: `Edit your ${def.label}`, noIndex: true,
        tag_id: tagId, typeDef: def, errors: {},
        values: JSON.parse(gp.data || '{}'),
        formAction: `/profile/edit/${tagId}`, submitLabel: 'Save changes ✓',
      });
    }

    if (!tag.profile) return res.status(404).render('404');
    res.render('profile_edit', {
      title: 'Edit Emergency Profile',
      tag_id: tagId,
      profile: formatProfile(tag.profile),
      errors: {},
    });
  } catch (e) {
    res.status(500).render('500');
  }
});

app.post('/profile/edit/:tag_id', requireUser, async (req, res) => {
  const tagId = req.params.tag_id;
  try {
    const tag = await prisma.tag.findUnique({ where: { tagId }, include: { profile: true } });
    if (!tag) return res.status(404).render('404');
    if (tag.ownerId !== req.session.user.id && !req.session.user.is_admin) {
      req.flash('error', 'You do not own this tag.');
      return res.redirect('/dashboard');
    }

    // Non-medical types: validate against the registry and update the generic profile
    if (!tagTypes.isMedical(tagTypes.effectiveType(tag))) {
      const type = tagTypes.effectiveType(tag);
      const def = tagTypes.getType(type);
      if (!def) return res.status(404).render('404');
      const { errors, data: clean, values } = tagTypes.validateProfile(type, req.body);
      if (Object.keys(errors).length > 0) {
        return res.render('types/register_generic', {
          title: `Edit your ${def.label}`, noIndex: true,
          tag_id: tagId, typeDef: def, errors, values,
          formAction: `/profile/edit/${tagId}`, submitLabel: 'Save changes ✓',
        });
      }
      await prisma.tagProfile.update({
        where: { tagId }, data: { data: JSON.stringify(clean) },
      });
      req.flash('success', 'Profile updated.');
      return res.redirect('/dashboard');
    }

    if (!tag.profile) return res.status(404).render('404');
    const data = req.body;
    const update = {};

    if (data.name) {
      const n = data.name.trim();
      if (n.length >= 2 && n.length <= 100) update.name = n;
    }
    if (data.age != null) {
      const a = parseInt(data.age, 10);
      if (!isNaN(a) && a >= 1 && a <= 120) update.age = a;
    }
    if (data.mobile_primary) {
      const m = normaliseMobile(data.mobile_primary);
      if (isValidMobile(m)) update.mobilePrimary = m;
    }

    const optText = ['parent_name', 'blood_group', 'address', 'medical_conditions',
                     'allergies', 'medications', 'custom_message', 'photo_url', 'category', 'email', 'theme'];
    const fieldMap = {
      parent_name: 'parentName', blood_group: 'bloodGroup',
      medical_conditions: 'medicalConditions', custom_message: 'customMessage', photo_url: 'photoUrl',
    };
    for (const f of optText) {
      if (f in data) update[fieldMap[f] || f] = (data[f] || '').trim() || null;
    }
    for (const [snakeKey, camelKey] of [['mobile_secondary', 'mobileSecondary'], ['owner_whatsapp', 'ownerWhatsapp']]) {
      if (snakeKey in data) {
        if (!data[snakeKey]) update[camelKey] = null;
        else {
          const n = normaliseMobile(data[snakeKey]);
          if (isValidMobile(n)) update[camelKey] = n;
        }
      }
    }
    if ('latitude' in data) update.latitude = toFloat(data.latitude);
    if ('longitude' in data) update.longitude = toFloat(data.longitude);
    update.updatedAt = new Date();

    await prisma.medicalProfile.update({ where: { tagId }, data: update });
    req.flash('success', 'Profile updated.');
    return res.redirect(`/emergency/${tagId}`);
  } catch (e) {
    console.error(e);
    res.status(500).render('500');
  }
});

// =============================================================================
// P11 — Order history   P12 — Account settings
// =============================================================================
app.get('/orders', requireUser, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.session.user.id },
      include: { productListing: true },
      orderBy: { createdAt: 'desc' },
    });
    res.render('orders', { title: 'My Orders', orders: orders.map(o => formatOrder(o, false, true)) });
  } catch (e) {
    res.render('orders', { title: 'My Orders', orders: [] });
  }
});

// Customer order detail + tracking — scoped to the logged-in buyer.
app.get('/orders/:id', requireUser, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const order = await prisma.order.findFirst({
      where: { id, userId: req.session.user.id },
      include: { productListing: true },
    });
    if (!order) return res.status(404).render('404', { title: 'Order not found' });
    let addr = {};
    try { addr = JSON.parse(order.shippingAddress || '{}'); } catch (e) {}
    res.render('order_detail', {
      title: `Order #${order.id}`,
      order: formatOrder(order, false, true),
      addr,
    });
  } catch (e) {
    res.redirect('/orders');
  }
});

// ---------------------------------------------------------------------------
// Manufacturer order management — a manufacturer sees & fulfils orders for
// THEIR OWN product listings only. Admin keeps global oversight (/admin/orders).
// ---------------------------------------------------------------------------

// Returns the order iff it belongs to one of this manufacturer's listings.
async function manufacturerOwnsOrder(orderId, mfrId) {
  if (isNaN(orderId)) return null;
  return prisma.order.findFirst({
    where: { id: orderId, productListing: { manufacturerId: mfrId } },
  });
}

app.get('/manufacturer/orders', requireManufacturer, async (req, res) => {
  const mfrId = req.session.manufacturer.id;
  const statusFilter = (req.query.status || '').trim();
  const where = { productListing: { manufacturerId: mfrId } };
  if (ALLOWED_ORDER_STATUS.has(statusFilter)) where.status = statusFilter;
  try {
    const orders = await prisma.order.findMany({
      where,
      include: { productListing: true, user: true },
      orderBy: { createdAt: 'desc' },
    });
    res.render('manufacturer/orders', {
      title: 'Orders',
      statusFilter,
      orders: orders.map(o => {
        const f = formatOrder(o, true, true);
        try { f.addr = JSON.parse(o.shippingAddress || '{}'); } catch (e) { f.addr = {}; }
        return f;
      }),
    });
  } catch (e) {
    res.render('manufacturer/orders', { title: 'Orders', statusFilter: '', orders: [] });
  }
});

app.post('/manufacturer/orders/:id/dispatch', requireManufacturer, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const order = await manufacturerOwnsOrder(id, req.session.manufacturer.id);
    if (!order) { req.flash('error', 'Order not found.'); return res.redirect('/manufacturer/orders'); }
    const update = { status: 'dispatched' };
    if (req.body.tracking_id) update.trackingId = req.body.tracking_id.trim();
    await prisma.order.update({ where: { id }, data: update });
    req.flash('success', 'Order dispatched.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/manufacturer/orders');
});

app.post('/manufacturer/orders/:id/status', requireManufacturer, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const status = (req.body.status || '').trim();
    if (!ALLOWED_ORDER_STATUS.has(status)) throw new Error('Invalid status');
    const order = await manufacturerOwnsOrder(id, req.session.manufacturer.id);
    if (!order) { req.flash('error', 'Order not found.'); return res.redirect('/manufacturer/orders'); }
    const update = { status };
    if ('tracking_id' in req.body) update.trackingId = (req.body.tracking_id || '').trim() || null;
    await prisma.order.update({ where: { id }, data: update });
    req.flash('success', 'Status updated.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/manufacturer/orders');
});

app.get('/account/settings', requireUser, (req, res) => {
  res.render('account_settings', { title: 'Account settings', errors: {}, values: req.session.user });
});

app.post('/account/settings', requireUser, async (req, res) => {
  try {
    const data = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
    const update = {};
    const errors = {};

    if ('name' in data && data.name != null) update.name = (data.name || '').trim() || null;
    if (data.mobile) {
      const m = normaliseMobile(data.mobile);
      if (!isValidMobile(m)) errors.mobile = 'Mobile invalid';
      else update.mobile = m;
    }
    if (data.new_password) {
      const ok = await bcrypt.compare(data.current_password || '', user.passwordHash);
      if (!ok) errors.current_password = 'Current password incorrect';
      else if (data.new_password.length < 6) errors.new_password = 'Password must be at least 6 characters';
      else update.passwordHash = await bcrypt.hash(data.new_password, 10);
    }
    if (Object.keys(errors).length > 0) {
      return res.render('account_settings', {
        title: 'Account settings',
        errors,
        values: Object.assign({}, req.session.user, req.body),
      });
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data: update });
    req.session.user = formatUser(updated);
    req.flash('success', 'Account updated.');
    return res.redirect('/account/settings');
  } catch (e) {
    res.render('account_settings', {
      title: 'Account settings',
      errors: { _form: 'Server error' },
      values: req.session.user,
    });
  }
});

// =============================================================================
// Manufacturer
// =============================================================================
app.get('/manufacturer/register', (req, res) => {
  res.render('manufacturer/register', { title: 'Manufacturer registration', errors: {}, values: {} });
});

app.post('/manufacturer/register', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const mobile = normaliseMobile(req.body.mobile);
    const password = req.body.password || '';
    const businessName = (req.body.business_name || '').trim();
    const address = (req.body.address || '').trim() || null;
    const description = (req.body.description || '').trim() || null;
    const errors = {};

    if (!businessName || businessName.length < 2) errors.business_name = 'Business name required';
    if (!isValidEmail(email)) errors.email = 'Email invalid';
    if (!isValidMobile(mobile)) errors.mobile = 'Mobile invalid';
    if (password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (!errors.email) {
      const existing = await prisma.manufacturer.findUnique({ where: { email } });
      if (existing) errors.email = 'Email already registered';
    }
    if (Object.keys(errors).length > 0) {
      return res.render('manufacturer/register', {
        title: 'Manufacturer registration',
        errors,
        values: req.body,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.manufacturer.create({ data: { email, mobile, businessName, passwordHash, address, description } });
    req.flash('success', 'Account created. Awaiting admin approval.');
    return res.redirect('/manufacturer/login');
  } catch (e) {
    res.render('manufacturer/register', {
      title: 'Manufacturer registration',
      errors: { _form: 'Server error' },
      values: req.body,
    });
  }
});

app.get('/manufacturer/login', (req, res) => {
  res.render('manufacturer/login', { title: 'Manufacturer sign in', errors: {}, values: {} });
});

app.post('/manufacturer/login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const mfr = await prisma.manufacturer.findUnique({ where: { email } });
    if (!mfr || !(await bcrypt.compare(password, mfr.passwordHash))) {
      return res.render('manufacturer/login', {
        title: 'Manufacturer sign in',
        errors: { _form: 'Invalid credentials' },
        values: { email: req.body.email },
      });
    }
    if (mfr.isBlocked) {
      return res.render('manufacturer/login', {
        title: 'Manufacturer sign in',
        errors: { _form: 'Account blocked. Contact support.' },
        values: { email: req.body.email },
      });
    }
    req.session.manufacturer = formatManufacturer(mfr);
    if (!mfr.isApproved) {
      req.flash('info', 'Your account is awaiting admin approval. You can sign in but cannot create batches yet.');
    } else {
      req.flash('success', 'Signed in.');
    }
    return res.redirect('/manufacturer/dashboard');
  } catch (e) {
    res.render('manufacturer/login', {
      title: 'Manufacturer sign in',
      errors: { _form: 'Server error' },
      values: { email: req.body.email },
    });
  }
});

app.post('/manufacturer/logout', (req, res) => {
  req.session.manufacturer = null;
  req.session.user = null;
  req.flash('success', 'Signed out.');
  req.session.save(() => res.redirect('/manufacturer/login'));
});

app.post('/manufacturer/request-approval', requireManufacturer, async (req, res) => {
  const mfr = req.session.manufacturer;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'nitish.ns378@gmail.com';
  const SMTP_USER = process.env.SMTP_USER || '';
  const SMTP_PASS = process.env.SMTP_PASS || '';

  if (SMTP_USER && SMTP_PASS) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 6000,
        greetingTimeout: 6000,
        socketTimeout: 8000,
      });
      const reviewUrl = `${BASE_URL}/admin/manufacturers`;
      const mailOptions = {
        from: `"SafeTag Platform" <${SMTP_USER}>`,
        to: ADMIN_EMAIL,
        subject: `Manufacturer Approval Request — ${mfr.business_name}`,
        text: [
          `Manufacturer Approval Request`,
          ``,
          `Business Name : ${mfr.business_name}`,
          `Email         : ${mfr.email}`,
          `Mobile        : ${mfr.mobile}`,
          `Address       : ${mfr.address || '—'}`,
          `Description   : ${mfr.description || '—'}`,
          `Registered    : ${new Date(mfr.created_at).toLocaleString('en-IN')}`,
          ``,
          `Review at: ${reviewUrl}`,
        ].join('\n'),
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#0A2342;padding:28px 32px;text-align:center;">
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="padding-right:10px;vertical-align:middle;">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                    <circle cx="7" cy="7" r="1" fill="white" stroke="none"/>
                  </svg>
                </td>
                <td style="color:#ffffff;font-size:22px;font-weight:700;vertical-align:middle;letter-spacing:-0.3px;">SafeTag</td>
              </tr>
            </table>
            <p style="color:#5eead4;margin:8px 0 0;font-size:13px;">Admin Notification</p>
          </td>
        </tr>

        <!-- Alert banner -->
        <tr>
          <td style="background:#0D9488;padding:14px 32px;">
            <p style="margin:0;color:#ffffff;font-size:15px;font-weight:600;">
              📋 New Manufacturer Approval Request
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
              A manufacturer has submitted an approval request on SafeTag and is waiting for your review.
            </p>

            <!-- Info card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Business Name</p>
                  <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#0A2342;">${mfr.business_name}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%" style="padding:14px 20px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;vertical-align:top;">
                        <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Email</p>
                        <p style="margin:4px 0 0;font-size:13px;color:#0A2342;">${mfr.email}</p>
                      </td>
                      <td width="50%" style="padding:14px 20px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
                        <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Mobile</p>
                        <p style="margin:4px 0 0;font-size:13px;color:#0A2342;">${mfr.mobile}</p>
                      </td>
                    </tr>
                    <tr>
                      <td width="50%" style="padding:14px 20px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;vertical-align:top;">
                        <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Address</p>
                        <p style="margin:4px 0 0;font-size:13px;color:#0A2342;">${mfr.address || '—'}</p>
                      </td>
                      <td width="50%" style="padding:14px 20px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
                        <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Registered</p>
                        <p style="margin:4px 0 0;font-size:13px;color:#0A2342;">${new Date(mfr.created_at).toLocaleString('en-IN')}</p>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding:14px 20px;vertical-align:top;">
                        <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Description</p>
                        <p style="margin:4px 0 0;font-size:13px;color:#0A2342;">${mfr.description || '—'}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td style="background:#0D9488;border-radius:8px;text-align:center;">
                  <a href="${reviewUrl}" style="display:inline-block;padding:13px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">
                    Review &amp; Approve →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              SafeTag Admin · <a href="${BASE_URL}" style="color:#0D9488;text-decoration:none;">${BASE_URL}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
      };
      await Promise.race([
        transporter.sendMail(mailOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout (10s)')), 10000)),
      ]);
      console.log(`[Approval Request] email sent to ${ADMIN_EMAIL} for ${mfr.business_name}`);
    } catch (e) {
      console.error('[Approval Request] email FAILED:', e.message);
    }
  } else {
    console.log(`[Approval Request] SMTP not configured — SMTP_USER or SMTP_PASS missing.`);
  }

  req.flash('success', 'Approval request sent to admin. You will be notified once reviewed.');
  res.redirect('/manufacturer/dashboard');
});

app.get('/manufacturer/dashboard', requireManufacturer, async (req, res) => {
  try {
    const mfrId = req.session.manufacturer.id;
    const [batches, listings] = await Promise.all([
      prisma.tagBatch.findMany({ where: { manufacturerId: mfrId }, orderBy: { createdAt: 'desc' } }),
      prisma.productListing.findMany({ where: { manufacturerId: mfrId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const batchesWithCounts = await Promise.all(batches.map(async b => {
      const activated = await prisma.tag.count({ where: { batchId: b.id, isActive: true } });
      return {
        ...formatBatch(b),
        activated_count: activated,
        activation_rate: b.quantity ? Math.round(activated / b.quantity * 1000) / 10 : 0,
      };
    }));

    res.render('manufacturer/dashboard', {
      title: 'Manufacturer dashboard',
      batches: batchesWithCounts,
      listings: listings.map(l => formatProduct(l)),
    });
  } catch (e) {
    res.render('manufacturer/dashboard', { title: 'Manufacturer dashboard', batches: [], listings: [] });
  }
});

// Shared helper: generate tag rows for a paid batch (does NOT create the batch record)
async function generateTagsForBatch(batchId, manufacturerId, quantity, batchName, tagType = 'medical') {
  const existingIds = new Set(
    (await prisma.tag.findMany({ select: { tagId: true } })).map(t => t.tagId)
  );
  const tagsData = [];
  const rows = [];
  for (let i = 0; i < quantity; i++) {
    let code;
    do { code = generateTagCode(); } while (existingIds.has(code));
    existingIds.add(code);
    const url = `${BASE_URL}/t/${code}`;
    tagsData.push({ tagId: code, securityKey: null, manufacturerId, batchId, tagType });
    rows.push({ tag_id: code, full_url: url, qr_data: url, rfid_payload: url,
                batch_id: batchId, batch_name: batchName,
                created_at: new Date().toISOString() });
  }
  await prisma.tag.createMany({ data: tagsData });
  return rows;
}

function batchCsvResponse(res, batchId, batchName, rows) {
  const fname = `safetag-batch-${batchId}-${batchName.replace(/\s+/g, '_')}.csv`;
  const header = 'tag_id,security_key,full_url,qr_data,rfid_payload,batch_id,batch_name,created_at\n';
  const body = rows.map(r =>
    `${r.tag_id},,${r.full_url},${r.qr_data},${r.rfid_payload},${r.batch_id},"${r.batch_name}",${r.created_at}`
  ).join('\n');
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', `attachment; filename="${fname}"`);
  return res.send(header + body);
}

app.get('/manufacturer/batch/new', requireManufacturer, (req, res) => {
  res.render('manufacturer/batch_new', {
    title: 'New batch', errors: {}, values: {}, tagTypes: tagTypes.listTypes(),
  });
});

app.post('/manufacturer/batch/new', requireManufacturer, async (req, res) => {
  const mfr = req.session.manufacturer;
  const renderForm = (errors) => res.render('manufacturer/batch_new', {
    title: 'New batch', errors, values: req.body, tagTypes: tagTypes.listTypes(),
  });

  if (!mfr.is_approved) {
    return renderForm({ _form: 'Your account is pending admin approval.' });
  }

  const quantity = parseInt(req.body.quantity, 10) || 0;
  const batchName = (req.body.batch_name || '').trim() ||
    `Batch-${new Date().toISOString().slice(0, 10)}`;
  const tagType = (req.body.tag_type || 'medical').trim();

  if (quantity < 1 || quantity > 10000) {
    return renderForm({ _form: 'Quantity must be between 1 and 10,000' });
  }
  if (!tagTypes.isValidType(tagType)) {
    return renderForm({ _form: 'Please choose a valid tag type' });
  }

  const amountPaise = calcBatchPrice(quantity);

  try {
    // Always create a pending batch first — tags are generated only after payment confirmed
    const batch = await prisma.tagBatch.create({
      data: { manufacturerId: mfr.id, batchName, tagType, quantity,
              paidAmount: amountPaise, paymentStatus: 'pending' },
    });

    if (DUMMY_PAYMENT) {
      return res.redirect(`/manufacturer/batch/${batch.id}/pay`);
    }

    // Real Razorpay: create order and attach to batch

    const Razorpay = require('razorpay');
    const rzp = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
    const rzpOrder = await rzp.orders.create({
      amount: amountPaise, currency: 'INR', payment_capture: 1,
      receipt: `batch_${batch.id}`,
      notes: { batch_id: String(batch.id) },
    });

    await prisma.tagBatch.update({
      where: { id: batch.id },
      data: { razorpayOrderId: rzpOrder.id },
    });

    return res.redirect(`/manufacturer/batch/${batch.id}/pay`);
  } catch (e) {
    console.error(e);
    renderForm({ _form: 'Server error. Please try again.' });
  }
});

app.get('/manufacturer/batch/:id/pay', requireManufacturer, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const batch = await prisma.tagBatch.findFirst({
      where: { id, manufacturerId: req.session.manufacturer.id },
    });
    if (!batch) return res.redirect('/manufacturer/dashboard');
    if (batch.paymentStatus === 'paid') return res.redirect(`/manufacturer/batch/${id}`);
    res.render('manufacturer/batch_payment', {
      title: `Pay for batch — ${batch.batchName}`,
      batch: formatBatch(batch),
      razorpayKeyId: RAZORPAY_KEY_ID,
      mfrEmail: req.session.manufacturer.email,
      mfrName: req.session.manufacturer.business_name,
      isDummy: DUMMY_PAYMENT,
    });
  } catch (e) {
    res.redirect('/manufacturer/dashboard');
  }
});

app.post('/manufacturer/batch/:id/pay-verify', requireManufacturer, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const mfr = req.session.manufacturer;
  try {
    const batch = await prisma.tagBatch.findFirst({
      where: { id, manufacturerId: mfr.id, paymentStatus: 'pending' },
    });
    if (!batch) return res.redirect('/manufacturer/dashboard');

    if (!DUMMY_PAYMENT && !verifyRazorpaySignature(
      req.body.razorpay_order_id, req.body.razorpay_payment_id, req.body.razorpay_signature)) {
      req.flash('error', 'Payment verification failed. Contact support@safe-tag.in.');
      return res.redirect(`/manufacturer/batch/${id}/pay`);
    }

    await prisma.tagBatch.update({
      where: { id },
      data: { paymentStatus: 'paid', razorpayPaymentId: req.body.razorpay_payment_id || null },
    });

    await generateTagsForBatch(id, mfr.id, batch.quantity, batch.batchName, batch.tagType);
    req.flash('success', `Payment confirmed — ${batch.quantity} tag IDs generated. Download the CSV below.`);
    return res.redirect(`/manufacturer/batch/${id}`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Error generating tags. Contact support@safe-tag.in.');
    res.redirect(`/manufacturer/batch/${id}`);
  }
});

app.get('/manufacturer/batch/:id', requireManufacturer, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const batch = await prisma.tagBatch.findFirst({
      where: { id, manufacturerId: req.session.manufacturer.id },
    });
    if (!batch) return res.status(404).render('404');
    const tags = await prisma.tag.findMany({ where: { batchId: id }, orderBy: { createdAt: 'asc' } });
    const tagList = tags.map(t => ({
      tag_id: t.tagId,
      security_key: t.securityKey,
      is_active: t.isActive,
      scan_count: t.scanCount,
      activated_at: t.activatedAt?.toISOString() || null,
      url: `${BASE_URL}/${t.tagId}/${t.securityKey}`,
    }));
    res.render('manufacturer/batch_detail', {
      title: batch.batchName,
      batch: formatBatch(batch),
      tags: tagList,
    });
  } catch (e) {
    res.status(500).render('500');
  }
});

app.get('/manufacturer/batch/:id/csv', requireManufacturer, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const batch = await prisma.tagBatch.findFirst({
      where: { id, manufacturerId: req.session.manufacturer.id },
    });
    if (!batch) return res.status(404).render('404');
    const tags = await prisma.tag.findMany({ where: { batchId: id }, orderBy: { createdAt: 'asc' } });
    // Gate: block only if payment is pending AND no tags exist yet (pre-payment batches are exempt)
    if (batch.paymentStatus !== 'paid' && tags.length === 0) {
      req.flash('error', 'Complete payment before downloading the CSV.');
      return res.redirect(`/manufacturer/batch/${id}/pay`);
    }

    const embedQr = tags.length <= 500;
    const rows = await Promise.all(tags.map(async t => {
      const url   = `${BASE_URL}/t/${t.tagId}`;
      const qrUrl = `${BASE_URL}/qr/${t.tagId}`;
      let qrB64 = '';
      if (embedQr) {
        const buf = await QRCode.toBuffer(url, { width: 200, margin: 1 });
        qrB64 = buf.toString('base64');
      }
      return { tagId: t.tagId, url, qrUrl, qrB64,
               batchId: batch.id, batchName: batch.batchName,
               createdAt: t.createdAt?.toISOString() || '' };
    }));

    const fname = `safetag-batch-${id}-${batch.batchName.replace(/\s+/g, '_')}.csv`;
    const header = embedQr
      ? 'tag_id,full_url,qr_image_url,qr_png_base64,rfid_payload,batch_id,batch_name,created_at\n'
      : 'tag_id,full_url,qr_image_url,rfid_payload,batch_id,batch_name,created_at\n';
    const body = rows.map(r => embedQr
      ? `${r.tagId},${r.url},${r.qrUrl},${r.qrB64},${r.url},${r.batchId},"${r.batchName}",${r.createdAt}`
      : `${r.tagId},${r.url},${r.qrUrl},${r.url},${r.batchId},"${r.batchName}",${r.createdAt}`
    ).join('\n');

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename="${fname}"`);
    return res.send(header + body);
  } catch (e) {
    res.status(500).send('Error generating CSV');
  }
});

app.get('/manufacturer/listings', requireManufacturer, async (req, res) => {
  try {
    const listings = await prisma.productListing.findMany({
      where: { manufacturerId: req.session.manufacturer.id },
      orderBy: { createdAt: 'desc' },
    });
    res.render('manufacturer/listings', {
      title: 'My product listings',
      listings: listings.map(l => formatProduct(l)),
    });
  } catch (e) {
    res.render('manufacturer/listings', { title: 'My product listings', listings: [] });
  }
});

app.get('/manufacturer/listings/new', requireManufacturer, (req, res) => {
  res.render('manufacturer/listing_new', { title: 'New listing', errors: {}, values: {} });
});

app.post('/manufacturer/listings/new', requireManufacturer, async (req, res) => {
  const mfr = req.session.manufacturer;
  if (!mfr.is_approved) {
    return res.render('manufacturer/listing_new', {
      title: 'New listing',
      errors: { _form: 'Your account is pending admin approval.' },
      values: req.body,
    });
  }

  const payload = Object.assign({}, req.body);
  if (payload.price_inr) payload.price = Math.round(parseFloat(payload.price_inr) * 100);
  const { errors, parsed } = validateListing(payload, false);
  if (Object.keys(errors).length > 0) {
    return res.render('manufacturer/listing_new', { title: 'New listing', errors, values: req.body });
  }

  try {
    await prisma.productListing.create({ data: { manufacturerId: mfr.id, ...parsed } });
    req.flash('success', 'Listing submitted for approval.');
    return res.redirect('/manufacturer/listings');
  } catch (e) {
    res.render('manufacturer/listing_new', {
      title: 'New listing',
      errors: { _form: 'Server error' },
      values: req.body,
    });
  }
});

app.post('/manufacturer/listings/:id/delete', requireManufacturer, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const listing = await prisma.productListing.findFirst({
      where: { id, manufacturerId: req.session.manufacturer.id },
    });
    if (listing) {
      await prisma.productListing.delete({ where: { id } });
      req.flash('success', 'Listing deleted.');
    } else {
      req.flash('error', 'Listing not found.');
    }
  } catch (e) {
    req.flash('error', 'Server error.');
  }
  res.redirect('/manufacturer/listings');
});

// =============================================================================
// Admin
// =============================================================================
app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalTags, activatedTags, totalUsers, newUsersWeek,
      totalManufacturers, pendingManufacturers, totalOrders, pendingOrders, revenueAgg,
    ] = await Promise.all([
      prisma.tag.count(),
      prisma.tag.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.manufacturer.count(),
      prisma.manufacturer.count({ where: { isApproved: false } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'pending' } }),
      prisma.order.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: weekAgo } } }),
    ]);

    const revenueWeekPaise = revenueAgg._sum.amount || 0;
    const activationRate = totalTags ? Math.round(activatedTags / totalTags * 1000) / 10 : 0;

    const [recentUsers, recentOrders, recentMfrs] = await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.manufacturer.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);

    const recent = [
      ...recentUsers.map(u => ({ type: 'user', ts: u.createdAt.toISOString(), label: `New customer: ${u.email}` })),
      ...recentOrders.map(o => ({ type: 'order', ts: o.createdAt.toISOString(), label: `Order #${o.id} (₹${(o.amount / 100).toFixed(0)})` })),
      ...recentMfrs.map(m => ({ type: 'manufacturer', ts: m.createdAt.toISOString(), label: `Manufacturer signup: ${m.businessName}` })),
    ].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 10);

    res.render('admin/dashboard', {
      title: 'Admin dashboard',
      stats: {
        total_tags: totalTags,
        activated_tags: activatedTags,
        activation_rate: activationRate,
        total_users: totalUsers,
        new_users_week: newUsersWeek,
        total_manufacturers: totalManufacturers,
        pending_manufacturers: pendingManufacturers,
        total_orders: totalOrders,
        pending_orders: pendingOrders,
        revenue_week_paise: revenueWeekPaise,
        revenue_week_inr: Math.round(revenueWeekPaise / 100 * 100) / 100,
      },
      recent,
    });
  } catch (e) {
    console.error(e);
    res.render('admin/dashboard', { title: 'Admin dashboard', stats: {}, recent: [] });
  }
});

app.get('/admin/manufacturers', requireAdmin, async (req, res) => {
  try {
    const manufacturers = await prisma.manufacturer.findMany({ orderBy: { createdAt: 'desc' } });
    res.render('admin/manufacturers', {
      title: 'Manufacturers',
      manufacturers: manufacturers.map(formatManufacturer),
    });
  } catch (e) {
    res.render('admin/manufacturers', { title: 'Manufacturers', manufacturers: [] });
  }
});

app.post('/admin/manufacturers/:id/approve', requireAdmin, async (req, res) => {
  try {
    await prisma.manufacturer.update({
      where: { id: parseInt(req.params.id, 10) },
      data: { isApproved: true, isBlocked: false },
    });
    req.flash('success', 'Approved.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/manufacturers');
});

app.post('/admin/manufacturers/:id/block', requireAdmin, async (req, res) => {
  try {
    await prisma.manufacturer.update({
      where: { id: parseInt(req.params.id, 10) },
      data: { isBlocked: true },
    });
    req.flash('success', 'Blocked.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/manufacturers');
});

app.get('/admin/store', requireAdmin, async (req, res) => {
  try {
    const listings = await prisma.productListing.findMany({
      include: { manufacturer: true },
      orderBy: { createdAt: 'desc' },
    });
    res.render('admin/store', { title: 'Store listings', listings: listings.map(formatProduct) });
  } catch (e) {
    res.render('admin/store', { title: 'Store listings', listings: [] });
  }
});

app.post('/admin/store/:id/approve', requireAdmin, async (req, res) => {
  try {
    await prisma.productListing.update({
      where: { id: parseInt(req.params.id, 10) },
      data: { isApproved: true, isRejected: false },
    });
    req.flash('success', 'Approved.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/store');
});

app.post('/admin/store/:id/reject', requireAdmin, async (req, res) => {
  try {
    await prisma.productListing.update({
      where: { id: parseInt(req.params.id, 10) },
      data: { isApproved: false, isRejected: true },
    });
    req.flash('success', 'Rejected.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/store');
});

app.post('/admin/store/:id/feature', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const listing = await prisma.productListing.findUnique({ where: { id } });
    if (listing) {
      const isFeatured = req.body.is_featured !== undefined
        ? req.body.is_featured === 'true'
        : !listing.isFeatured;
      await prisma.productListing.update({ where: { id }, data: { isFeatured } });
    }
    req.flash('success', 'Updated.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/store');
});

app.get('/admin/orders', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status && ALLOWED_ORDER_STATUS.has(req.query.status)
      ? req.query.status : null;
    const orders = await prisma.order.findMany({
      where: status ? { status } : {},
      include: { user: true, productListing: true },
      orderBy: { createdAt: 'desc' },
    });
    res.render('admin/orders', {
      title: 'Orders',
      orders: orders.map(o => formatOrder(o, true, true)),
      statusFilter: req.query.status || '',
    });
  } catch (e) {
    res.render('admin/orders', { title: 'Orders', orders: [], statusFilter: '' });
  }
});

app.post('/admin/orders/:id/dispatch', requireAdmin, async (req, res) => {
  try {
    const update = { status: 'dispatched' };
    if (req.body.tracking_id) update.trackingId = req.body.tracking_id.trim();
    await prisma.order.update({ where: { id: parseInt(req.params.id, 10) }, data: update });
    req.flash('success', 'Dispatched.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/orders');
});

app.post('/admin/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const status = (req.body.status || '').trim();
    if (!ALLOWED_ORDER_STATUS.has(status)) throw new Error('Invalid status');
    const update = { status };
    if ('tracking_id' in req.body) update.trackingId = (req.body.tracking_id || '').trim() || null;
    await prisma.order.update({ where: { id: parseInt(req.params.id, 10) }, data: update });
    req.flash('success', 'Status updated.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/orders');
});

app.get('/admin/orders.csv', requireAdmin, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: { user: true, productListing: true },
      orderBy: { createdAt: 'desc' },
    });
    let csv = 'id,user_email,product,quantity,amount_inr,status,tracking_id,created_at\n';
    for (const o of orders) {
      const productName = (o.productListing?.name || '').replace(/"/g, '""');
      csv += `${o.id},${o.user?.email || ''},"${productName}",${o.quantity},${(o.amount / 100).toFixed(2)},${o.status},${o.trackingId || ''},${o.createdAt?.toISOString() || ''}\n`;
    }
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="safetag-orders.csv"');
    return res.send(csv);
  } catch (e) {
    res.status(500).send('Error generating CSV');
  }
});

app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    const out = await Promise.all(users.map(async u => {
      const [tagCount, orderCount] = await Promise.all([
        prisma.tag.count({ where: { ownerId: u.id } }),
        prisma.order.count({ where: { userId: u.id } }),
      ]);
      return { ...formatUser(u), tag_count: tagCount, order_count: orderCount };
    }));
    res.render('admin/users', { title: 'Users', users: out });
  } catch (e) {
    res.render('admin/users', { title: 'Users', users: [] });
  }
});

app.post('/admin/users/:id/deactivate', requireAdmin, async (req, res) => {
  try {
    await prisma.user.update({ where: { id: parseInt(req.params.id, 10) }, data: { isActive: false } });
    req.flash('success', 'Deactivated.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/activate', requireAdmin, async (req, res) => {
  try {
    await prisma.user.update({ where: { id: parseInt(req.params.id, 10) }, data: { isActive: true } });
    req.flash('success', 'Activated.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/users');
});

// =============================================================================
// Location alert API (called directly from browser JS on the emergency page)
// =============================================================================
app.post('/api/location-alert', async (req, res) => {
  try {
    const tagId = (req.body.tag_id || '').trim();
    const lat = toFloat(req.body.lat);
    const lng = toFloat(req.body.lng);

    const tag = await prisma.tag.findUnique({ where: { tagId }, include: { profile: true } });
    if (!tag) return res.json({ ok: false, message: 'Tag not found' });

    const profile = tag.profile;
    if (!profile || !profile.ownerWhatsapp) {
      return res.json({ ok: true, message: 'No alert target configured' });
    }

    const mapsUrl = (lat != null && lng != null)
      ? `https://maps.google.com/?q=${lat},${lng}` : null;
    let msgBody = `Your SafeTag (${tag.tagId}) was scanned.`;
    if (mapsUrl) msgBody += ` Location: ${mapsUrl}`;

    let sent = false;
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN_ENV) {
      try {
        const twilio = require('twilio');
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN_ENV);
        await client.messages.create({
          body: msgBody,
          from: TWILIO_WHATSAPP_FROM,
          to: `whatsapp:+91${profile.ownerWhatsapp}`,
        });
        sent = true;
      } catch (e) {
        console.error('Twilio error:', e.message);
      }
    }

    return res.json({ ok: true, delivered: sent, message: sent ? 'Owner notified' : 'Alert logged' });
  } catch (e) {
    console.error(e);
    return res.json({ ok: false, message: 'Server error' });
  }
});

// =============================================================================
// Payment (dummy / Razorpay)
// =============================================================================

// GET — show checkout page
app.get('/checkout/:productId', requireUser, async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const quantity = Math.max(1, parseInt(req.query.qty || '1', 10));
  try {
    const product = await prisma.productListing.findFirst({
      where: { id: productId, isApproved: true, isRejected: false },
      include: { manufacturer: true },
    });
    if (!product) {
      req.flash('error', 'Product not available.');
      return res.redirect('/store');
    }
    if (product.quantityAvailable < quantity) {
      req.flash('error', 'Not enough stock.');
      return res.redirect(`/store/${productId}`);
    }
    const p = formatProduct(product);

    // Pre-fill the delivery form from the user's most recent order so repeat
    // buyers don't retype their address (fully editable before payment).
    let values = {};
    let prefilled = false;
    try {
      const last = await prisma.order.findFirst({
        where: { userId: req.session.user.id, shippingAddress: { not: null } },
        orderBy: { createdAt: 'desc' },
      });
      if (last) {
        const a = JSON.parse(last.shippingAddress || '{}');
        values = {
          recipient_name: a.recipient_name || '',
          recipient_phone: a.recipient_phone || '',
          address_line1: a.address_line1 || '',
          address_line2: a.address_line2 || '',
          city: a.city || '',
          state: a.state || '',
          pincode: a.pincode || '',
        };
        prefilled = !!(values.address_line1 && values.city && values.pincode);
      }
    } catch (e) { /* fall back to a blank form */ }
    // First-time buyer: seed name/phone from their account for convenience.
    if (!prefilled) {
      values.recipient_name = values.recipient_name || req.session.user.name || '';
      values.recipient_phone = values.recipient_phone || req.session.user.mobile || '';
    }

    res.render('checkout', {
      title: `Checkout — ${product.name}`,
      noIndex: true,
      product: p,
      quantity,
      totalInr: p.price_inr * quantity,
      errors: {},
      values,
      prefilled,
    });
  } catch (e) {
    req.flash('error', 'Server error.');
    res.redirect('/store');
  }
});

app.get('/order-confirmation/:orderId', requireUser, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.session.user.id },
      include: { productListing: { include: { manufacturer: true } } },
    });
    if (!order) return res.redirect('/orders');

    const trackingId = `ST${String(order.id).padStart(6, '0')}IN`;
    const deliveryDate = new Date(order.createdAt);
    deliveryDate.setDate(deliveryDate.getDate() + 7);
    const deliveryStr = deliveryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    const meta = (() => { try { return JSON.parse(order.shippingAddress || '{}'); } catch(e) { return {}; } })();
    const paymentLabel = { upi: 'UPI Payment', card: 'Credit / Debit Card', cod: 'Cash on Delivery' }[meta.payment_method] || 'Online';
    const addrParts = [meta.address_line1, meta.address_line2, meta.city, meta.state, meta.pincode].filter(Boolean);

    res.render('order_confirmation', {
      title: 'Order Confirmed — SafeTag',
      noIndex: true,
      order: formatOrder(order, false, true),
      product: formatProduct(order.productListing),
      trackingId,
      deliveryDate: deliveryStr,
      paymentLabel,
      shippingAddress: addrParts.join(', '),
      recipientName: meta.recipient_name || req.session.user.name || 'Customer',
      userEmail: req.session.user.email || '',
      emailSent: !!meta.email_sent,
    });
  } catch (e) {
    console.error(e);
    res.redirect('/orders');
  }
});

// Build the structured shipping address (persisted as a JSON string on the order).
function buildShippingAddress(body, paymentMethod) {
  return {
    recipient_name: (body.recipient_name || '').trim(),
    recipient_phone: (body.recipient_phone || '').trim(),
    address_line1: (body.address_line1 || '').trim(),
    address_line2: (body.address_line2 || '').trim(),
    city: (body.city || '').trim(),
    state: (body.state || '').trim(),
    pincode: (body.pincode || '').trim(),
    payment_method: paymentMethod,
  };
}

// Finalize a store order (shared by the direct/COD/dummy path and the verified
// Razorpay path): best-effort confirmation email, persist the order with the
// shipping address, decrement stock, then redirect to the confirmation page.
async function finalizeStoreOrder(req, res, { product, quantity, paymentMethod, razorpayOrderId, razorpayPaymentId }) {
  const cod = paymentMethod === 'cod';
  const finalAmount = product.price * quantity + (cod ? 3000 : 0); // +30 INR = 3000 paise for COD
  const addrMeta = buildShippingAddress(req.body, paymentMethod);

  // Send order confirmation email (best-effort — never blocks the order)
  const SMTP_USER = process.env.SMTP_USER || '';
  const SMTP_PASS = process.env.SMTP_PASS || '';
  let emailSent = false;
  const userEmail = req.session.user.email || '';
  if (SMTP_USER && SMTP_PASS && userEmail) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      const trackingId = `ST${Date.now().toString().slice(-6)}IN`;
      await transporter.sendMail({
        from: `"SafeTag Orders" <${SMTP_USER}>`,
        to: userEmail,
        subject: `Order Confirmed — SafeTag ${product.name}`,
        text: [
          `Hi ${addrMeta.recipient_name},`,
          ``,
          `Your SafeTag order has been confirmed!`,
          ``,
          `Product   : ${product.name}`,
          `Quantity  : ${quantity}`,
          `Amount    : ₹${(finalAmount / 100).toFixed(0)}`,
          `Payment   : ${paymentMethod.toUpperCase()}`,
          `Tracking  : ${trackingId}`,
          ``,
          `Delivery address:`,
          `${addrMeta.address_line1}${addrMeta.address_line2 ? ', ' + addrMeta.address_line2 : ''}`,
          `${addrMeta.city}, ${addrMeta.state} — ${addrMeta.pincode}`,
          ``,
          `Expected delivery: 5–7 business days.`,
          ``,
          `Activate your tag at: ${BASE_URL}`,
          `Support: support@safe-tag.in`,
          ``,
          `— SafeTag Team`,
        ].join('\n'),
      });
      emailSent = true;
    } catch (e) {
      console.error('Order email error:', e.message);
    }
  }
  addrMeta.email_sent = emailSent;

  const newOrder = await prisma.order.create({
    data: {
      userId: req.session.user.id,
      productListingId: product.id,
      quantity,
      amount: finalAmount,
      status: 'pending',
      razorpayOrderId,
      razorpayPaymentId,
      shippingAddress: JSON.stringify(addrMeta),
    },
  });
  await prisma.productListing.update({
    where: { id: product.id },
    data: { quantityAvailable: Math.max(0, product.quantityAvailable - quantity) },
  });
  return res.redirect(`/order-confirmation/${newOrder.id}`);
}

app.post('/checkout/:productId', requireUser, async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const quantity = parseInt(req.body.quantity || '1', 10) || 1;

  try {
    const product = await prisma.productListing.findFirst({
      where: { id: productId, isApproved: true, isRejected: false },
    });
    if (!product) {
      req.flash('error', 'Product not available.');
      return res.redirect(`/store/${productId}`);
    }
    if (quantity < 1 || quantity > 100) {
      req.flash('error', 'Invalid quantity.');
      return res.redirect(`/store/${productId}`);
    }
    if (product.quantityAvailable < quantity) {
      req.flash('error', 'Insufficient stock.');
      return res.redirect(`/store/${productId}`);
    }

    const amount = product.price * quantity;
    const paymentMethod = (req.body.payment_method || 'upi').trim();
    const cod = paymentMethod === 'cod';

    // Required delivery fields are validated for every payment path.
    const addrMeta = buildShippingAddress(req.body, paymentMethod);
    if (!addrMeta.recipient_name || !addrMeta.address_line1 || !addrMeta.city || !addrMeta.pincode) {
      const p = formatProduct(product);
      return res.render('checkout', {
        title: `Checkout — ${product.name}`,
        noIndex: true,
        product: p,
        quantity,
        totalInr: p.price_inr * quantity,
        errors: { _form: 'Please fill in all required delivery fields.' },
        values: req.body,
      });
    }

    // COD and dev/dummy mode never open Razorpay — place the order directly.
    if (DUMMY_PAYMENT || cod) {
      const kind = cod ? 'cod' : 'dummy';
      return finalizeStoreOrder(req, res, {
        product,
        quantity,
        paymentMethod,
        razorpayOrderId: `order_${kind}_${crypto.randomBytes(12).toString('hex')}`,
        razorpayPaymentId: `pay_${kind}_${paymentMethod}_${Date.now()}`,
      });
    }

    // Real Razorpay (non-COD): create the order, then render the checkout modal
    // page. The order is persisted only after signature verification.
    if (amount < 100) {
      req.flash('error', 'Order amount is below the minimum payable value.');
      return res.redirect(`/store/${productId}`);
    }
    try {
      const Razorpay = require('razorpay');
      const client = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
      const rzpOrder = await client.orders.create({
        amount,
        currency: 'INR',
        payment_capture: 1,
        receipt: `store_${productId}_${Date.now()}`,
      });
      const p = formatProduct(product);
      return res.render('checkout_pay', {
        title: `Payment — ${product.name}`,
        noIndex: true,
        product: p,
        quantity,
        amount,
        currency: 'INR',
        key_id: RAZORPAY_KEY_ID,
        order_id: rzpOrder.id,
        addr: addrMeta,
        userName: req.session.user.name || addrMeta.recipient_name || '',
        userEmail: req.session.user.email || '',
      });
    } catch (e) {
      console.error('Razorpay error:', e);
      req.flash('error', 'Payment provider error.');
      return res.redirect(`/store/${productId}`);
    }
  } catch (e) {
    console.error(e);
    req.flash('error', 'Server error.');
    res.redirect(`/store/${productId}`);
  }
});

app.post('/checkout/:productId/verify', requireUser, async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  try {
    const quantity = parseInt(req.body.quantity || '1', 10) || 1;
    const product = await prisma.productListing.findUnique({ where: { id: productId } });
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/store');
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Missing signature fields → reject (never place the order).
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      req.flash('error', 'Missing payment details.');
      return res.redirect(`/checkout/${productId}`);
    }

    // Verify the HMAC-SHA256 signature. On mismatch, do NOT mark as paid.
    if (!DUMMY_PAYMENT && !verifyRazorpaySignature(
      razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      req.flash('error', 'Payment verification failed.');
      return res.redirect(`/checkout/${productId}`);
    }

    // Verified → persist the order with the shipping address carried through the
    // modal's hidden fields, send the email, and confirm.
    return finalizeStoreOrder(req, res, {
      product,
      quantity,
      paymentMethod: (req.body.payment_method || 'upi').trim(),
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Server error.');
    res.redirect(`/store/${productId}`);
  }
});

// =============================================================================
// 404 + error
// =============================================================================
app.use((req, res) => res.status(404).render('404', { title: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('500', { title: 'Server error' });
});

// =============================================================================
// Boot
// =============================================================================
module.exports = app;

if (require.main === module) {
  const os = require('os');
  app.listen(PORT, '0.0.0.0', () => {
    const ifaces = os.networkInterfaces();
    let lanIp = null;
    for (const iface of Object.values(ifaces)) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) { lanIp = alias.address; break; }
      }
      if (lanIp) break;
    }
    console.log(`SafeTag listening:`);
    console.log(`  Local:   http://localhost:${PORT}`);
    if (lanIp) console.log(`  Network: http://${lanIp}:${PORT}`);
  });
}
