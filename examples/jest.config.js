module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/?(*.)+(spec|test|integrationtest).?([mc])[jt]s?(x)',
    '**/__tests__/**/*.?([mc])[jt]s?(x)',
  ],
};
