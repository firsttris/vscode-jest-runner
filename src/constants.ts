export const JEST_CONFIG_FILES = [
  'jest.config.js',
  'jest.config.ts',
  'jest.config.mjs',
  'jest.config.cjs',
  'jest.config.json',
  'test/jest-e2e.json',
] as const;

export const VITEST_CONFIG_FILES = [
  'vitest.config.js',
  'vitest.config.ts',
  'vitest.config.mjs',
  'vitest.config.mts',
  'vitest.config.cjs',
  'vitest.config.cts',
  'vite.config.js',
  'vite.config.ts',
  'vite.config.mjs',
  'vite.config.mts',
  'vite.config.cjs',
  'vite.config.cts',
] as const;

export const DEFAULT_COVERAGE_DIR = 'coverage';
export const COVERAGE_FINAL_FILE = 'coverage-final.json';
