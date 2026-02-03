module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts',
    // Handle Vite's ?raw imports for Jest - map to actual files
    '^(.*)Template\\.js\\?raw$': '$1Template.js',
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    'Template\\.js$': '<rootDir>/src/test/__mocks__/rawTransform.js',
  },
};
