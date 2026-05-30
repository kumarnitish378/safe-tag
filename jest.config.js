/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['./tests/setup.js'],
  clearMocks: true,
  collectCoverageFrom: [
    'lib/**/*.js',
    'server.js',
    '!lib/__mocks__/**',
  ],
  coverageReporters: ['text', 'lcov'],
  testTimeout: 10000,
};
