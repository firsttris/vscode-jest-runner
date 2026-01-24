import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  clearTestDetectionCache,
  clearVitestDetectionCache,
} from '../../testDetection';

jest.mock('fs');
jest.mock('vscode');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('patternMatching', () => {
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

      const { matchesTestFilePattern } = require('../../testDetection');

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

      const { matchesTestFilePattern } = require('../../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        customConfigFullPath,
        'utf8',
      );
    });

    it('should fallback to standard configs when custom config does not exist', () => {
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

      const { matchesTestFilePattern } = require('../../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(standardConfigPath);
    });

    it('should use custom config even when NO framework is detected', () => {
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

      const { matchesTestFilePattern } = require('../../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(customConfigFullPath);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        customConfigFullPath,
        'utf8',
      );
    });

    it('should match test files when custom config is in a subdirectory (monorepo structure)', () => {
      const rootPath = '/workspace/monorepo';
      const customConfigPath = 'src/tests/configs/jest.config.ts';
      const customConfigFullPath = path.join(rootPath, customConfigPath);
      const testFile = path.join(rootPath, 'src', 'services', '__tests__', 'api.spec.ts');

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

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return pathStr === customConfigFullPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === customConfigFullPath) {
          return `
            module.exports = {
              testMatch: ['**/*.spec.ts', '**/*.test.ts']
            };
          `;
        }
        return '';
      }) as any;

      const { matchesTestFilePattern } = require('../../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
    });

    it('should match test files when custom config is in a subdirectory - Windows', () => {
      const rootPath = 'C:\\Users\\dev\\monorepo';
      const customConfigPath = 'src\\tests\\configs\\jest.config.ts';
      const customConfigFullPath = path.join(rootPath, customConfigPath);
      const testFile = path.join(rootPath, 'src', 'services', '__tests__', 'api.spec.ts');

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

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return pathStr === customConfigFullPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === customConfigFullPath) {
          return `
            module.exports = {
              testMatch: ['**/*.spec.ts', '**/*.test.ts']
            };
          `;
        }
        return '';
      }) as any;

      const { matchesTestFilePattern } = require('../../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
    });

    it('should handle testMatch patterns with <rootDir> placeholder', () => {
      const rootPath = '/workspace/project';
      const testFile = path.join(rootPath, 'src', '__tests__', 'component.test.ts');
      const configPath = path.join(rootPath, 'jest.config.ts');

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn(() => undefined),
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return (
          pathStr === configPath ||
          pathStr === path.join(rootPath, 'node_modules', '.bin', 'jest')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === configPath) {
          return `
export default {
  preset: './jest.preset.js',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/*(*.)@(spec|test).[jt]s?(x)',
  ],
};
          `;
        }
        return '';
      }) as any;

      const { matchesTestFilePattern } = require('../../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
    });

    it('should handle jest.config.ts in nested subdirectory with rootDir pointing to parent', () => {
      const rootPath = '/workspace/project';
      const configDir = path.join(rootPath, 'src', 'tests', 'configs');
      const configPath = path.join(configDir, 'jest.config.ts');
      const testFile = path.join(rootPath, 'src', 'tests', 'integration', 'getUrls.test.ts');

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn(() => undefined),
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return (
          pathStr === configPath ||
          pathStr === path.join(configDir, 'node_modules', '.bin', 'jest')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === configPath) {
          return `
export default {
  rootDir: '../../tests/',
  testMatch: [
    '<rootDir>/**/*.ts?(x)',
    '**/?(.)+(spec|test).ts?(x)',
  ],
};
          `;
        }
        return '';
      }) as any;

      const { matchesTestFilePattern } = require('../../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
    });

    it('should handle testRegex with rootDir at project root', () => {
      const rootPath = '/workspace/project';
      const configPath = path.join(rootPath, 'jest.config.ts');
      const testFile = path.join(rootPath, 'src', 'components', 'Button.spec.tsx');

      (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
        uri: { fsPath: rootPath },
      }));

      (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
        get: jest.fn(() => undefined),
      }));

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        return (
          pathStr === configPath ||
          pathStr === path.join(rootPath, 'node_modules', '.bin', 'jest')
        );
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        const pathStr = fsPath.toString();
        if (pathStr === configPath) {
          return `
export default {
  rootDir: '.',
  testRegex: 'src/.*\\\\.spec\\\\.[tj]sx?',
};
          `;
        }
        return '';
      }) as any;

      const { matchesTestFilePattern } = require('../../testDetection');

      const result = matchesTestFilePattern(testFile);

      expect(result).toBe(true);
    });

    it('should match test files for both frameworks when both configs are set (monorepo with Jest and Vitest)', () => {
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

      const { matchesTestFilePattern } = require('../../testDetection');

      const specFile = path.join(rootPath, 'src', 'utils.spec.ts');
      expect(matchesTestFilePattern(specFile)).toBe(true);

      const testFile = path.join(rootPath, 'src', 'utils.test.ts');
      expect(matchesTestFilePattern(testFile)).toBe(true);
    });
  });
});
