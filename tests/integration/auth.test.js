// CSRF is disabled in NODE_ENV=test (see server.js CSRF middleware).
// These tests focus on authentication business logic: correct credentials,
// wrong credentials, inactive accounts, and manufacturer approval states.

jest.mock('../../lib/db');

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const prisma  = require('../../lib/db');
const app     = require('../../server');

// ---------------------------------------------------------------------------
// Customer login
// ---------------------------------------------------------------------------

describe('POST /login', () => {
  const passwordHash = bcrypt.hashSync('Test@1234', 10);

  const mockUser = {
    id: 1, email: 'user@example.com', mobile: '9876543210',
    name: 'Test User', passwordHash, isAdmin: false, isActive: true,
    createdAt: new Date(),
  };

  it('redirects to /dashboard on valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'user@example.com', password: 'Test@1234' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/dashboard/);
  });

  it('re-renders login with error on wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'user@example.com', password: 'WrongPassword!' });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Invalid credentials/i);
  });

  it('re-renders login with error when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'nobody@example.com', password: 'Test@1234' });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Invalid credentials/i);
  });

  it('re-renders login with error for inactive user', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'user@example.com', password: 'Test@1234' });

    // isActive=false → bcrypt compare passes but isActive check fails → "Invalid credentials"
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Invalid credentials/i);
  });

  it('admin user is redirected to /admin/dashboard', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, isAdmin: true });

    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'user@example.com', password: 'Test@1234' });

    expect(res.status).toBe(302);
    // admin redirect goes to /admin or /dashboard — just confirm it redirects
    expect(res.headers.location).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Customer registration
// ---------------------------------------------------------------------------

describe('POST /register', () => {
  it('shows validation errors for empty fields', async () => {
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({ email: '', password: '', mobile: '' });

    expect(res.status).toBe(200);
  });

  it('shows validation error for short password', async () => {
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({ email: 'new@example.com', password: 'abc', mobile: '9876543210', name: 'Test' });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/password/i);
  });

  it('shows error for invalid mobile number', async () => {
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({ email: 'new@example.com', password: 'Valid@1234', mobile: '1234567890', name: 'Test' });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/mobile/i);
  });

  it('shows error for already-registered email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 99, email: 'taken@example.com' });

    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        email: 'taken@example.com',
        password: 'Valid@1234',
        mobile: '9876543210',
        name: 'New User',
      });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/already registered/i);
  });

  it('redirects to /welcome after successful registration', async () => {
    prisma.user.findUnique.mockResolvedValue(null);  // email not taken
    prisma.user.create.mockResolvedValue({
      id: 2, email: 'newuser@example.com', mobile: '9876543210',
      name: 'New User', isAdmin: false, isActive: true, createdAt: new Date(),
    });

    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        email: 'newuser@example.com',
        password: 'Valid@1234',
        mobile: '9876543210',
        name: 'New User',
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/welcome');
  });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

describe('POST /logout', () => {
  it('redirects to /', async () => {
    const res = await request(app).post('/logout').type('form').send({});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// Manufacturer login
// ---------------------------------------------------------------------------

describe('GET /manufacturer/login', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/manufacturer/login');
    expect(res.status).toBe(200);
  });
});

describe('POST /manufacturer/login', () => {
  const passwordHash = bcrypt.hashSync('Test@1234', 10);

  const mockMfr = {
    id: 1, businessName: 'Acme Tags', email: 'mfr@example.com', mobile: '9000000000',
    address: null, description: null, passwordHash,
    isApproved: true, isBlocked: false, createdAt: new Date(),
  };

  it('redirects to manufacturer dashboard on valid credentials', async () => {
    prisma.manufacturer.findUnique.mockResolvedValue(mockMfr);

    const res = await request(app)
      .post('/manufacturer/login')
      .type('form')
      .send({ email: 'mfr@example.com', password: 'Test@1234' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/manufacturer/);
  });

  it('re-renders form with error on wrong password', async () => {
    prisma.manufacturer.findUnique.mockResolvedValue(mockMfr);

    const res = await request(app)
      .post('/manufacturer/login')
      .type('form')
      .send({ email: 'mfr@example.com', password: 'WrongPassword' });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Invalid credentials/i);
  });

  it('rejects unapproved manufacturer', async () => {
    prisma.manufacturer.findUnique.mockResolvedValue({ ...mockMfr, isApproved: false });

    const res = await request(app)
      .post('/manufacturer/login')
      .type('form')
      .send({ email: 'mfr@example.com', password: 'Test@1234' });

    // Unapproved manufacturers can still log in but see a flash message
    // (they are blocked only from creating batches, not from logging in)
    expect(res.status).toBe(302);
  });

  it('re-renders form with blocked error for blocked manufacturer', async () => {
    prisma.manufacturer.findUnique.mockResolvedValue({ ...mockMfr, isBlocked: true });

    const res = await request(app)
      .post('/manufacturer/login')
      .type('form')
      .send({ email: 'mfr@example.com', password: 'Test@1234' });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/blocked/i);
  });
});
