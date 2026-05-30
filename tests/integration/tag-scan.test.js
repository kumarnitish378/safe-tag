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

  it('redirects to /emergency if tag is already active', async () => {
    prisma.tag.findUnique.mockResolvedValue(activeTag);

    const res = await request(app).get('/register/abc123xyz');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/emergency/);
  });

  it('returns 404 for an unknown tag ID', async () => {
    prisma.tag.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/register/unknowntag');
    expect(res.status).toBe(404);
  });
});
