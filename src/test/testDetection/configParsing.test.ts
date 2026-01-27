import * as fs from 'fs';
import {
  viteConfigHasTestAttribute,
  packageJsonHasJestConfig,
  getIncludeFromVitestConfig,
  getTestMatchFromJestConfig,
  getVitestConfig,
} from '../../testDetection';

jest.mock('fs');
jest.mock('vscode');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('configParsing', () => {
  describe('viteConfigHasTestAttribute', () => {
    beforeEach(() => {
      mockedFs.readFileSync = jest.fn();
    });

    it('should return true when config has test: attribute', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        export default defineConfig({
          test: {
            globals: true,
          },
        });
      `);

      const result = viteConfigHasTestAttribute('/test/vite.config.ts');

      expect(result).toBe(true);
    });

    it('should return true when config has test = attribute', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        const config = {
          test = {}
        };
      `);

      const result = viteConfigHasTestAttribute('/test/vite.config.ts');

      expect(result).toBe(true);
    });

    it('should return true when config has test with space before colon', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        export default defineConfig({
          test : {
            globals: true,
          },
        });
      `);

      const result = viteConfigHasTestAttribute('/test/vite.config.ts');

      expect(result).toBe(true);
    });

    it('should return false when config has no test attribute', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        export default defineConfig({
          plugins: [react()],
          build: {
            outDir: './dist',
          },
        });
      `);

      const result = viteConfigHasTestAttribute('/test/vite.config.ts');

      expect(result).toBe(false);
    });

    it('should return false when file cannot be read', () => {
      mockedFs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = viteConfigHasTestAttribute('/test/vite.config.ts');

      expect(result).toBe(false);
    });
  });

  describe('packageJsonHasJestConfig', () => {
    beforeEach(() => {
      mockedFs.readFileSync = jest.fn();
    });

    it('should return true when package.json has jest config', () => {
      const packageJsonContent = '{"name": "test", "jest": {"testRegex": ".*\\\\.spec\\\\.ts$"}}';
      mockedFs.readFileSync = jest.fn().mockReturnValue(packageJsonContent);

      const result = packageJsonHasJestConfig('/test/package.json');

      expect(result).toBe(true);
    });

    it('should return false when package.json does not have jest config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        {
          "name": "test"
        }
      `);

      const result = packageJsonHasJestConfig('/test/package.json');

      expect(result).toBe(false);
    });

    it('should return false when file cannot be read', () => {
      mockedFs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = packageJsonHasJestConfig('/test/package.json');

      expect(result).toBe(false);
    });
  });

  describe('getIncludeFromVitestConfig', () => {
    beforeEach(() => {
      mockedFs.readFileSync = jest.fn();
    });

    it('should extract include patterns from simple vitest config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
export default defineConfig({
  test: {
    include: ['**/*.test.ts', '**/*.spec.ts']
  }
});
			`);

      const result = getIncludeFromVitestConfig('/test/vitest.config.ts');

      expect(result).toEqual(['**/*.test.ts', '**/*.spec.ts']);
    });

    it('should extract include patterns with brace expansion', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
export default defineConfig({
  test: {
    include: ['{src,tests}/**/*.{test,spec}.{js,ts,jsx,tsx}']
  }
});
			`);

      const result = getIncludeFromVitestConfig('/test/vitest.config.ts');

      expect(result).toEqual(['{src,tests}/**/*.{test,spec}.{js,ts,jsx,tsx}']);
    });

    it('should handle nested objects like coverage without getting confused', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
    },
  }
});
			`);

      const result = getIncludeFromVitestConfig('/test/vitest.config.ts');

      expect(result).toEqual([
        '{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ]);
    });

    it('should handle complex nx workspace config with multiple nested objects', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/shop',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: '@org/shop',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.{ts,tsx}'],
    },
  },
}));
			`);

      const result = getIncludeFromVitestConfig('/test/vite.config.ts');

      expect(result).toEqual([
        '{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ]);
    });

    it('should return undefined if no include is found', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
export default defineConfig({
  test: {
    globals: true
  }
});
			`);

      const result = getIncludeFromVitestConfig('/test/vitest.config.ts');

      expect(result).toBeUndefined();
    });

    it('should return undefined if no test block is found', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
export default defineConfig({
  build: {
    outDir: './dist'
  }
});
			`);

      const result = getIncludeFromVitestConfig('/test/vite.config.ts');

      expect(result).toBeUndefined();
    });

    it('should return undefined on file read error', () => {
      mockedFs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = getIncludeFromVitestConfig('/test/vitest.config.ts');

      expect(result).toBeUndefined();
    });
  });

  describe('getTestMatchFromJestConfig', () => {
    beforeEach(() => {
      mockedFs.readFileSync = jest.fn();
    });

    it('should extract testMatch patterns from jest config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
  testMatch: ['**/*.test.ts', '**/*.spec.ts']
};
			`);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toEqual({ patterns: ['**/*.test.ts', '**/*.spec.ts'], isRegex: false });
    });

    it('should extract testMatch from TypeScript export default config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
export default {
  displayName: 'test',
  preset: './jest.preset.js',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/*(*.)@(spec|test).[jt]s?(x)',
  ],
};
      `);

      const result = getTestMatchFromJestConfig('/test/jest.config.ts');

      expect(result).toEqual({
        patterns: [
          '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
          '<rootDir>/src/**/*(*.)@(spec|test).[jt]s?(x)',
        ],
        isRegex: false,
      });
    });

    it('should extract testMatch patterns with complex globs', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
  testMatch: ['<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}', '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}']
};
			`);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toEqual({
        patterns: [
          '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
          '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
        ],
        isRegex: false,
      });
    });

    it('should handle single quotes', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
  testMatch: ['**/*.test.ts']
};
			`);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toEqual({ patterns: ['**/*.test.ts'], isRegex: false });
    });

    it('should return undefined if no testMatch is found', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
  collectCoverage: true
};
			`);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toBeUndefined();
    });

    it('should return undefined on file read error', () => {
      mockedFs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toBeUndefined();
    });

    it('should extract testRegex from JSON config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`{
  "testRegex": ".e2e-spec.ts$"
}`);

      const result = getTestMatchFromJestConfig('/test/jest-e2e.json');

      expect(result).toEqual({ patterns: ['.e2e-spec.ts$'], isRegex: true });
    });

    it('should extract testRegex from NestJS E2E config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\\\.(t|j)s$": "ts-jest"
  }
}`);

      const result = getTestMatchFromJestConfig('/test/jest-e2e.json');

      expect(result).toEqual({ patterns: ['.e2e-spec.ts$'], isRegex: true, rootDir: '.' });
    });

    it('should extract testRegex array from JSON config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`{
  "testRegex": [".test.ts$", ".spec.ts$"]
}`);

      const result = getTestMatchFromJestConfig('/test/jest.config.json');

      expect(result).toEqual({ patterns: ['.test.ts$', '.spec.ts$'], isRegex: true });
    });

    it('should extract testRegex from JS config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
  testRegex: '.e2e-spec.ts$'
};
      `);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toEqual({ patterns: ['.e2e-spec.ts$'], isRegex: true });
    });

    it('should extract testRegex with rootDir from JS config (real-world example)', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
    collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx}'],
    coverageDirectory: './coverage',
    coverageReporters: ['json-summary', 'text'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    passWithNoTests: true,
    resetMocks: true,
    restoreMocks: true,
    testEnvironment: 'jsdom',
    testRegex: 'src/.*\\\\.spec\\\\.[tj]sx?',
    rootDir: '.',
};
      `);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toEqual({
        patterns: ['src/.*\\.spec\\.[tj]sx?'],
        isRegex: true,
        rootDir: '.',
      });
    });

    it('should prefer testMatch over testRegex', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`{
  "testMatch": ["**/*.test.ts"],
  "testRegex": ".e2e-spec.ts$"
}`);

      const result = getTestMatchFromJestConfig('/test/jest.config.json');

      expect(result).toEqual({ patterns: ['**/*.test.ts'], isRegex: false });
    });

    it('should extract rootDir from TypeScript config with relative path', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
export default {
  rootDir: '../../tests/',
  testMatch: [
    '<rootDir>/**/*.ts?(x)',
    '**/?(.)+(spec|test).ts?(x)',
  ],
};
      `);

      const result = getTestMatchFromJestConfig('/test/configs/jest.config.ts');

      expect(result).toEqual({
        patterns: [
          '<rootDir>/**/*.ts?(x)',
          '**/?(.)+(spec|test).ts?(x)',
        ],
        isRegex: false,
        rootDir: '../../tests/',
      });
    });

    it('should extract roots from JSON config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`{
  "roots": ["<rootDir>/src", "<rootDir>/tests"],
  "testMatch": ["**/*.test.ts"]
}`);

      const result = getTestMatchFromJestConfig('/test/jest.config.json');

      expect(result).toEqual({
        patterns: ['**/*.test.ts'],
        isRegex: false,
        roots: ['<rootDir>/src', '<rootDir>/tests'],
      });
    });

    it('should extract roots from JS config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
  roots: ['<rootDir>/src', '<rootDir>/lib'],
  testMatch: ['**/*.spec.ts']
};
      `);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toEqual({
        patterns: ['**/*.spec.ts'],
        isRegex: false,
        roots: ['<rootDir>/src', '<rootDir>/lib'],
      });
    });

    it('should extract testPathIgnorePatterns from JSON config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`{
  "testMatch": ["**/*.test.ts"],
  "testPathIgnorePatterns": ["/node_modules/", "/fixtures/", "/__mocks__/"]
}`);

      const result = getTestMatchFromJestConfig('/test/jest.config.json');

      expect(result).toEqual({
        patterns: ['**/*.test.ts'],
        isRegex: false,
        ignorePatterns: ['/node_modules/', '/fixtures/', '/__mocks__/'],
      });
    });

    it('should extract testPathIgnorePatterns from JS config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/dist/']
};
      `);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toEqual({
        patterns: ['**/*.test.ts'],
        isRegex: false,
        ignorePatterns: ['<rootDir>/build/', '<rootDir>/dist/'],
      });
    });

    it('should extract all config options together', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`{
  "rootDir": ".",
  "roots": ["<rootDir>/src", "<rootDir>/tests"],
  "testMatch": ["**/*.test.ts", "**/*.spec.ts"],
  "testPathIgnorePatterns": ["/node_modules/", "/fixtures/"]
}`);

      const result = getTestMatchFromJestConfig('/test/jest.config.json');

      expect(result).toEqual({
        patterns: ['**/*.test.ts', '**/*.spec.ts'],
        isRegex: false,
        rootDir: '.',
        roots: ['<rootDir>/src', '<rootDir>/tests'],
        ignorePatterns: ['/node_modules/', '/fixtures/'],
      });
    });

    it('should return roots and ignorePatterns even without explicit patterns', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`{
  "roots": ["<rootDir>/src"],
  "testPathIgnorePatterns": ["/fixtures/"]
}`);

      const result = getTestMatchFromJestConfig('/test/jest.config.json');

      expect(result).toEqual({
        patterns: [],
        isRegex: false,
        roots: ['<rootDir>/src'],
        ignorePatterns: ['/fixtures/'],
      });
    });
    it('should NOT extract roots from subsequent arrays if roots is a variable', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        const srcRoots = ['src'];
        export default {
          roots: srcRoots,
          setupFiles: ['./.jest/setup.ts'],
        };
      `);

      const result = getTestMatchFromJestConfig('/test/jest.config.ts');

      // Should ideally be undefined or at least NOT ['.', '.jest/setup.ts']
      // But for reproduction, we expect the current buggy behavior or just check it's not the wrong one.
      // If we fix it, it should be roots: undefined (since we can't parse variables yet/anymore).

      // The current buggy behavior would return roots: ['.jest/setup.ts'] (or similar string extraction)
      // We want to assert that it is undefined in the fixed version.
      // So let's write the test expecting the CORRECT behavior (which will fail now).
      expect(result?.roots).toBeUndefined();
    });
  });

  describe('getVitestConfig', () => {
    beforeEach(() => {
      mockedFs.readFileSync = jest.fn();
    });

    it('should extract include patterns with brackets in the pattern', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.jest.?(c|m)[jt]s?(x)', '**/__tests__/**/*.?(c|m)[jt]s?(x)'],
  }
});
      `);

      const result = getVitestConfig('/test/vitest.config.ts');

      expect(result).toEqual({
        patterns: ['**/*.jest.?(c|m)[jt]s?(x)', '**/__tests__/**/*.?(c|m)[jt]s?(x)'],
        isRegex: false,
      });
    });

    it('should extract dir from test config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'src',
    include: ['**/*.test.ts']
  }
});
      `);

      const result = getVitestConfig('/test/vitest.config.ts');

      expect(result).toEqual({
        patterns: ['**/*.test.ts'],
        isRegex: false,
        dir: 'src',
      });
    });

    it('should extract root from top-level config', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: './packages/app',
  test: {
    include: ['**/*.spec.ts']
  }
});
      `);

      const result = getVitestConfig('/test/vitest.config.ts');

      expect(result).toEqual({
        patterns: ['**/*.spec.ts'],
        isRegex: false,
        rootDir: './packages/app',
      });
    });

    it('should extract all config options together', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  test: {
    dir: 'src',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/fixtures/**']
  }
});
      `);

      const result = getVitestConfig('/test/vitest.config.ts');

      expect(result).toEqual({
        patterns: ['**/*.{test,spec}.ts'],
        isRegex: false,
        rootDir: '.',
        excludePatterns: ['**/node_modules/**', '**/fixtures/**'],
        dir: 'src',
      });
    });

    it('should return undefined when no test config is present', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: []
});
      `);

      const result = getVitestConfig('/test/vite.config.ts');

      expect(result).toBeUndefined();
    });

    it('should return config with only exclude patterns', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/e2e/**', '**/integration/**']
  }
});
      `);

      const result = getVitestConfig('/test/vitest.config.ts');

      expect(result).toEqual({
        patterns: [],
        isRegex: false,
        excludePatterns: ['**/e2e/**', '**/integration/**'],
      });
    });

    it('should return undefined on file read error', () => {
      mockedFs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = getVitestConfig('/test/vitest.config.ts');

      expect(result).toBeUndefined();
    });
  });
});
