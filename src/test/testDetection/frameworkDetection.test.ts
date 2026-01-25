import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  isJestUsedIn,
  findJestDirectory,
  clearTestDetectionCache,
  isVitestUsedIn,
  clearVitestDetectionCache,
  findVitestDirectory,
  detectTestFramework,
} from '../../testDetection';

jest.mock('fs');
jest.mock('vscode');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('frameworkDetection', () => {
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

      const { isJestTestFile } = require('../../testDetection');
      const result = isJestTestFile(filePath);

      expect(result).toBe(true);
    });

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

        const { isJestTestFile } = require('../../testDetection');
        const result = isJestTestFile(filePath);

        expect(result).toBe(true);

        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
        });
      },
    );
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

    it('should return undefined when no framework is found', () => {
      const testDir = '/test/project';

      mockedFs.existsSync = jest.fn().mockReturnValue(false);

      const result = detectTestFramework(testDir);

      expect(result).toBeUndefined();
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

    it('should detect Jest when jest.config.js exists (config files take priority)', () => {
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

      expect(result).toBe('jest');
    });
  });

  describe('detectTestFramework with pattern matching (monorepo support)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      clearTestDetectionCache();
      clearVitestDetectionCache();
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should detect Jest for file matching Jest testMatch patterns when both configs exist', () => {
      const testDir = '/workspace/monorepo';
      const testFile = '/workspace/monorepo/backend/api.test.ts';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(testDir, 'jest.config.js') ||
          fsPath === path.join(testDir, 'vitest.config.ts')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr.includes('jest.config.js')) {
          return `module.exports = { testMatch: ['**/backend/**/*.test.ts'] };`;
        }
        if (pathStr.includes('vitest.config.ts')) {
          return `
            export default defineConfig({
              test: {
                include: ['**/frontend/**/*.test.ts'],
              },
            });
          `;
        }
        return '';
      }) as any;

      const result = detectTestFramework(testDir, testFile);

      expect(result).toBe('jest');
    });

    it('should detect Vitest for file matching Vitest include patterns when both configs exist', () => {
      const testDir = '/workspace/monorepo';
      const testFile = '/workspace/monorepo/frontend/component.test.ts';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(testDir, 'jest.config.js') ||
          fsPath === path.join(testDir, 'vitest.config.ts')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr.includes('jest.config.js')) {
          return `module.exports = { testMatch: ['**/backend/**/*.test.ts'] };`;
        }
        if (pathStr.includes('vitest.config.ts')) {
          return `
            export default defineConfig({
              test: {
                include: ['**/frontend/**/*.test.ts'],
              },
            });
          `;
        }
        return '';
      }) as any;

      const result = detectTestFramework(testDir, testFile);

      expect(result).toBe('vitest');
    });

    it('should detect Jest for file matching Jest testRegex patterns when both configs exist', () => {
      const testDir = '/workspace/monorepo';
      const testFile = '/workspace/monorepo/server/handler.spec.ts';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(testDir, 'jest.config.js') ||
          fsPath === path.join(testDir, 'vitest.config.ts')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr.includes('jest.config.js')) {
          return `module.exports = { testRegex: 'server/.*\\\\.spec\\\\.ts$' };`;
        }
        if (pathStr.includes('vitest.config.ts')) {
          return `
            export default defineConfig({
              test: {
                include: ['**/frontend/**/*.test.ts'],
              },
            });
          `;
        }
        return '';
      }) as any;

      const result = detectTestFramework(testDir, testFile);

      expect(result).toBe('jest');
    });

    it('should fallback to jest when both configs exist but file matches neither pattern', () => {
      const testDir = '/workspace/monorepo';
      const testFile = '/workspace/monorepo/shared/util.test.ts';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(testDir, 'jest.config.js') ||
          fsPath === path.join(testDir, 'vitest.config.ts')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr.includes('jest.config.js')) {
          return `module.exports = { testMatch: ['**/backend/**/*.test.ts'] };`;
        }
        if (pathStr.includes('vitest.config.ts')) {
          return `
            export default defineConfig({
              test: {
                include: ['**/frontend/**/*.test.ts'],
              },
            });
          `;
        }
        return '';
      }) as any;

      const result = detectTestFramework(testDir, testFile);

      expect(result).toBe('jest');
    });

    it('should detect Jest for .spec files and Vitest for .test files (examples scenario)', () => {
      const testDir = '/workspace/examples';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(testDir, 'jest.config.js') ||
          fsPath === path.join(testDir, 'vitest.config.js')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr.includes('jest.config.js')) {
          return `module.exports = {
    testRegex: 'src/.*\\\\.spec\\\\.[tj]sx?',
    rootDir: '.',
};`;
        }
        if (pathStr.includes('vitest.config.js')) {
          return `import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['**/*.test.{js,ts,jsx,tsx}'],
  },
})`;
        }
        return '';
      }) as any;

      const specFile = '/workspace/examples/src/utils.spec.ts';
      const specResult = detectTestFramework(testDir, specFile);
      expect(specResult).toBe('jest');

      const testFile = '/workspace/examples/src/utils.test.ts';
      const testResult = detectTestFramework(testDir, testFile);
      expect(testResult).toBe('vitest');
    });
  });
});
