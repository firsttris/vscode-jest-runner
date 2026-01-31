import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cacheManager } from '../../cache/CacheManager';
import { getTestFrameworkForFile, hasConflictingTestFramework, isJestTestFile, isTestFile, isVitestTestFile } from '../../testDetection/testFileDetection';
import { findTestFrameworkDirectory } from '../../testDetection/frameworkDetection';

jest.mock('fs');
jest.mock('vscode');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('testFileDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.invalidateAll();
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

    describe('with custom config paths', () => {
      let getConfigurationMock: jest.Mock;
      let configMock: any;

      beforeEach(() => {
        configMock = {
          get: jest.fn(),
        };
        getConfigurationMock = jest.fn().mockReturnValue(configMock);
        (vscode.workspace.getConfiguration as jest.Mock) = getConfigurationMock;
      });

      it('should return true when only Jest custom config exists (no standard Jest directory) - Unix', () => {
        const testFile = path.join(rootPath, 'src', 'component.test.ts');
        const customConfigPath = 'jest.config.custom.js';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.configPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === customConfigFullPath;
        });

        mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          if (pathStr === customConfigFullPath) {
            return `
              module.exports = {
                testMatch: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}']
              };
            `;
          }
          return '';
        }) as any;

        const result = isJestTestFile(testFile);

        expect(result).toBe(true);
        expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
        expect(mockedFs.readFileSync).toHaveBeenCalledWith(
          customConfigFullPath,
          'utf8',
        );
      });

      it('should return false when custom config exists but file does not match pattern', () => {
        const testFile = path.join(rootPath, 'src', 'component.integrationtest.ts');
        const customConfigPath = 'jest.config.custom.js';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.configPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === customConfigFullPath;
        });

        mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          if (pathStr === customConfigFullPath) {
            return `
              module.exports = {
                testMatch: ['**/*.{test,spec}.{js,ts}']
              };
            `;
          }
          return '';
        }) as any;

        const result = isJestTestFile(testFile);

        expect(result).toBe(false);
      });

      it('should match integrationtest files with custom config pattern', () => {
        const testFile = path.join(rootPath, 'src', 'somename.integrationtest.ts');
        const customConfigPath = 'jest.config.custom.js';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.configPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === customConfigFullPath;
        });

        mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          if (pathStr === customConfigFullPath) {
            return `
              module.exports = {
                testMatch: ['**/*.{test,spec,integrationtest}.{js,ts}']
              };
            `;
          }
          return '';
        }) as any;

        const result = isJestTestFile(testFile);

        expect(result).toBe(true);
      });

      it('should use default patterns when custom config has no testMatch patterns', () => {
        const testFile = path.join(rootPath, 'src', 'component.test.ts');
        const customConfigPath = 'jest.config.custom.js';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.configPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === customConfigFullPath;
        });

        mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          if (pathStr === customConfigFullPath) {
            return `
              module.exports = {
                preset: 'ts-jest'
              };
            `;
          }
          return '';
        }) as any;

        const result = isJestTestFile(testFile);

        expect(result).toBe(true);
      });

      it('should fallback to standard config when custom config does not exist', () => {
        const testFile = path.join(rootPath, 'src', 'component.test.ts');
        const customConfigPath = 'jest.config.custom.js';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);
        const standardConfigPath = path.join(rootPath, 'jest.config.js');

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.configPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === standardConfigPath;
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

        const result = isJestTestFile(testFile);

        expect(result).toBe(true);
        expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
        expect(mockedFs.existsSync).toHaveBeenCalledWith(standardConfigPath);
      });

      it('should fallback to default patterns when config exists but pattern matching fails (e.g. regex literal)', () => {
        const testFile = path.join(rootPath, 'src', 'component.test.ts');
        const customConfigPath = 'jest.config.js';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.configPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === customConfigFullPath;
        });

        mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          if (pathStr === customConfigFullPath) {
            // Using __dirname (which becomes absolute path) + roots containing <rootDir>
            // This triggers the potential double-path bug in resolveRootDirToken
            return `
              module.exports = {
                rootDir: __dirname,
                roots: ['<rootDir>/src'],
                testRegex: /.*\\.spec\\.ts$/ 
              };
            `;
          }
          return '';
        }) as any;

        const result = isJestTestFile(testFile);

        expect(result).toBe(true);
      });
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

    describe('with custom config paths', () => {
      let getConfigurationMock: jest.Mock;
      let configMock: any;

      beforeEach(() => {
        configMock = {
          get: jest.fn(),
        };
        getConfigurationMock = jest.fn().mockReturnValue(configMock);
        (vscode.workspace.getConfiguration as jest.Mock) = getConfigurationMock;
      });

      it('should return true when only Vitest custom config exists', () => {
        const rootPath = '/workspace/project';
        const testFile = path.join(rootPath, 'src', 'component.test.ts');
        const customConfigPath = 'vitest.config.custom.ts';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.vitestConfigPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === customConfigFullPath;
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

        const result = isVitestTestFile(testFile);

        expect(result).toBe(true);
        expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
        expect(mockedFs.readFileSync).toHaveBeenCalledWith(
          customConfigFullPath,
          'utf8',
        );
      });

      it('should return false when custom config exists but file does not match pattern', () => {
        const rootPath = '/workspace/project';
        const testFile = path.join(rootPath, 'src', 'component.integrationtest.ts');
        const customConfigPath = 'vitest.config.custom.ts';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.vitestConfigPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === customConfigFullPath;
        });

        mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          if (pathStr === customConfigFullPath) {
            return `
              export default defineConfig({
                test: {
                  include: ['**/*.{test,spec}.{js,ts}']
                }
              });
            `;
          }
          return '';
        }) as any;

        const result = isVitestTestFile(testFile);

        expect(result).toBe(false);
      });

      it('should use default patterns when custom config has no include patterns', () => {
        const rootPath = '/workspace/project';
        const testFile = path.join(rootPath, 'src', 'component.test.ts');
        const customConfigPath = 'vitest.config.custom.ts';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.vitestConfigPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === customConfigFullPath;
        });

        mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          if (pathStr === customConfigFullPath) {
            return `
              export default defineConfig({
                test: {
                  globals: true
                }
              });
            `;
          }
          return '';
        }) as any;

        const result = isVitestTestFile(testFile);

        expect(result).toBe(true);
      });

      it('should fallback to standard config when custom config does not exist', () => {
        const rootPath = '/workspace/project';
        const testFile = path.join(rootPath, 'src', 'component.test.ts');
        const customConfigPath = 'vitest.config.custom.ts';
        const customConfigFullPath = path.resolve(rootPath, customConfigPath);
        const standardConfigPath = path.join(rootPath, 'vitest.config.ts');

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        configMock.get.mockImplementation((key: string) => {
          if (key === 'jestrunner.vitestConfigPath') {
            return customConfigPath;
          }
          return undefined;
        });

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === standardConfigPath;
        });

        mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          if (pathStr === standardConfigPath) {
            return `
              export default defineConfig({
                test: {
                  include: ['**/*.test.{js,ts}']
                }
              });
            `;
          }
          return '';
        }) as any;

        const result = isVitestTestFile(testFile);

        expect(result).toBe(true);
        expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
        expect(mockedFs.existsSync).toHaveBeenCalledWith(standardConfigPath);
      });
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

    it('should use default patterns when no config file found but Jest detected via package.json', () => {
      const filePath = '/workspace/project/src/component.test.ts';
      const rootPath = '/workspace/project';
      const packageJsonPath = path.join(rootPath, 'package.json');

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return pathStr === packageJsonPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === packageJsonPath) {
          return JSON.stringify({
            devDependencies: {
              jest: '^29.0.0',
            },
          });
        }
        return '';
      }) as any;

      const result = isTestFile(filePath);

      expect(result).toBe(true);
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
          return defaultValue;
        });

        const result = isTestFile(filePath);

        expect(result).toBe(true);
      });

      it('should ignore framework config when disableFrameworkConfig is true', () => {
        const filePath = '/workspace/project/src/component.test.ts';
        const rootPath = '/workspace/project';

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        configMock.get.mockImplementation((key: string) => {
          if (key === 'disableFrameworkConfig') {
            return true;
          }
          return undefined;
        });

        // Mock existence of a config that would typically be used
        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          return fsPath === path.join(rootPath, 'jest.config.js');
        });

        const result = isTestFile(filePath);

        // It should still return true because it falls back to default patterns
        // which include .test.ts
        expect(result).toBe(true);

        // Ensure we are using default pattern logic by checking that it doesn't try to read the file
        // (If it were using the config found by existsSync, it would try to read it)
        expect(mockedFs.readFileSync).not.toHaveBeenCalled();
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

    describe('with custom defaultTestPatterns', () => {
      let getConfigurationMock: jest.Mock;
      let configMock: any;

      beforeEach(() => {
        configMock = {
          get: jest.fn(),
        };
        getConfigurationMock = jest.fn().mockReturnValue(configMock);
        (vscode.workspace.getConfiguration as jest.Mock) = getConfigurationMock;
      });

      it('should match files using custom default patterns when no config is found', () => {
        const filePath = '/workspace/project/src/mytest.custom.js';
        const rootPath = '/workspace/project';

        (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
          uri: { fsPath: rootPath },
        }));

        mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          return pathStr === path.join(rootPath, 'package.json');
        });

        mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
          const pathStr = fsPath.toString();
          if (pathStr === path.join(rootPath, 'package.json')) {
            return JSON.stringify({
              devDependencies: {
                jest: '^29.0.0',
              },
            });
          }
          return '';
        }) as any;

        // Mock configuration to return custom patterns
        configMock.get.mockImplementation((key: string) => {
          if (key === 'defaultTestPatterns') {
            return ['**/*.custom.js'];
          }
          return undefined;
        });

        const result = isTestFile(filePath);

        expect(result).toBe(true);
      });
    });

    it('should detect frameworks when both are present in package.json', () => {
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

      expect(['jest', 'vitest']).toContain(result);
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

  describe('findTestFrameworkDirectory with custom config paths (monorepo)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      cacheManager.invalidateAll();
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn();
    });

    it('should detect Jest when file matches custom Jest config patterns', () => {
      const rootPath = '/workspace/monorepo';
      const testFile = '/workspace/monorepo/backend/api.test.ts';
      const jestConfigPath = 'config/jest.config.js';
      const vitestConfigPath = 'config/vitest.config.ts';
      const jestConfigFullPath = path.resolve(rootPath, jestConfigPath);
      const vitestConfigFullPath = path.resolve(rootPath, vitestConfigPath);

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn((key: string) => {
          if (key === 'jestrunner.configPath') return jestConfigPath;
          if (key === 'jestrunner.vitestConfigPath') return vitestConfigPath;
          return undefined;
        }),
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === jestConfigFullPath ||
          fsPath === vitestConfigFullPath
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

      const result = findTestFrameworkDirectory(testFile);

      expect(result?.framework).toBe('jest');
      expect(result?.directory).toBe(rootPath);
    });

    it('should detect Vitest when file matches custom Vitest config patterns', () => {
      const rootPath = '/workspace/monorepo';
      const testFile = '/workspace/monorepo/frontend/component.test.ts';
      const jestConfigPath = 'config/jest.config.js';
      const vitestConfigPath = 'config/vitest.config.ts';
      const jestConfigFullPath = path.resolve(rootPath, jestConfigPath);
      const vitestConfigFullPath = path.resolve(rootPath, vitestConfigPath);

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn((key: string) => {
          if (key === 'jestrunner.configPath') return jestConfigPath;
          if (key === 'jestrunner.vitestConfigPath') return vitestConfigPath;
          return undefined;
        }),
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === jestConfigFullPath ||
          fsPath === vitestConfigFullPath
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

      const result = findTestFrameworkDirectory(testFile);

      expect(result?.framework).toBe('vitest');
      expect(result?.directory).toBe(rootPath);
    });

    it('should detect correct framework with testRegex for .spec and include for .test (examples scenario)', () => {
      const rootPath = '/workspace/examples';
      const jestConfigPath = 'jest.config.js';
      const vitestConfigPath = 'vitest.config.js';
      const jestConfigFullPath = path.resolve(rootPath, jestConfigPath);
      const vitestConfigFullPath = path.resolve(rootPath, vitestConfigPath);

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn((key: string) => {
          if (key === 'jestrunner.configPath') return jestConfigPath;
          if (key === 'jestrunner.vitestConfigPath') return vitestConfigPath;
          return undefined;
        }),
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === jestConfigFullPath ||
          fsPath === vitestConfigFullPath
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
      const specResult = findTestFrameworkDirectory(specFile);
      expect(specResult?.framework).toBe('jest');

      const testFile = '/workspace/examples/src/utils.test.ts';
      const testResult = findTestFrameworkDirectory(testFile);
      expect(testResult?.framework).toBe('vitest');
    });
  });

  describe('hasConflictingTestFramework', () => {
    const rootPath = '/workspace/project';

    beforeEach(() => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.readFileSync.mockReturnValue('');

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));
    });

    it('should return false when no conflicting frameworks are found', () => {
      const filePath = '/workspace/project/src/utils.test.js';
      mockedFs.existsSync.mockReturnValue(false);

      const result = hasConflictingTestFramework(filePath, 'jest');

      expect(result).toBe(false);
    });

    it('should return true when Playwright config is found and file is in testDir', () => {
      const filePath = '/workspace/project/test/login.spec.ts';
      const playwrightConfigPath = path.join(rootPath, 'playwright.config.ts');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === playwrightConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === playwrightConfigPath) {
          return 'export default { testDir: "test" };';
        }
        return '';
      });

      const result = hasConflictingTestFramework(filePath, 'jest');

      expect(result).toBe(true);
    });

    it('should return false when Playwright config is found but file is not in testDir', () => {
      const filePath = '/workspace/project/src/utils.test.js';
      const playwrightConfigPath = path.join(rootPath, 'playwright.config.ts');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === playwrightConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === playwrightConfigPath) {
          return 'export default { testDir: "test" };';
        }
        return '';
      });

      const result = hasConflictingTestFramework(filePath, 'jest');

      expect(result).toBe(false);
    });

    it('should return FALSE when Playwright config has NO testDir (default fallback)', () => {
      const filePath = '/workspace/project/tests/example.spec.ts';
      const playwrightConfigPath = path.join(rootPath, 'playwright.config.ts');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === playwrightConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === playwrightConfigPath) {
          return 'export default {};';
        }
        return '';
      });

      const result = hasConflictingTestFramework(filePath, 'jest');

      expect(result).toBe(false);
    });

    it('should return true when Cypress config is found and file matches specPattern', () => {
      const filePath = '/workspace/project/cypress/e2e/login.cy.js';
      const cypressConfigPath = path.join(rootPath, 'cypress.config.js');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === cypressConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === cypressConfigPath) {
          return 'module.exports = { e2e: { specPattern: "cypress/e2e/**/*.cy.js" } };';
        }
        return '';
      });

      const result = hasConflictingTestFramework(filePath, 'jest');

      expect(result).toBe(true);
    });

    it('should return false when Cypress config is found but file does not match specPattern', () => {
      const filePath = '/workspace/project/src/utils.test.js';
      const cypressConfigPath = path.join(rootPath, 'cypress.config.js');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === cypressConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === cypressConfigPath) {
          return 'module.exports = { e2e: { specPattern: "cypress/e2e/**/*.cy.js" } };';
        }
        return '';
      });

      const result = hasConflictingTestFramework(filePath, 'jest');

      expect(result).toBe(false);
    });

    it('should return FALSE when Cypress config has NO specPattern (default fallback)', () => {
      const filePath = '/workspace/project/cypress/integration/login.spec.js';
      const cypressConfigPath = path.join(rootPath, 'cypress.config.js');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === cypressConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === cypressConfigPath) {
          return 'module.exports = {};'; // No specPattern
        }
        return '';
      });

      const result = hasConflictingTestFramework(filePath, 'jest');

      expect(result).toBe(false);
    });

    it('should return FALSE when Cypress config has NO specPattern and file is outside cypress dir', () => {
      const filePath = '/workspace/project/src/utils.test.js';
      const cypressConfigPath = path.join(rootPath, 'cypress.config.js');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === cypressConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === cypressConfigPath) {
          return 'module.exports = {};'; // No specPattern
        }
        return '';
      });

      const result = hasConflictingTestFramework(filePath, 'jest');

      expect(result).toBe(false);
    });

    it('should return FALSE when Jest config exists in root but checking Vitest file', () => {
      const filePath = '/workspace/project/src/utils.test.js';
      const jestConfigPath = path.join(rootPath, 'jest.config.js');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === jestConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === jestConfigPath) {
          return 'module.exports = { testMatch: ["**/*.test.js"] };';
        }
        return '';
      });

      const result = hasConflictingTestFramework(filePath, 'vitest');

      expect(result).toBe(false);
    });

    it('should return FALSE when Vitest config exists in root but checking Jest file', () => {
      const filePath = '/workspace/project/src/component.spec.ts';
      const vitestConfigPath = path.join(rootPath, 'vitest.config.ts');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === vitestConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === vitestConfigPath) {
          return 'export default { test: { include: ["**/*.test.ts"] } };';
        }
        return '';
      });

      const result = hasConflictingTestFramework(filePath, 'jest');

      expect(result).toBe(false);
    });

    it('should return FALSE when Playwright config has NO testDir with various file paths', () => {
      const playwrightConfigPath = path.join(rootPath, 'playwright.config.ts');

      mockedFs.existsSync.mockImplementation((fsPath: fs.PathLike) => {
        return fsPath === playwrightConfigPath;
      });

      mockedFs.readFileSync.mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === playwrightConfigPath) {
          return 'export default {};'; // No testDir
        }
        return '';
      });

      const testPaths = [
        '/workspace/project/tests/example.spec.ts',
        '/workspace/project/src/component.test.ts',
        '/workspace/project/e2e/login.test.ts',
      ];

      testPaths.forEach((filePath) => {
        const result = hasConflictingTestFramework(filePath, 'jest');
        expect(result).toBe(false);
      });
    });
  });
});
