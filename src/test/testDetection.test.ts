import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  isJestUsedIn,
  findJestDirectory,
  isJestTestFile,
  clearTestDetectionCache,
  isVitestUsedIn,
  clearVitestDetectionCache,
  findVitestDirectory,
  isVitestTestFile,
  isTestFile,
  getTestFrameworkForFile,
  findTestFrameworkDirectory,
  detectTestFramework,
  viteConfigHasTestAttribute,
  getIncludeFromVitestConfig,
  getTestMatchFromJestConfig,
} from '../testDetection';

jest.mock('fs');
jest.mock('vscode');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('jestDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTestDetectionCache();
    clearVitestDetectionCache();
  });

  describe('isJestUsedIn', () => {
    const testDir = '/test/project';

    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should return true when Jest binary exists', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'node_modules', '.bin', 'jest');
      });

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(
        path.join(testDir, 'node_modules', '.bin', 'jest'),
      );
    });

    it('should return true when Jest binary (.cmd) exists on Windows', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return (
          filePath === path.join(testDir, 'node_modules', '.bin', 'jest.cmd')
        );
      });

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when jest.config.js exists', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'jest.config.js');
      });

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when jest.config.ts exists', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'jest.config.ts');
      });

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when jest.config.json exists', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'jest.config.json');
      });

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when Jest is in dependencies', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          dependencies: {
            jest: '^29.0.0',
          },
        }),
      );

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        path.join(testDir, 'package.json'),
        'utf8',
      );
    });

    it('should return true when Jest is in devDependencies', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          devDependencies: {
            jest: '^29.0.0',
          },
        }),
      );

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when Jest is in peerDependencies', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          peerDependencies: {
            jest: '^29.0.0',
          },
        }),
      );

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when Jest config is in package.json', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          jest: {
            preset: 'ts-jest',
          },
        }),
      );

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return false when no Jest indicators are found', () => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = isJestUsedIn(testDir);

      expect(result).toBe(false);
    });

    it('should return false when package.json exists but has no Jest', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          dependencies: {
            react: '^18.0.0',
          },
        }),
      );

      const result = isJestUsedIn(testDir);

      expect(result).toBe(false);
    });

    it('should cache results for the same directory', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'jest.config.js');
      });

      const result1 = isJestUsedIn(testDir);
      expect(result1).toBe(true);
      const firstCallCount = mockedFs.existsSync.mock.calls.length;

      const result2 = isJestUsedIn(testDir);
      expect(result2).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledTimes(firstCallCount);
    });

    it('should handle errors gracefully', () => {
      mockedFs.existsSync = jest.fn().mockImplementation(() => {
        throw new Error('File system error');
      });

      const result = isJestUsedIn(testDir);

      expect(result).toBe(false);
    });

    it('should handle invalid JSON in package.json', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue('invalid json');

      const result = isJestUsedIn(testDir);

      expect(result).toBe(false);
    });
  });

  describe('findJestDirectory', () => {
    const rootPath = '/workspace/project';
    const filePath =
      '/workspace/project/src/components/__tests__/Button.test.ts';

    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));
    });

    it('should find Jest in the immediate parent directory', () => {
      const testDir = '/workspace/project/src/components/__tests__';
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'jest.config.js');
      });

      const result = findJestDirectory(filePath);

      expect(result).toBe(testDir);
    });

    it('should find Jest in parent directories', () => {
      const jestDir = '/workspace/project/src';
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(jestDir, 'jest.config.js');
      });

      const result = findJestDirectory(filePath);

      expect(result).toBe(jestDir);
    });

    it('should find Jest in workspace root', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(rootPath, 'jest.config.js');
      });

      const result = findJestDirectory(filePath);

      expect(result).toBe(rootPath);
    });

    it('should return undefined when no Jest is found', () => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = findJestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should return undefined when file is not in workspace', () => {
      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(
        () => undefined,
      );

      const result = findJestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should return undefined when Cypress is found closer than Jest', () => {
      const cypressDir = '/workspace/project/src/components/__tests__';
      const jestDir = '/workspace/project';

      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        if (filePath === path.join(cypressDir, 'cypress.config.js')) {
          return true;
        }
        if (filePath === path.join(jestDir, 'jest.config.js')) {
          return true;
        }
        return false;
      });
      mockedFs.readFileSync = jest.fn();

      const result = findJestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should return undefined when Vitest is found closer than Jest', () => {
      const vitestDir = '/workspace/project/src';
      const jestDir = '/workspace/project';

      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        if (filePath === path.join(vitestDir, 'vitest.config.js')) {
          return true;
        }
        if (filePath === path.join(jestDir, 'jest.config.js')) {
          return true;
        }
        return false;
      });

      const result = findJestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should return undefined when Playwright is found closer than Jest', () => {
      const playwrightDir = '/workspace/project/src/components';
      const jestDir = '/workspace/project';

      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        if (filePath === path.join(playwrightDir, 'playwright.config.ts')) {
          return true;
        }
        if (filePath === path.join(jestDir, 'jest.config.js')) {
          return true;
        }
        return false;
      });

      const result = findJestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should detect Jest from package.json', () => {
      const jestDir = '/workspace/project/src';
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(jestDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          devDependencies: {
            jest: '^29.0.0',
          },
        }),
      );

      const result = findJestDirectory(filePath);

      expect(result).toBe(jestDir);
    });

    it('should detect Jest from binary', () => {
      const jestDir = '/workspace/project';
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(jestDir, 'node_modules', '.bin', 'jest');
      });

      const result = findJestDirectory(filePath);

      expect(result).toBe(jestDir);
    });

    it('should stop at workspace root boundary', () => {
      const outsidePath = '/different/workspace/file.test.ts';
      const outsideRoot = '/different/workspace';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: outsideRoot },
      }));

      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === '/different/jest.config.js';
      });

      const result = findJestDirectory(outsidePath);

      expect(result).toBeUndefined();
    });
  });

  describe('isJestTestFile', () => {
    const rootPath = '/workspace/project';

    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));
    });

    it('should return true for .test.js files in Jest directory', () => {
      const filePath = '/workspace/project/src/utils.test.js';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(true);
    });

    it('should return true for .spec.ts files in Jest directory', () => {
      const filePath = '/workspace/project/src/utils.spec.ts';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(true);
    });

    it('should return true for .test.tsx files in Jest directory', () => {
      const filePath = '/workspace/project/src/Component.test.tsx';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(true);
    });

    it('should return true for .spec.jsx files in Jest directory', () => {
      const filePath = '/workspace/project/src/Component.spec.jsx';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(true);
    });

    it('should return false for non-test files', () => {
      const filePath = '/workspace/project/src/utils.js';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(false);
    });

    it('should return false for test files not in Jest directory', () => {
      const filePath = '/workspace/project/src/utils.test.js';
      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = isJestTestFile(filePath);

      expect(result).toBe(false);
    });

    it('should return false for files with test in the name but wrong extension', () => {
      const filePath = '/workspace/project/src/utils.test.md';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(false);
    });

    it('should be case-insensitive for test patterns', () => {
      const filePath = '/workspace/project/src/utils.TEST.JS';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(true);
    });

    it('should return false when file is in Cypress directory', () => {
      const filePath = '/workspace/project/cypress/integration/app.spec.js';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath ===
            path.join(
              '/workspace/project/cypress/integration',
              'cypress.config.js',
            ) ||
          fsPath ===
            path.join('/workspace/project/cypress', 'cypress.config.js')
        );
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(false);
    });

    it('should handle files in deeply nested directories', () => {
      const filePath =
        '/workspace/project/src/components/atoms/Button/__tests__/Button.test.tsx';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(true);
    });

    it('should return false for empty file path', () => {
      const result = isJestTestFile('');

      expect(result).toBe(false);
    });

    it('should handle test files with multiple dots in name', () => {
      const filePath = '/workspace/project/src/utils.helper.test.js';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(true);
    });
  });

  describe('Framework detection and priority', () => {
    const rootPath = '/workspace/project';
    const filePath = '/workspace/project/src/app.test.ts';

    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));
    });

    it('should prioritize closer framework over Jest at root', () => {
      const srcDir = '/workspace/project/src';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        if (fsPath === path.join(srcDir, 'vitest.config.ts')) {
          return true;
        }
        if (fsPath === path.join(rootPath, 'jest.config.js')) {
          return true;
        }
        return false;
      });

      const result = findJestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should detect Jest when it is the only framework', () => {
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = findJestDirectory(filePath);

      expect(result).toBe(rootPath);
    });

    it('should prefer package.json framework detection over config files', () => {
      const srcDir = '/workspace/project/src';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(srcDir, 'package.json') ||
          fsPath === path.join(rootPath, 'jest.config.js')
        );
      });
      mockedFs.readFileSync = jest.fn((filePath: fs.PathOrFileDescriptor) => {
        if (filePath === path.join(srcDir, 'package.json')) {
          return JSON.stringify({
            devDependencies: {
              vitest: '^0.34.0',
            },
          });
        }
        return '{}';
      }) as any;

      const result = findJestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should handle multiple Jest configurations at different levels', () => {
      const srcDir = '/workspace/project/src';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(srcDir, 'jest.config.js') ||
          fsPath === path.join(rootPath, 'jest.config.js')
        );
      });

      const result = findJestDirectory(filePath);

      expect(result).toBe(srcDir);
    });
  });

  describe('Edge cases and error handling', () => {
    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should handle circular directory references gracefully', () => {
      const filePath = '/workspace/file.test.ts';
      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: '/workspace' },
      }));

      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = findJestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should handle root directory correctly', () => {
      const filePath = '/file.test.ts';
      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: '/' },
      }));

      const result = findJestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should handle malformed package.json gracefully', () => {
      const testDir = '/test/project';
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn(() => {
        throw new Error('Read error');
      }) as any;

      const result = isJestUsedIn(testDir);

      expect(result).toBe(false);
    });

    it('should handle special characters in file paths', () => {
      const filePath = '/workspace/project/src/[id]/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(true);
    });

    // Note: This test can only run accurately on Windows because path operations
    // (dirname, relative, etc.) behave differently on Unix vs Windows systems
    (process.platform === 'win32' ? it : it.skip)(
      'should handle Windows-style paths',
      () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', {
          value: 'win32',
        });

        const filePath = 'C:\\workspace\\project\\src\\component.test.ts';
        const rootPath = 'C:\\workspace\\project';

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = String(fsPath);
          return (
            pathStr === path.join(rootPath, 'jest.config.js') ||
            pathStr === path.join(rootPath, 'node_modules', '.bin', 'jest') ||
            pathStr === path.join(rootPath, 'node_modules', '.bin', 'jest.cmd')
          );
        });

        mockedFs.readFileSync = jest
          .fn()
          .mockImplementation((fsPath: fs.PathLike) => {
            const pathStr = String(fsPath);
            if (pathStr.includes('jest.config')) {
              return `module.exports = { testMatch: ['**/*.{test,spec}.{js,jsx,ts,tsx}'] };`;
            }
            if (pathStr.includes('package.json')) {
              return JSON.stringify({ devDependencies: { jest: '^29.0.0' } });
            }
            return '';
          });

        const result = isJestTestFile(filePath);

        expect(result).toBe(true);

        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
        });
      },
    );
  });

  describe('isVitestUsedIn', () => {
    const testDir = '/test/project';

    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should return true when Vitest binary exists', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return (
          filePath === path.join(testDir, 'node_modules', '.bin', 'vitest')
        );
      });

      const result = isVitestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when vitest.config.ts exists', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'vitest.config.ts');
      });

      const result = isVitestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when vitest.config.js exists', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'vitest.config.js');
      });

      const result = isVitestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when vitest.config.mjs exists', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'vitest.config.mjs');
      });

      const result = isVitestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return true when Vitest is in devDependencies', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          devDependencies: {
            vitest: '^1.0.0',
          },
        }),
      );

      const result = isVitestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return false when Vitest is not found', () => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = isVitestUsedIn(testDir);

      expect(result).toBe(false);
    });

    it('should cache results', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'vitest.config.ts');
      });

      isVitestUsedIn(testDir);
      isVitestUsedIn(testDir);

      const callCountAfterFirst = (mockedFs.existsSync as jest.Mock).mock.calls
        .length;
      isVitestUsedIn(testDir);
      expect(mockedFs.existsSync).toHaveBeenCalledTimes(callCountAfterFirst);
    });

    it('should return true when vite.config.ts exists with test attribute', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'vite.config.ts');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        export default defineConfig({
          test: {
            globals: true,
          },
        });
      `);

      const result = isVitestUsedIn(testDir);

      expect(result).toBe(true);
    });

    it('should return false when vite.config.ts exists without test attribute', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'vite.config.ts');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        export default defineConfig({
          plugins: [react()],
        });
      `);

      const result = isVitestUsedIn(testDir);

      expect(result).toBe(false);
    });
  });

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

      expect(result).toEqual(['**/*.test.ts', '**/*.spec.ts']);
    });

    it('should extract testMatch patterns with complex globs', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
  testMatch: ['<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}', '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}']
};
			`);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toEqual([
        '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
        '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
      ]);
    });

    it('should handle single quotes', () => {
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
module.exports = {
  testMatch: ['**/*.test.ts']
};
			`);

      const result = getTestMatchFromJestConfig('/test/jest.config.js');

      expect(result).toEqual(['**/*.test.ts']);
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
  });

  describe('findVitestDirectory', () => {
    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should find Vitest directory when vitest.config.ts exists', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'vitest.config.ts');
      });

      const result = findVitestDirectory(filePath);

      expect(result).toBe(rootPath);
    });

    it('should return undefined when Vitest is not found', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = findVitestDirectory(filePath);

      expect(result).toBeUndefined();
    });

    it('should return undefined when Jest is found instead of Vitest', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = findVitestDirectory(filePath);

      expect(result).toBeUndefined();
    });
  });

  describe('isVitestTestFile', () => {
    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
    });

    it('should return true for .test.ts file in Vitest project', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'vitest.config.ts');
      });

      const result = isVitestTestFile(filePath);

      expect(result).toBe(true);
    });

    it('should return false for non-test files', () => {
      const filePath = '/workspace/project/src/component.ts';

      const result = isVitestTestFile(filePath);

      expect(result).toBe(false);
    });

    it('should return false when not in Vitest project', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = isVitestTestFile(filePath);

      expect(result).toBe(false);
    });
  });

  describe('isTestFile', () => {
    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
    });

    it('should return true for Jest test file', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isTestFile(filePath);

      expect(result).toBe(true);
    });

    it('should return true for Vitest test file', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'vitest.config.ts');
      });

      const result = isTestFile(filePath);

      expect(result).toBe(true);
    });

    it('should return false for non-test file', () => {
      const filePath = '/workspace/project/src/component.ts';

      const result = isTestFile(filePath);

      expect(result).toBe(false);
    });

    describe('with custom testFilePattern', () => {
      let getConfigurationMock: jest.Mock;
      let configMock: any;

      beforeEach(() => {
        configMock = {
          get: jest.fn(),
        };
        getConfigurationMock = jest.fn().mockReturnValue(configMock);
        (vscode.workspace.getConfiguration as jest.Mock) = getConfigurationMock;
      });

      it('should not match integrationtest files with default pattern', () => {
        const filePath = '/workspace/project/src/somename.integrationtest.ts';
        const rootPath = '/workspace/project';

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          return fsPath === path.join(rootPath, 'jest.config.js');
        });

        configMock.get.mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'jestrunner.testFilePattern') {
            return defaultValue;
          }
          return defaultValue;
        });

        const result = isTestFile(filePath);

        expect(result).toBe(false);
      });

      it('should read testMatch from jest.config.js and match integrationtest files', () => {
        const filePath = '/workspace/project/src/somename.integrationtest.ts';
        const rootPath = '/workspace/project';

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = String(fsPath);
          return (
            pathStr === path.join(rootPath, 'jest.config.js') ||
            pathStr === path.join(rootPath, 'src', 'jest.config.js') ||
            pathStr.includes('jest.config')
          );
        });

        mockedFs.readFileSync = jest
          .fn()
          .mockImplementation((fsPath: fs.PathLike) => {
            const pathStr = String(fsPath);
            if (pathStr.includes('jest.config.js')) {
              return `module.exports = {
              testMatch: [
                '**/?(*.)+(spec|test|integrationtest).?([mc])[jt]s?(x)',
                '**/__tests__/**/*.?([mc])[jt]s?(x)',
              ],
            };`;
            }
            if (pathStr.includes('package.json')) {
              return JSON.stringify({
                devDependencies: { jest: '^29.0.0' },
              });
            }
            return '';
          });

        configMock.get.mockImplementation((key: string, defaultValue?: any) => {
          // No explicit testFilePattern configured
          return defaultValue;
        });

        const result = isTestFile(filePath);

        expect(result).toBe(true);
      });

      it.skip('should read include from vitest.config.ts', () => {
        const filePath = '/workspace/project/src/somename.integrationtest.ts';
        const rootPath = '/workspace/project';

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = String(fsPath);
          return (
            pathStr === path.join(rootPath, 'vitest.config.ts') ||
            pathStr === path.join(rootPath, 'src', 'vitest.config.ts') ||
            pathStr.includes('vitest.config')
          );
        });

        mockedFs.readFileSync = jest
          .fn()
          .mockImplementation((fsPath: fs.PathLike) => {
            const pathStr = String(fsPath);
            if (pathStr.includes('vitest.config.ts')) {
              return `export default defineConfig({
              test: {
                include: ['**/*.{test,spec,integrationtest}.{js,jsx,ts,tsx}'],
              },
            });`;
            }
            if (pathStr.includes('package.json')) {
              return JSON.stringify({
                devDependencies: { vitest: '^0.34.0' },
              });
            }
            return '';
          });

        configMock.get.mockImplementation((key: string, defaultValue?: any) => {
          // No explicit testFilePattern configured
          return defaultValue;
        });

        const result = isTestFile(filePath);

        expect(result).toBe(true);
      });
    });
  });

  describe('getTestFrameworkForFile', () => {
    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should return jest for Jest project', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = getTestFrameworkForFile(filePath);

      expect(result).toBe('jest');
    });

    it('should return vitest for Vitest project', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'vitest.config.ts');
      });

      const result = getTestFrameworkForFile(filePath);

      expect(result).toBe('vitest');
    });

    it('should return undefined when no framework is found', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = getTestFrameworkForFile(filePath);

      expect(result).toBeUndefined();
    });

    it('should prioritize Vitest when both are present in package.json', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          devDependencies: {
            jest: '^29.0.0',
            vitest: '^1.0.0',
          },
        }),
      );

      const result = getTestFrameworkForFile(filePath);

      expect(result).toBe('vitest');
    });
  });

  describe('findTestFrameworkDirectory', () => {
    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should find Jest directory and return framework info', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = findTestFrameworkDirectory(filePath);

      expect(result).toEqual({
        directory: rootPath,
        framework: 'jest',
      });
    });

    it('should find Vitest directory and return framework info', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'vitest.config.ts');
      });

      const result = findTestFrameworkDirectory(filePath);

      expect(result).toEqual({
        directory: rootPath,
        framework: 'vitest',
      });
    });

    it('should find specific framework when targetFramework is specified', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'vitest.config.ts');
      });

      const result = findTestFrameworkDirectory(filePath, 'vitest');

      expect(result).toEqual({
        directory: rootPath,
        framework: 'vitest',
      });
    });

    it('should return undefined when target framework is not found', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(rootPath, 'vitest.config.ts');
      });

      const result = findTestFrameworkDirectory(filePath, 'jest');

      expect(result).toBeUndefined();
    });
  });

  describe('detectTestFramework', () => {
    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should detect Jest from config file', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'jest.config.js');
      });

      const result = detectTestFramework(testDir);

      expect(result).toBe('jest');
    });

    it('should detect Vitest from config file', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'vitest.config.ts');
      });

      const result = detectTestFramework(testDir);

      expect(result).toBe('vitest');
    });

    it('should detect Jest from package.json', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          devDependencies: {
            jest: '^29.0.0',
          },
        }),
      );

      const result = detectTestFramework(testDir);

      expect(result).toBe('jest');
    });

    it('should detect Vitest from package.json', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          devDependencies: {
            vitest: '^1.0.0',
          },
        }),
      );

      const result = detectTestFramework(testDir);

      expect(result).toBe('vitest');
    });

    it('should prioritize Vitest over Jest when both are in package.json', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'package.json');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          devDependencies: {
            jest: '^29.0.0',
            vitest: '^1.0.0',
          },
        }),
      );

      const result = detectTestFramework(testDir);

      expect(result).toBe('vitest');
    });

    it('should return undefined when no framework is found', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = detectTestFramework(testDir);

      expect(result).toBeUndefined();
    });

    it('should detect Cypress from config file', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'cypress.config.ts');
      });

      const result = detectTestFramework(testDir);

      expect(result).toBe('cypress');
    });

    it('should detect Playwright from config file', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'playwright.config.ts');
      });

      const result = detectTestFramework(testDir);

      expect(result).toBe('playwright');
    });

    it('should detect Jest when vite.config exists without test attribute and jest.config exists', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(testDir, 'vite.config.ts') ||
          fsPath === path.join(testDir, 'jest.config.js')
        );
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        export default defineConfig({
          plugins: [react()],
        });
      `);

      const result = detectTestFramework(testDir);

      expect(result).toBe('jest');
    });

    it('should detect Vitest when vite.config exists with test attribute', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'vite.config.ts');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        export default defineConfig({
          test: {
            globals: true,
            environment: 'jsdom',
          },
        });
      `);

      const result = detectTestFramework(testDir);

      expect(result).toBe('vitest');
    });

    it('should not detect Vitest when only vite.config exists without test attribute', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === path.join(testDir, 'vite.config.ts');
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        export default defineConfig({
          plugins: [react()],
          build: {
            outDir: './dist',
          },
        });
      `);

      const result = detectTestFramework(testDir);

      expect(result).toBeUndefined();
    });

    it('should detect Vitest from vite.config.ts with test attribute even when jest.config.js also exists', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(testDir, 'vite.config.ts') ||
          fsPath === path.join(testDir, 'jest.config.js')
        );
      });
      mockedFs.readFileSync = jest.fn().mockReturnValue(`
        export default defineConfig({
          test: {
            globals: true,
          },
        });
      `);

      const result = detectTestFramework(testDir);

      expect(result).toBe('vitest');
    });
  });

  describe('matchesTestFilePattern with custom config paths', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      clearTestDetectionCache();
      clearVitestDetectionCache();
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should use custom Jest config path when configured', () => {
      const rootPath = '/workspace/project';
      const testFile = path.join(rootPath, 'src', 'component.test.ts');
      const customConfigPath = 'jest.config.custom.js';
      const customConfigFullPath = path.resolve(rootPath, customConfigPath);

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn((key: string) => {
          if (key === 'jestrunner.configPath') {
            return customConfigPath;
          }
          return undefined;
        }),
      }));

      // Custom config exists with custom testMatch patterns
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return (
          pathStr === customConfigFullPath ||
          pathStr === path.join(rootPath, 'node_modules', '.bin', 'jest')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === customConfigFullPath) {
          return `
            module.exports = {
              testMatch: ['**/*.test.{js,ts}', '**/*.integrationtest.{js,ts}']
            };
          `;
        }
        return '';
      }) as any;

      // Import matchesTestFilePattern dynamically to get fresh module state
      const { matchesTestFilePattern } = require('../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        customConfigFullPath,
        'utf8',
      );
    });

    it('should use custom Vitest config path when configured', () => {
      const rootPath = '/workspace/project';
      const testFile = path.join(rootPath, 'src', 'component.test.ts');
      const customConfigPath = 'vitest.config.custom.ts';
      const customConfigFullPath = path.resolve(rootPath, customConfigPath);

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn((key: string) => {
          if (key === 'jestrunner.vitestConfigPath') {
            return customConfigPath;
          }
          return undefined;
        }),
      }));

      // Custom config exists with custom include patterns
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return (
          pathStr === customConfigFullPath ||
          pathStr === path.join(rootPath, 'node_modules', '.bin', 'vitest')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === customConfigFullPath) {
          return `
            export default defineConfig({
              test: {
                include: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}']
              }
            });
          `;
        }
        return '';
      }) as any;

      const { matchesTestFilePattern } = require('../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        customConfigFullPath,
        'utf8',
      );
    });

    it('should fallback to standard configs when custom config does not exist', () => {
      // Use path.resolve to ensure cross-platform compatibility
      const rootPath = path.resolve('/workspace/project');
      const testFile = path.join(rootPath, 'src', 'component.test.ts');
      const customConfigPath = 'jest.config.custom.js';
      const customConfigFullPath = path.resolve(rootPath, customConfigPath);
      const standardConfigPath = path.join(rootPath, 'jest.config.js');

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn((key: string) => {
          if (key === 'jestrunner.configPath') {
            return customConfigPath;
          }
          return undefined;
        }),
      }));

      // Custom config doesn't exist, but standard config does
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return (
          pathStr === standardConfigPath ||
          pathStr === path.join(rootPath, 'node_modules', '.bin', 'jest')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === standardConfigPath) {
          return `
            module.exports = {
              testMatch: ['**/*.test.{js,ts}']
            };
          `;
        }
        return '';
      }) as any;

      const { matchesTestFilePattern } = require('../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
      // Should check custom config first, then fall back to standard
      expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(standardConfigPath);
    });

    it('should use custom config even when NO framework is detected', () => {
      // This is the critical case: custom config exists but no standard config
      // and no Jest binary exists, so detectTestFramework() returns undefined
      const rootPath = '/workspace/project';
      const testFile = path.join(rootPath, 'src', 'component.test.ts');
      const customConfigPath = 'jest.config.custom.js';
      const customConfigFullPath = path.resolve(rootPath, customConfigPath);

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn((key: string) => {
          if (key === 'jestrunner.configPath') {
            return customConfigPath;
          }
          return undefined;
        }),
      }));

      // ONLY custom config exists - no Jest binary, no standard configs
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return pathStr === customConfigFullPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === customConfigFullPath) {
          return `
            module.exports = {
              testMatch: ['**/*.test.{js,ts}', '**/*.integrationtest.{js,ts}']
            };
          `;
        }
        return '';
      }) as any;

      const { matchesTestFilePattern } = require('../testDetection');

      const result = matchesTestFilePattern(testFile);

      // Should find the test file using custom config patterns
      expect(result).toBe(true);
      // Should have checked custom config FIRST, before trying to detect framework
      expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        customConfigFullPath,
        'utf8',
      );
    });
  });
});
