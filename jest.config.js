module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'packages/*/src/**/*.js',
    '!packages/*/src/**/*.test.js',
    '!**/node_modules/**',
  ],
  testMatch: [
    '**/packages/*/tests/**/*.test.js',
    '**/tests/**/*.test.js',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
