jest.mock('../../lib/db');

const request = require('supertest');
const prisma  = require('../../lib/db');
const app     = require('../../server');

beforeEach(() => {
  // Most public pages query productListing — return empty array by default.
  prisma.productListing.findMany.mockResolvedValue([]);
  prisma.productListing.findFirst.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Static / marketing pages
// ---------------------------------------------------------------------------

describe('GET /', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

  it('returns HTML', async () => {
    const res = await request(app).get('/');
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('GET /demo', () => {
  it('returns 200 without any DB call', async () => {
    const res = await request(app).get('/demo');
    expect(res.status).toBe(200);
    expect(prisma.tag.findUnique).not.toHaveBeenCalled();
  });

  it('contains SafeTag branding', async () => {
    const res = await request(app).get('/demo');
    expect(res.text).toMatch(/SafeTag/i);
  });
});

describe('GET /store', () => {
  it('returns 200 with empty product list', async () => {
    const res = await request(app).get('/store');
    expect(res.status).toBe(200);
  });

  it('accepts a valid category filter', async () => {
    const res = await request(app).get('/store?category=keychain');
    expect(res.status).toBe(200);
    expect(prisma.productListing.findMany).toHaveBeenCalled();
  });

  it('ignores an unknown category filter', async () => {
    const res = await request(app).get('/store?category=shoes');
    expect(res.status).toBe(200);
  });
});

describe('GET /store/:productId', () => {
  it('returns 404 when product does not exist', async () => {
    prisma.productListing.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/store/99999');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-numeric product ID', async () => {
    const res = await request(app).get('/store/not-a-number');
    expect(res.status).toBe(404);
  });

  it('returns 200 when product exists', async () => {
    prisma.productListing.findFirst.mockResolvedValue({
      id: 1, manufacturerId: 1, manufacturer: { businessName: 'Acme' },
      name: 'SafeTag Keychain', description: 'Great tag', price: 29900,
      category: 'keychain', quantityAvailable: 50, isApproved: true,
      isFeatured: false, isRejected: false, photoUrl: null, createdAt: new Date(),
    });
    const res = await request(app).get('/store/1');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Auth pages (GET only — just checks they render)
// ---------------------------------------------------------------------------

describe('GET /login', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
  });

  it('contains a CSRF token in the form', async () => {
    const res = await request(app).get('/login');
    expect(res.text).toMatch(/name="_csrf"/);
  });
});

describe('GET /register', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/register');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

describe('Unknown routes', () => {
  it('returns 404 for a completely unknown path', async () => {
    const res = await request(app).get('/this-does-not-exist-at-all');
    expect(res.status).toBe(404);
  });

  it('returns 404 for nested unknown path', async () => {
    const res = await request(app).get('/admin/nonexistent/deep/path');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// QR code endpoint
// ---------------------------------------------------------------------------

describe('GET /qr/:tagId', () => {
  it('returns a PNG image for any tag ID string', async () => {
    const res = await request(app).get('/qr/TESTACT1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });
});
