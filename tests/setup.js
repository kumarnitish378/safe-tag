// Set environment variables before any module is loaded.
process.env.NODE_ENV = 'test';
process.env.NODE_SESSION_SECRET = 'test-session-secret-32-chars-long!!';
process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.BASE_URL = 'http://localhost:3000';
process.env.DUMMY_PAYMENT = 'true';
process.env.PORT = '3001';
