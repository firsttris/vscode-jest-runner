// Example jest.config.custom.js
// This could be set via "jestrunner.configPath": "jest.config.custom.js"

module.exports = {
  // Custom test pattern that includes integration tests
  testMatch: [
    '**/*.test.{js,ts,jsx,tsx}',
    '**/*.spec.{js,ts,jsx,tsx}',
    '**/*.integrationtest.{js,ts,jsx,tsx}',
  ],
  
  // Other Jest configurations
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
};
