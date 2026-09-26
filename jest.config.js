// importInterop 'none' keeps TypeScript's non-esModuleInterop semantics, so tests
// can patch properties on `import * as fs` namespaces; constantReexports emits
// re-exports as plain assignments so jest.spyOn can replace them.
const tsTransform = [
  'babel-jest',
  {
    babelrc: false,
    configFile: false,
    assumptions: { constantReexports: true },
    presets: ['@babel/preset-typescript'],
    plugins: [
      ['@babel/plugin-transform-modules-commonjs', { importInterop: 'none' }],
    ],
  },
];

// Babel 8 and its deps obug/js-tokens are ESM-only; compile them to CommonJS for Jest
const esmDepsTransform = [
  'babel-jest',
  {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  },
];

module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts',
    // Handle Vite's ?raw imports for Jest - map to actual files
    '^(.*)Template\\.js\\?raw$': '$1Template.js',
  },
  transformIgnorePatterns: ['/node_modules/(?!(@babel|obug|js-tokens)/)'],
  transform: {
    '^.+\\.tsx?$': tsTransform,
    'Template\\.js$': '<rootDir>/src/test/__mocks__/rawTransform.js',
    '/node_modules/.+\\.m?js$': esmDepsTransform,
  },
};
