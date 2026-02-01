module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts',
    // Handle Vite's ?raw imports for Jest - map to actual files
    '^(.*)\\.cjs\\?raw$': '$1.cjs',
    '^(.*)\\.mjs\\?raw$': '$1.mjs',
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '\\.cjs$': '<rootDir>/src/test/__mocks__/rawTransform.js',
    '\\.mjs$': '<rootDir>/src/test/__mocks__/rawTransform.js',
  },
};
