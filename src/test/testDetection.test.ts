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
} from '../testDetection';

// Mock fs and vscode modules
jest.mock('fs');
jest.mock('vscode');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('jestDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the cache before each test
    clearTestDetectionCache();
    clearVitestDetectionCache();
  });

  describe('isJestUsedIn', () => {
    const testDir = '/test/project';

    beforeEach(() => {
      // Reset all mocks before each test
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
        path.join(testDir, 'node_modules', '.bin', 'jest')
      );
    });

    it('should return true when Jest binary (.cmd) exists on Windows', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'node_modules', '.bin', 'jest.cmd');
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
        })
      );

      const result = isJestUsedIn(testDir);

      expect(result).toBe(true);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        path.join(testDir, 'package.json'),
        'utf8'
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
        })
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
        })
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
        })
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
        })
      );

      const result = isJestUsedIn(testDir);

      expect(result).toBe(false);
    });

    it('should cache results for the same directory', () => {
      mockedFs.existsSync = jest.fn((filePath: fs.PathLike) => {
        return filePath === path.join(testDir, 'jest.config.js');
      });

      // First call
      const result1 = isJestUsedIn(testDir);
      expect(result1).toBe(true);
      const firstCallCount = mockedFs.existsSync.mock.calls.length;

      // Second call should use cache
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
    const filePath = '/workspace/project/src/components/__tests__/Button.test.ts';

    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();

      // Mock vscode.workspace.getWorkspaceFolder
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
      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => undefined);

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
        })
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
        // Jest config exists outside workspace
        return filePath === '/different/jest.config.js';
      });

      const result = findJestDirectory(outsidePath);

      // Should not find Jest outside workspace boundaries
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
          fsPath === path.join('/workspace/project/cypress/integration', 'cypress.config.js') ||
          fsPath === path.join('/workspace/project/cypress', 'cypress.config.js')
        );
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(false);
    });

    it('should handle files in deeply nested directories', () => {
      const filePath = '/workspace/project/src/components/atoms/Button/__tests__/Button.test.tsx';
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

      // Should find the closest one
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

    it('should handle Windows-style paths', () => {
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
        return fsPath === path.join(rootPath, 'jest.config.js');
      });

      const result = isJestTestFile(filePath);

      expect(result).toBe(true);

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
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
        return filePath === path.join(testDir, 'node_modules', '.bin', 'vitest');
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
        })
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

      // First call checks multiple paths (binary, config files), second call uses cache
      // The exact number depends on implementation, just verify caching works
      const callCountAfterFirst = (mockedFs.existsSync as jest.Mock).mock.calls.length;
      isVitestUsedIn(testDir);
      // No additional calls should be made due to caching
      expect(mockedFs.existsSync).toHaveBeenCalledTimes(callCountAfterFirst);
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
        })
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

      // Looking for jest but only vitest exists
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
        })
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
        })
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
        })
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
  });
});
