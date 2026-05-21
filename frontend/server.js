/**
 * SafeTag frontend (Node.js + Express + EJS).
 *
 * Architecture: Browser → Node.js (HTML rendering) → Flask REST API.
 * All HTML lives here. Flask renders no HTML, ever.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const axios = require('axios');

const app = express();

// CRITICAL: enable case-sensitive routing so the scan router's [A-Z0-9] tag_id
// pattern does NOT match lowercase paths like /emergency or /register.
app.set('case sensitive routing', true);
app.set('strict routing', false);

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const FLASK_API_URL = (process.env.FLASK_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const SESSION_SECRET = process.env.NODE_SESSION_SECRET || 'dev-session-secret-change-me';
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || 'dev-internal-token';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// -----------------------------------------------------------------------------
// View engine
// -----------------------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));
app.use('/static', express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
}));
app.use(flash());

// Expose common locals to every template
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.userToken = req.session.userToken || null;
  res.locals.manufacturer = req.session.manufacturer || null;
  res.locals.manufacturerToken = req.session.manufacturerToken || null;
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
// Axios helper (typed)
// -----------------------------------------------------------------------------
const api = axios.create({
  baseURL: FLASK_API_URL,
  timeout: 15000,
  validateStatus: () => true,  // always resolve; we inspect status manually
  headers: { 'X-Internal-Token': INTERNAL_API_TOKEN },
});

function authHeaders(req) {
  const h = {};
  if (req.session.userToken) h['Authorization'] = `Bearer ${req.session.userToken}`;
  else if (req.session.manufacturerToken) h['Authorization'] = `Bearer ${req.session.manufacturerToken}`;
  return h;
}

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

// =============================================================================
// P1 — Homepage
// =============================================================================
app.get('/', async (req, res) => {
  let featured = [];
  try {
    const r = await api.get('/api/store/products', { params: { featured: 'true' } });
    if (r.status === 200 && r.data.ok) featured = (r.data.products || []).slice(0, 3);
  } catch (e) {
    /* ignore — homepage still renders */
  }
  res.render('index', { title: 'SafeTag — Scan. Know. Save a Life.', featured });
});

// =============================================================================
// P2 — Store
// P3 — Product Detail
// =============================================================================
app.get('/store', async (req, res) => {
  const category = req.query.category || '';
  let products = [];
  try {
    const params = category ? { category } : {};
    const r = await api.get('/api/store/products', { params });
    if (r.status === 200 && r.data.ok) products = r.data.products || [];
  } catch (e) { /* ignore */ }
  res.render('store', { title: 'SafeTag Store', products, category });
});

app.get('/store/:productId', async (req, res) => {
  try {
    const r = await api.get(`/api/store/products/${req.params.productId}`);
    if (r.status !== 200 || !r.data.ok) return res.status(404).render('404');
    res.render('store_product', { title: r.data.product.name, product: r.data.product });
  } catch (e) {
    res.status(500).render('404');
  }
});

// =============================================================================
// P4 — Tag Scan Router
// =============================================================================
// The CORE route. Must match /:tag_id/:security_key where tag_id is 8 chars
// and security_key is URL-safe base64 (no slashes).
app.get('/:tag_id([A-Z0-9]{6,12})/:security_key([A-Za-z0-9_-]{8,32})', async (req, res) => {
  const { tag_id, security_key } = req.params;
  try {
    const r = await api.get(`/api/scan/${tag_id}/${security_key}`);
    if (r.status === 404) return res.status(404).render('404', { title: 'Tag not found' });
    if (r.status !== 200) return res.status(500).render('404', { title: 'Unable to verify tag' });

    if (r.data.is_active) {
      return res.redirect(`/emergency/${tag_id}`);
    } else {
      // Persist security key in session so /register/<tag_id> can re-check status
      req.session.lastScannedTag = { tag_id, security_key };
      return res.redirect(`/register/${tag_id}`);
    }
  } catch (e) {
    return res.status(500).render('404', { title: 'Unable to reach server' });
  }
});

// =============================================================================
// P5 — Registration Page
// =============================================================================
app.get('/register/:tag_id', async (req, res) => {
  const tagId = req.params.tag_id.toUpperCase();
  try {
    const r = await api.get(`/api/tag/${tagId}/status`);
    if (r.status === 404) return res.status(404).render('404');
    if (r.data.is_active) return res.redirect(`/emergency/${tagId}`);
    res.render('register_tag', {
      title: 'Register your SafeTag',
      tag_id: tagId,
      errors: {},
      values: {},
    });
  } catch (e) {
    res.status(500).render('404');
  }
});

app.post('/register/:tag_id', async (req, res) => {
  const tagId = req.params.tag_id.toUpperCase();
  try {
    const r = await api.post(`/api/tag/${tagId}/register`, req.body, { headers: authHeaders(req) });
    if (r.status === 200 && r.data.ok) {
      req.flash('success', 'Your SafeTag is active. Save this page or share with family.');
      return res.redirect(`/emergency/${tagId}?activated=1`);
    }
    res.render('register_tag', {
      title: 'Register your SafeTag',
      tag_id: tagId,
      errors: r.data.errors || { _form: r.data.message || 'Registration failed' },
      values: req.body,
    });
  } catch (e) {
    res.render('register_tag', {
      title: 'Register your SafeTag',
      tag_id: tagId,
      errors: { _form: 'Server error' },
      values: req.body,
    });
  }
});

// =============================================================================
// P6 — Emergency Page
// =============================================================================
app.get('/emergency/:tag_id', async (req, res) => {
  const tagId = req.params.tag_id.toUpperCase();
  try {
    const r = await api.get(`/api/emergency/${tagId}`);
    if (r.status !== 200 || !r.data.ok) return res.status(404).render('404');
    res.render('emergency', {
      title: `Emergency Profile · ${tagId}`,
      tag_id: tagId,
      profile: r.data.profile,
      activated: req.query.activated === '1',
      flaskApiUrl: FLASK_API_URL,
    });
  } catch (e) {
    res.status(500).render('404');
  }
});

// =============================================================================
// Auth pages (P7, P8)
// =============================================================================
app.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Sign in', errors: {}, values: {}, next: req.query.next || '/dashboard' });
});

app.post('/login', async (req, res) => {
  try {
    const r = await api.post('/api/auth/login', {
      email: req.body.email,
      password: req.body.password,
    });
    if (r.status === 200 && r.data.ok) {
      req.session.user = r.data.user;
      req.session.userToken = r.data.token;
      req.flash('success', 'Signed in.');
      return res.redirect(req.body.next || (r.data.user.is_admin ? '/admin' : '/dashboard'));
    }
    res.render('auth/login', {
      title: 'Sign in',
      errors: { _form: r.data.message || 'Invalid credentials' },
      values: { email: req.body.email },
      next: req.body.next || '/dashboard',
    });
  } catch (e) {
    res.render('auth/login', {
      title: 'Sign in',
      errors: { _form: 'Server error' },
      values: { email: req.body.email },
      next: req.body.next || '/dashboard',
    });
  }
});

app.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Create account', errors: {}, values: {} });
});

app.post('/register', async (req, res) => {
  try {
    const r = await api.post('/api/auth/register', req.body);
    if (r.status === 200 && r.data.ok) {
      req.session.user = r.data.user;
      req.session.userToken = r.data.token;
      req.flash('success', 'Welcome to SafeTag.');
      return res.redirect('/dashboard');
    }
    res.render('auth/register', {
      title: 'Create account',
      errors: r.data.errors || { _form: r.data.message || 'Registration failed' },
      values: req.body,
    });
  } catch (e) {
    res.render('auth/register', { title: 'Create account', errors: { _form: 'Server error' }, values: req.body });
  }
});

app.post('/logout', async (req, res) => {
  try { await api.post('/api/auth/logout', {}, { headers: authHeaders(req) }); } catch (e) {}
  req.session.user = null;
  req.session.userToken = null;
  req.flash('success', 'Signed out.');
  res.redirect('/');
});

// =============================================================================
// P9 — Customer Dashboard
// =============================================================================
app.get('/dashboard', requireUser, async (req, res) => {
  try {
    const r = await api.get('/api/user/tags', { headers: authHeaders(req) });
    const tags = (r.data && r.data.tags) || [];
    res.render('dashboard', {
      title: 'My SafeTags',
      tags,
      stats: {
        total: tags.length,
        active: tags.filter(t => t.is_active).length,
        pending: tags.filter(t => !t.is_active).length,
      },
    });
  } catch (e) {
    res.render('dashboard', { title: 'My SafeTags', tags: [], stats: { total: 0, active: 0, pending: 0 } });
  }
});

app.post('/dashboard/claim', requireUser, async (req, res) => {
  try {
    const r = await api.post('/api/user/claim-tag', req.body, { headers: authHeaders(req) });
    if (r.data.ok) req.flash('success', 'Tag added to your account.');
    else req.flash('error', r.data.message || 'Unable to claim tag.');
  } catch (e) {
    req.flash('error', 'Server error.');
  }
  res.redirect('/dashboard');
});

// =============================================================================
// P10 — Edit Profile
// =============================================================================
app.get('/profile/edit/:tag_id', requireUser, async (req, res) => {
  const tagId = req.params.tag_id.toUpperCase();
  try {
    const r = await api.get(`/api/tag/${tagId}/profile`, { headers: authHeaders(req) });
    if (r.status === 403) {
      req.flash('error', 'You do not own this tag.');
      return res.redirect('/dashboard');
    }
    if (r.status !== 200) return res.status(404).render('404');
    res.render('profile_edit', {
      title: 'Edit Emergency Profile',
      tag_id: tagId,
      profile: r.data.profile,
      errors: {},
    });
  } catch (e) {
    res.status(500).render('404');
  }
});

app.post('/profile/edit/:tag_id', requireUser, async (req, res) => {
  const tagId = req.params.tag_id.toUpperCase();
  try {
    const r = await api.put(`/api/tag/${tagId}/profile`, req.body, { headers: authHeaders(req) });
    if (r.data.ok) {
      req.flash('success', 'Profile updated.');
      return res.redirect(`/emergency/${tagId}`);
    }
    res.render('profile_edit', {
      title: 'Edit Emergency Profile',
      tag_id: tagId,
      profile: req.body,
      errors: r.data.errors || { _form: r.data.message || 'Update failed' },
    });
  } catch (e) {
    res.status(500).render('404');
  }
});

// =============================================================================
// P11 — Order history
// P12 — Account settings
// =============================================================================
app.get('/orders', requireUser, async (req, res) => {
  try {
    const r = await api.get('/api/user/orders', { headers: authHeaders(req) });
    res.render('orders', { title: 'My Orders', orders: (r.data && r.data.orders) || [] });
  } catch (e) {
    res.render('orders', { title: 'My Orders', orders: [] });
  }
});

app.get('/account/settings', requireUser, (req, res) => {
  res.render('account_settings', { title: 'Account settings', errors: {}, values: req.session.user });
});

app.post('/account/settings', requireUser, async (req, res) => {
  try {
    const r = await api.put('/api/user/settings', req.body, { headers: authHeaders(req) });
    if (r.data.ok) {
      req.session.user = r.data.user;
      req.flash('success', 'Account updated.');
      return res.redirect('/account/settings');
    }
    res.render('account_settings', {
      title: 'Account settings',
      errors: r.data.errors || { _form: r.data.message || 'Update failed' },
      values: Object.assign({}, req.session.user, req.body),
    });
  } catch (e) {
    res.render('account_settings', { title: 'Account settings', errors: { _form: 'Server error' }, values: req.session.user });
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
    const r = await api.post('/api/manufacturer/register', req.body);
    if (r.data.ok) {
      req.flash('success', 'Account created. Awaiting admin approval.');
      return res.redirect('/manufacturer/login');
    }
    res.render('manufacturer/register', {
      title: 'Manufacturer registration',
      errors: r.data.errors || { _form: r.data.message || 'Failed' },
      values: req.body,
    });
  } catch (e) {
    res.render('manufacturer/register', { title: 'Manufacturer registration', errors: { _form: 'Server error' }, values: req.body });
  }
});

app.get('/manufacturer/login', (req, res) => {
  res.render('manufacturer/login', { title: 'Manufacturer sign in', errors: {}, values: {} });
});

app.post('/manufacturer/login', async (req, res) => {
  try {
    const r = await api.post('/api/manufacturer/login', req.body);
    if (r.data.ok) {
      req.session.manufacturer = r.data.manufacturer;
      req.session.manufacturerToken = r.data.token;
      if (!r.data.is_approved) {
        req.flash('info', 'Your account is awaiting admin approval. You can sign in but cannot create batches yet.');
      } else {
        req.flash('success', 'Signed in.');
      }
      return res.redirect('/manufacturer/dashboard');
    }
    res.render('manufacturer/login', {
      title: 'Manufacturer sign in',
      errors: { _form: r.data.message || 'Invalid credentials' },
      values: { email: req.body.email },
    });
  } catch (e) {
    res.render('manufacturer/login', { title: 'Manufacturer sign in', errors: { _form: 'Server error' }, values: { email: req.body.email } });
  }
});

app.post('/manufacturer/logout', (req, res) => {
  req.session.manufacturer = null;
  req.session.manufacturerToken = null;
  res.redirect('/');
});

app.get('/manufacturer/dashboard', requireManufacturer, async (req, res) => {
  try {
    const [batchesR, listingsR] = await Promise.all([
      api.get('/api/manufacturer/batches', { headers: authHeaders(req) }),
      api.get('/api/manufacturer/listings', { headers: authHeaders(req) }),
    ]);
    res.render('manufacturer/dashboard', {
      title: 'Manufacturer dashboard',
      batches: (batchesR.data && batchesR.data.batches) || [],
      listings: (listingsR.data && listingsR.data.listings) || [],
    });
  } catch (e) {
    res.render('manufacturer/dashboard', { title: 'Manufacturer dashboard', batches: [], listings: [] });
  }
});

app.get('/manufacturer/batch/new', requireManufacturer, (req, res) => {
  res.render('manufacturer/batch_new', { title: 'New batch', errors: {}, values: {} });
});

app.post('/manufacturer/batch/new', requireManufacturer, async (req, res) => {
  try {
    const r = await api.post('/api/manufacturer/batch', req.body, {
      headers: authHeaders(req),
      responseType: 'arraybuffer',
    });
    if (r.status === 200) {
      const batchId = r.headers['x-batch-id'] || '';
      const fname = `safetag-batch-${batchId || 'new'}.csv`;
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="${fname}"`);
      return res.send(Buffer.from(r.data));
    }
    // Error path: parse JSON manually
    let body = {};
    try { body = JSON.parse(Buffer.from(r.data).toString('utf-8')); } catch (e) {}
    res.render('manufacturer/batch_new', {
      title: 'New batch',
      errors: { _form: body.message || 'Failed to create batch' },
      values: req.body,
    });
  } catch (e) {
    res.render('manufacturer/batch_new', { title: 'New batch', errors: { _form: 'Server error' }, values: req.body });
  }
});

app.get('/manufacturer/batch/:id', requireManufacturer, async (req, res) => {
  try {
    const r = await api.get(`/api/manufacturer/batch/${req.params.id}`, { headers: authHeaders(req) });
    if (r.status !== 200) return res.status(404).render('404');
    res.render('manufacturer/batch_detail', { title: r.data.batch.batch_name, batch: r.data.batch, tags: r.data.tags });
  } catch (e) {
    res.status(500).render('404');
  }
});

app.get('/manufacturer/listings', requireManufacturer, async (req, res) => {
  try {
    const r = await api.get('/api/manufacturer/listings', { headers: authHeaders(req) });
    res.render('manufacturer/listings', { title: 'My product listings', listings: r.data.listings || [] });
  } catch (e) {
    res.render('manufacturer/listings', { title: 'My product listings', listings: [] });
  }
});

app.get('/manufacturer/listings/new', requireManufacturer, (req, res) => {
  res.render('manufacturer/listing_new', { title: 'New listing', errors: {}, values: {} });
});

app.post('/manufacturer/listings/new', requireManufacturer, async (req, res) => {
  // Convert rupees to paise
  const payload = Object.assign({}, req.body);
  if (payload.price_inr) payload.price = Math.round(parseFloat(payload.price_inr) * 100);
  try {
    const r = await api.post('/api/manufacturer/listings', payload, { headers: authHeaders(req) });
    if (r.data.ok) {
      req.flash('success', 'Listing submitted for approval.');
      return res.redirect('/manufacturer/listings');
    }
    res.render('manufacturer/listing_new', {
      title: 'New listing',
      errors: r.data.errors || { _form: r.data.message || 'Failed' },
      values: req.body,
    });
  } catch (e) {
    res.render('manufacturer/listing_new', { title: 'New listing', errors: { _form: 'Server error' }, values: req.body });
  }
});

app.post('/manufacturer/listings/:id/delete', requireManufacturer, async (req, res) => {
  try {
    const r = await api.delete(`/api/manufacturer/listings/${req.params.id}`, { headers: authHeaders(req) });
    if (r.data.ok) req.flash('success', 'Listing deleted.');
    else req.flash('error', r.data.message || 'Unable to delete.');
  } catch (e) { req.flash('error', 'Server error.'); }
  res.redirect('/manufacturer/listings');
});

// =============================================================================
// Admin
// =============================================================================
app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const r = await api.get('/api/admin/stats', { headers: authHeaders(req) });
    res.render('admin/dashboard', {
      title: 'Admin dashboard',
      stats: (r.data && r.data.stats) || {},
      recent: (r.data && r.data.recent_activity) || [],
    });
  } catch (e) {
    res.render('admin/dashboard', { title: 'Admin dashboard', stats: {}, recent: [] });
  }
});

app.get('/admin/manufacturers', requireAdmin, async (req, res) => {
  try {
    const r = await api.get('/api/admin/manufacturers', { headers: authHeaders(req) });
    res.render('admin/manufacturers', { title: 'Manufacturers', manufacturers: r.data.manufacturers || [] });
  } catch (e) {
    res.render('admin/manufacturers', { title: 'Manufacturers', manufacturers: [] });
  }
});

app.post('/admin/manufacturers/:id/approve', requireAdmin, async (req, res) => {
  try { await api.post(`/api/admin/manufacturers/${req.params.id}/approve`, {}, { headers: authHeaders(req) }); req.flash('success', 'Approved.'); } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/manufacturers');
});

app.post('/admin/manufacturers/:id/block', requireAdmin, async (req, res) => {
  try { await api.post(`/api/admin/manufacturers/${req.params.id}/block`, {}, { headers: authHeaders(req) }); req.flash('success', 'Blocked.'); } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/manufacturers');
});

app.get('/admin/store', requireAdmin, async (req, res) => {
  try {
    const r = await api.get('/api/admin/listings', { headers: authHeaders(req) });
    res.render('admin/store', { title: 'Store listings', listings: r.data.listings || [] });
  } catch (e) {
    res.render('admin/store', { title: 'Store listings', listings: [] });
  }
});

app.post('/admin/store/:id/approve', requireAdmin, async (req, res) => {
  try { await api.post(`/api/admin/listings/${req.params.id}/approve`, {}, { headers: authHeaders(req) }); req.flash('success', 'Approved.'); } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/store');
});
app.post('/admin/store/:id/reject', requireAdmin, async (req, res) => {
  try { await api.post(`/api/admin/listings/${req.params.id}/reject`, {}, { headers: authHeaders(req) }); req.flash('success', 'Rejected.'); } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/store');
});
app.post('/admin/store/:id/feature', requireAdmin, async (req, res) => {
  try { await api.post(`/api/admin/listings/${req.params.id}/feature`, {}, { headers: authHeaders(req) }); req.flash('success', 'Updated.'); } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/store');
});

app.get('/admin/orders', requireAdmin, async (req, res) => {
  try {
    const params = req.query.status ? { status: req.query.status } : {};
    const r = await api.get('/api/admin/orders', { headers: authHeaders(req), params });
    res.render('admin/orders', { title: 'Orders', orders: r.data.orders || [], statusFilter: req.query.status || '' });
  } catch (e) {
    res.render('admin/orders', { title: 'Orders', orders: [], statusFilter: '' });
  }
});

app.post('/admin/orders/:id/dispatch', requireAdmin, async (req, res) => {
  try {
    await api.post(`/api/admin/orders/${req.params.id}/dispatch`, { tracking_id: req.body.tracking_id }, { headers: authHeaders(req) });
    req.flash('success', 'Dispatched.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/orders');
});

app.post('/admin/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    await api.post(`/api/admin/orders/${req.params.id}/status`, { status: req.body.status, tracking_id: req.body.tracking_id }, { headers: authHeaders(req) });
    req.flash('success', 'Status updated.');
  } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/orders');
});

app.get('/admin/orders.csv', requireAdmin, async (req, res) => {
  try {
    const r = await api.get('/api/admin/orders.csv', { headers: authHeaders(req), responseType: 'arraybuffer' });
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="safetag-orders.csv"');
    return res.send(Buffer.from(r.data));
  } catch (e) {
    res.status(500).send('error');
  }
});

app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const r = await api.get('/api/admin/users', { headers: authHeaders(req) });
    res.render('admin/users', { title: 'Users', users: r.data.users || [] });
  } catch (e) {
    res.render('admin/users', { title: 'Users', users: [] });
  }
});

app.post('/admin/users/:id/deactivate', requireAdmin, async (req, res) => {
  try { await api.post(`/api/admin/users/${req.params.id}/deactivate`, {}, { headers: authHeaders(req) }); req.flash('success', 'Deactivated.'); } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/activate', requireAdmin, async (req, res) => {
  try { await api.post(`/api/admin/users/${req.params.id}/activate`, {}, { headers: authHeaders(req) }); req.flash('success', 'Activated.'); } catch (e) { req.flash('error', 'Failed.'); }
  res.redirect('/admin/users');
});

// =============================================================================
// P25 — QR code passthrough
// =============================================================================
app.get('/qr/:tag_id', async (req, res) => {
  try {
    const r = await api.get(`/api/qr/${req.params.tag_id}`, { responseType: 'arraybuffer' });
    if (r.status !== 200) return res.status(404).render('404');
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="safetag-${req.params.tag_id}.png"`);
    return res.send(Buffer.from(r.data));
  } catch (e) {
    res.status(500).render('404');
  }
});

// =============================================================================
// Payment (dummy/Razorpay)
// =============================================================================
app.post('/checkout/:productId', requireUser, async (req, res) => {
  const productId = req.params.productId;
  const quantity = parseInt(req.body.quantity || '1', 10) || 1;
  try {
    const init = await api.post('/api/payment/initiate', {
      product_listing_id: productId,
      quantity,
    }, { headers: authHeaders(req) });

    if (!init.data.ok) {
      req.flash('error', init.data.message || 'Unable to start payment.');
      return res.redirect(`/store/${productId}`);
    }

    if (init.data.dummy) {
      // Immediately mark success in dummy mode
      const ok = await api.post('/api/payment/success', {
        product_listing_id: productId,
        quantity,
        razorpay_order_id: init.data.order_id,
        razorpay_payment_id: 'pay_dummy_' + Date.now(),
        razorpay_signature: 'sig_dummy',
        shipping_address: req.body.shipping_address || '',
      }, { headers: authHeaders(req) });
      if (ok.data.ok) {
        req.flash('success', 'Order placed (dummy payment mode).');
        return res.redirect('/orders');
      }
      req.flash('error', 'Unable to place order.');
      return res.redirect(`/store/${productId}`);
    }

    // Real Razorpay flow — render checkout page that opens Razorpay JS
    res.render('checkout', {
      title: 'Checkout',
      order_id: init.data.order_id,
      amount: init.data.amount,
      currency: init.data.currency,
      key_id: init.data.key_id,
      product_id: productId,
      quantity,
      shipping_address: req.body.shipping_address || '',
    });
  } catch (e) {
    req.flash('error', 'Server error.');
    res.redirect(`/store/${productId}`);
  }
});

app.post('/checkout/:productId/verify', requireUser, async (req, res) => {
  try {
    const r = await api.post('/api/payment/success', Object.assign({
      product_listing_id: req.params.productId,
    }, req.body), { headers: authHeaders(req) });
    if (r.data.ok) {
      req.flash('success', 'Payment received. Order placed.');
      return res.redirect('/orders');
    }
    req.flash('error', r.data.message || 'Payment verification failed.');
    res.redirect(`/store/${req.params.productId}`);
  } catch (e) {
    req.flash('error', 'Server error.');
    res.redirect(`/store/${req.params.productId}`);
  }
});

// =============================================================================
// 404 + error
// =============================================================================
app.use((req, res) => res.status(404).render('404', { title: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('404', { title: 'Server error' });
});

// =============================================================================
// Boot
// =============================================================================
app.listen(PORT, () => {
  console.log(`SafeTag frontend listening on port ${PORT}`);
  console.log(`Calling Flask API at ${FLASK_API_URL}`);
});
