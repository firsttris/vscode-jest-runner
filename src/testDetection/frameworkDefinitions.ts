export type TestFrameworkName = 'jest' | 'vitest';

export interface TestFramework {
  name: string;
  configFiles: string[];
  binaryName: string;
}

export interface TestPatterns {
  patterns: string[];
  isRegex: boolean;
  rootDir?: string;
  roots?: string[];              // Jest: multiple search directories
  ignorePatterns?: string[];     // Jest: testPathIgnorePatterns (regex)
  excludePatterns?: string[];    // Vitest: exclude (glob)
  dir?: string;                  // Vitest: base directory for test discovery
}

export type TestPatternResult = {
  patterns: string[];
  configDir: string;
  isRegex: boolean;
  roots?: string[];              // Jest: resolved roots directories
  ignorePatterns?: string[];     // Jest: testPathIgnorePatterns (regex)
  excludePatterns?: string[];    // Vitest: exclude (glob)
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
      // vite.config.* nur gültig wenn test-Attribut vorhanden (wird in getConfigPath geprüft)
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
      'test/jest-e2e.json',
    ],
    binaryName: 'jest',
  },
];
