export type TestFrameworkName = 'jest' | 'vitest' | 'node-test' | 'bun' | 'deno' | 'playwright';

export interface TestFramework {
  name: string;
  configFiles: string[];
  binaryName: string;
}

export interface TestPatterns {
  patterns: string[];
  isRegex: boolean;
  rootDir?: string;
  roots?: string[];
  ignorePatterns?: string[];
  excludePatterns?: string[];
  dir?: string;
}

export type TestPatternResult = {
  patterns: string[];
  configDir: string;
  isRegex: boolean;
  roots?: string[];
  ignorePatterns?: string[];
  excludePatterns?: string[];
};

export type FrameworkResult = {
  directory: string;
  framework: TestFrameworkName;
};

export type SearchOutcome =
  | { status: 'found'; result: FrameworkResult }
  | { status: 'wrong_framework' }
  | { status: 'not_found' };

export const DEFAULT_TEST_PATTERNS = [
  '**/*.{test,spec}.?(c|m)[jt]s?(x)',
  '**/__tests__/**/*.?(c|m)[jt]s?(x)',
];

export const testFrameworks: TestFramework[] = [
  {
    name: 'vitest',
    configFiles: [
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
    ],
    binaryName: 'vitest',
  },
  {
    name: 'jest',
    configFiles: [
      'jest.config.js',
      'jest.config.ts',
      'jest.config.json',
      'jest.config.cjs',
      'jest.config.mjs',
      'package.json',
      'jest-e2e.json',
    ],
    binaryName: 'jest',
  },
  {
    name: 'node-test',
    configFiles: [],
    binaryName: 'node',
  },
  {
    name: 'bun',
    configFiles: ['bun.lockb', 'bun.lock'],
    binaryName: 'bun',
  },
  {
    name: 'deno',
    configFiles: ['deno.json', 'deno.jsonc'],
    binaryName: 'deno',
  },
  {
    name: 'playwright',
    configFiles: [
      'playwright.config.ts',
      'playwright.config.js',
      'playwright.config.mjs',
      'playwright.config.cjs',
    ],
    binaryName: 'playwright',
  },
];

export const allTestFrameworks: TestFramework[] = [
  ...testFrameworks,

  {
    name: 'cypress',
    configFiles: [
      'cypress.config.ts',
      'cypress.config.js',
      'cypress.config.mjs',
      'cypress.config.cjs',
    ],
    binaryName: 'cypress',
  },
];

export const DEFAULT_COVERAGE_DIR = 'coverage';
export const COVERAGE_FINAL_FILE = 'coverage-final.json';