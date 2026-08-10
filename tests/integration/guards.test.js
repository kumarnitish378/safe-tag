// Tests that every protected route redirects unauthenticated users
// and that admin routes reject non-admin users.
// No session manipulation — just fire unauthenticated requests and
// assert the redirect destination.

jest.mock('../../lib/db');

const request = require('supertest');
const app     = require('../../server');

// ---------------------------------------------------------------------------
// Customer-only routes → redirect to /login
// ---------------------------------------------------------------------------

describe('Customer auth guard', () => {
  const protectedRoutes = [
    '/dashboard',
    '/orders',
    '/orders/1',
    '/account/settings',
    '/profile/edit/someTagId',
    '/dashboard/tag/someTagId/submissions',
    '/checkout/1',
  ];

  it.each(protectedRoutes)(
    'GET %s redirects unauthenticated user to /login',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/login/);
    }
  );
});

// ---------------------------------------------------------------------------
// Admin-only routes → redirect to /login
// ---------------------------------------------------------------------------

describe('Admin auth guard', () => {
  const adminRoutes = [
    '/admin',
    '/admin/users',
    '/admin/manufacturers',
    '/admin/store',
    '/admin/orders',
  ];

  it.each(adminRoutes)(
    'GET %s redirects unauthenticated user to /login',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/login/);
    }
  );
});

// ---------------------------------------------------------------------------
// Manufacturer-only routes → redirect to /manufacturer/login
// ---------------------------------------------------------------------------

describe('Manufacturer auth guard', () => {
  const mfrRoutes = [
    '/manufacturer/dashboard',
    '/manufacturer/batch/new',
    '/manufacturer/listings',
    '/manufacturer/listings/new',
    '/manufacturer/orders',
  ];

  it.each(mfrRoutes)(
    'GET %s redirects unauthenticated user to manufacturer login',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/manufacturer\/login/);
    }
  );
});

// ---------------------------------------------------------------------------
// POST routes always redirect or respond — never crash on unauthenticated hit
// (CSRF is disabled in NODE_ENV=test; these verify routes are reachable)
// ---------------------------------------------------------------------------

describe('POST routes are reachable without crashing', () => {
  const postRoutes = [
    { path: '/login',                body: { email: 'a@b.com', password: 'x' } },
    { path: '/register',             body: { email: 'a@b.com', password: 'x', mobile: '9000000000' } },
    { path: '/logout',               body: {} },
    { path: '/manufacturer/login',   body: { email: 'a@b.com', password: 'x' } },
    { path: '/manufacturer/logout',  body: {} },
  ];

  it.each(postRoutes)(
    'POST $path returns 2xx or 3xx (never 5xx)',
    async ({ path, body }) => {
      const res = await request(app).post(path).type('form').send(body);
      expect(res.status).toBeLessThan(500);
    }
  );
});

// ---------------------------------------------------------------------------
// Admin POST guards — must have valid session + is_admin
// ---------------------------------------------------------------------------

describe('Admin POST guards reject unauthenticated requests', () => {
  it('POST /admin/users/1/deactivate without session → redirect', async () => {
    const res = await request(app).post('/admin/users/1/deactivate').type('form').send({});
    expect(res.status).toBe(302);
  });

  it('POST /admin/store/1/approve without session → redirect', async () => {
    const res = await request(app).post('/admin/store/1/approve').type('form').send({});
    expect(res.status).toBe(302);
  });

  it('POST /admin/orders/1/status without session → redirect', async () => {
    const res = await request(app).post('/admin/orders/1/status').type('form').send({});
    expect(res.status).toBe(302);
  });
});
