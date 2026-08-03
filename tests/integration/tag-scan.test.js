jest.mock('../../lib/db');

const request = require('supertest');
const prisma  = require('../../lib/db');
const app     = require('../../server');

const activeTag = {
  tagId: 'abc123xyz', securityKey: null, isActive: true,
  manufacturerId: 1, batchId: 1, ownerId: 1,
  createdAt: new Date(), activatedAt: new Date(), scanCount: 3,
};

const inactiveTag = {
  ...activeTag, tagId: 'xyz999abc', isActive: false, ownerId: null, activatedAt: null, scanCount: 0,
};

// ---------------------------------------------------------------------------
// New short-format scan  GET /t/:code
// ---------------------------------------------------------------------------

describe('GET /t/:code — short-format tag scan', () => {
  beforeEach(() => {
    prisma.tag.update.mockResolvedValue({});
  });

  it('redirects to /emergency/:tagId for an active tag', async () => {
    prisma.tag.findUnique.mockResolvedValue(activeTag);

    const res = await request(app).get('/t/abc123xyz');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/emergency/abc123xyz');
    expect(prisma.tag.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { scanCount: { increment: 1 } } })
    );
  });

  it('redirects to /register/:tagId for an inactive tag', async () => {
    prisma.tag.findUnique.mockResolvedValue(inactiveTag);

    const res = await request(app).get('/t/xyz999abc');

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/register\/xyz999abc/);
  });

  it('returns 404 when tag does not exist', async () => {
    prisma.tag.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/t/doesnotex');

    expect(res.status).toBe(404);
    expect(prisma.tag.update).not.toHaveBeenCalled();
  });

  it('increments scan count on every hit regardless of active state', async () => {
    prisma.tag.findUnique.mockResolvedValue(inactiveTag);

    await request(app).get('/t/xyz999abc');

    expect(prisma.tag.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { scanCount: { increment: 1 } } })
    );
  });
});

// ---------------------------------------------------------------------------
// Legacy 8-char id length. Early batches used 8-char base62 ids; the current
// generateTagCode() emits 9. The scan route must accept BOTH — a hardcoded
// {9} pattern 404'd real, already-printed 8-char tags before they reached the
// DB lookup.
// ---------------------------------------------------------------------------

describe('GET /t/:code — legacy 8-char id length', () => {
  const legacy8 = { ...activeTag, tagId: '6B02ICMH' }; // 8 chars

  beforeEach(() => {
    prisma.tag.update.mockResolvedValue({});
  });

  it('routes an 8-char tag to the handler (does not 404 on length)', async () => {
    prisma.tag.findUnique.mockResolvedValue(legacy8);

    const res = await request(app).get('/t/6B02ICMH');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/emergency/6B02ICMH');
  });

  it('still 404s a 7-char code (below the accepted length)', async () => {
    prisma.tag.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/t/ABC1234');

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Case-sensitivity rescue for already-printed tags
// Early QR codes encoded an UPPER-CASED url (/t/ABC123XYZ) because the /qr
// endpoint upper-cased the id. base62 ids are case-sensitive, so the scan
// route falls back to a case-insensitive lookup (Postgres only) and then
// always redirects using the tag's canonical id.
// ---------------------------------------------------------------------------

describe('GET /t/:code — case-insensitive rescue', () => {
  const ORIGINAL_DB_URL = process.env.DATABASE_URL;

  beforeEach(() => {
    prisma.tag.update.mockResolvedValue({});
    prisma.tag.findFirst.mockReset();
  });

  afterEach(() => {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
  });

  it('resolves an upper-cased url to the canonical tag (Postgres)', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    prisma.tag.findUnique.mockResolvedValue(null);          // exact (upper) miss
    prisma.tag.findFirst.mockResolvedValue(activeTag);       // canonical: abc123xyz

    const res = await request(app).get('/t/ABC123XYZ');

    expect(res.status).toBe(302);
    // redirect must use the canonical (mixed-case) id, NOT the scanned upper-case
    expect(res.headers.location).toBe('/emergency/abc123xyz');
    expect(prisma.tag.findFirst).toHaveBeenCalledWith({
      where: { tagId: { equals: 'ABC123XYZ', mode: 'insensitive' } },
    });
  });

  it('increments scan count on the canonical id, not the scanned code', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    prisma.tag.findUnique.mockResolvedValue(null);
    prisma.tag.findFirst.mockResolvedValue(activeTag);

    await request(app).get('/t/ABC123XYZ');

    expect(prisma.tag.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tagId: 'abc123xyz' } })
    );
  });

  it('sends an inactive upper-cased tag to /register with the canonical id', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    prisma.tag.findUnique.mockResolvedValue(null);
    prisma.tag.findFirst.mockResolvedValue(inactiveTag);     // canonical: xyz999abc

    const res = await request(app).get('/t/XYZ999ABC');

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/register\/xyz999abc/);
  });

  it('prefers an exact match and never calls the fallback when one exists', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    prisma.tag.findUnique.mockResolvedValue(activeTag);

    const res = await request(app).get('/t/abc123xyz');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/emergency/abc123xyz');
    expect(prisma.tag.findFirst).not.toHaveBeenCalled();
  });

  it('does NOT fall back on SQLite (mode:insensitive unsupported) → 404', async () => {
    process.env.DATABASE_URL = 'file:./prisma/test.db';
    prisma.tag.findUnique.mockResolvedValue(null);
    prisma.tag.findFirst.mockResolvedValue(activeTag);       // would match if called

    const res = await request(app).get('/t/ABC123XYZ');

    expect(res.status).toBe(404);
    expect(prisma.tag.findFirst).not.toHaveBeenCalled();
    expect(prisma.tag.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Legacy long-format scan  GET /:tag_id/:security_key
// ---------------------------------------------------------------------------

describe('GET /:tag_id/:security_key — legacy tag scan', () => {
  const legacyActive = {
    ...activeTag, tagId: 'ABCDEF', securityKey: 'securekey1',
  };

  beforeEach(() => {
    prisma.tag.update.mockResolvedValue({});
  });

  it('redirects to /emergency/:tagId for an active tag with correct key', async () => {
    prisma.tag.findUnique.mockResolvedValue(legacyActive);

    const res = await request(app).get('/ABCDEF/securekey1');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/emergency/ABCDEF');
  });

  it('returns 404 when security key does not match', async () => {
    prisma.tag.findUnique.mockResolvedValue(legacyActive);

    const res = await request(app).get('/ABCDEF/wrongkeyxx');

    expect(res.status).toBe(404);
  });

  it('returns 404 when tag does not exist', async () => {
    prisma.tag.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/ZZZZZZ/securekey1');

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Emergency page  GET /emergency/:tag_id
// ---------------------------------------------------------------------------

describe('GET /emergency/:tag_id', () => {
  it('returns 200 with a profile', async () => {
    prisma.tag.findUnique.mockResolvedValue({
      ...activeTag,
      profile: {
        id: 1, tagId: 'abc123xyz', name: 'Ravi Kumar', age: 30,
        mobilePrimary: '9876543210', parentName: null, bloodGroup: 'O+',
        address: 'Bengaluru', latitude: null, longitude: null,
        mobileSecondary: null, email: null, medicalConditions: null,
        allergies: null, medications: null, customMessage: null,
        ownerWhatsapp: null, photoUrl: null, category: 'ADULT', theme: 'classic',
        createdAt: new Date(), updatedAt: new Date(),
      },
    });

    const res = await request(app).get('/emergency/abc123xyz');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Ravi Kumar/);
  });

  it('does NOT expose the contact number in the page source (tap-to-reveal)', async () => {
    prisma.tag.findUnique.mockResolvedValue({
      ...activeTag,
      profile: {
        id: 1, tagId: 'abc123xyz', name: 'Ravi Kumar', age: 30,
        mobilePrimary: '9876543210', mobileSecondary: '9998887776',
        ownerWhatsapp: '9876543210', parentName: null, bloodGroup: 'O+',
        address: 'Bengaluru', latitude: null, longitude: null,
        email: null, medicalConditions: null, allergies: null, medications: null,
        customMessage: null, photoUrl: null, category: 'ADULT', theme: 'classic',
        createdAt: new Date(), updatedAt: new Date(),
      },
    });

    const res = await request(app).get('/emergency/abc123xyz');
    expect(res.status).toBe(200);
    // Raw digits and tel: links must be absent — only revealed client-side on tap.
    expect(res.text).not.toMatch(/9876543210/);
    expect(res.text).not.toMatch(/9998887776/);
    expect(res.text).not.toMatch(/tel:\+91\d/);
    expect(res.text).toMatch(/Show Emergency Contact/);
    // The number is present only base64-encoded (defeats naive scrapers).
    expect(res.text).toContain(Buffer.from('9876543210', 'utf8').toString('base64'));
  });

  it('returns 404 when tag does not exist', async () => {
    prisma.tag.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/emergency/NOTFOUND');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Registration page  GET /register/:tag_id
// ---------------------------------------------------------------------------

describe('GET /register/:tag_id', () => {
  it('returns 200 for an inactive tag', async () => {
    prisma.tag.findUnique.mockResolvedValue(inactiveTag);

    const res = await request(app).get('/register/xyz999abc');
    expect(res.status).toBe(200);
  });

  it('redirects an already-active tag to its scan URL (/t/:code)', async () => {
    prisma.tag.findUnique.mockResolvedValue(activeTag);

    const res = await request(app).get('/register/abc123xyz');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/t/abc123xyz');
  });

  it('returns 404 for an unknown tag ID', async () => {
    prisma.tag.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/register/unknowntag');
    expect(res.status).toBe(404);
  });
});
