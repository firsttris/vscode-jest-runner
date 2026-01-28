import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  fileMatchesPatternsExplicit,
  fileMatchesPatterns,
  detectFrameworkByPatternMatch,
} from '../../testDetection/patternMatching';
import { clearTestDetectionCache, clearVitestDetectionCache } from '../../testDetection/cache';
import { matchesTestFilePattern } from '../../testDetection/testFileDetection';

jest.mock('fs');
jest.mock('vscode');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('patternMatching', () => {
  describe('fileMatchesPatternsExplicit', () => {
    describe('exclude patterns', () => {
      it('should exclude files matching Jest testPathIgnorePatterns (regex)', () => {
        const filePath = '/project/node_modules/lib/test.spec.ts';
        const configDir = '/project';
        const patterns = ['**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          undefined,
          ['/node_modules/'],  // Jest ignorePatterns (regex)
          undefined,
        );

        expect(result).toBe(false);
      });

      it('should exclude files matching Jest testPathIgnorePatterns with <rootDir> token', () => {
        const filePath = '/project/dist/test.spec.ts';
        const configDir = '/project';
        const patterns = ['**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          undefined,
          ['<rootDir>/dist/'],  // Jest ignorePatterns with <rootDir>
          undefined,
        );

        expect(result).toBe(false);
      });

      it('should skip invalid regex in testPathIgnorePatterns', () => {
        const filePath = '/project/src/test.spec.ts';
        const configDir = '/project';
        const patterns = ['**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          undefined,
          ['[invalid(regex'],  // Invalid regex - should be skipped
          undefined,
        );

        expect(result).toBe(true);  // Should match since invalid regex is skipped
      });

      it('should exclude files matching Vitest exclude patterns (glob)', () => {
        const filePath = '/project/coverage/test.spec.ts';
        const configDir = '/project';
        const patterns = ['**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          undefined,
          undefined,
          ['**/coverage/**'],  // Vitest exclude patterns (glob)
        );

        expect(result).toBe(false);
      });

      it('should not exclude files that do not match exclude patterns', () => {
        const filePath = '/project/src/utils.spec.ts';
        const configDir = '/project';
        const patterns = ['**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          undefined,
          ['/node_modules/'],
          ['**/coverage/**'],
        );

        expect(result).toBe(true);
      });
    });

    describe('roots configuration', () => {
      it('should exclude files outside of roots directories', () => {
        const filePath = '/project/other/test.spec.ts';
        const configDir = '/project';
        const patterns = ['**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          undefined,
          undefined,
          undefined,
          ['<rootDir>/src', '<rootDir>/lib'],  // roots
        );

        expect(result).toBe(false);
      });

      it('should include files inside roots directories', () => {
        const filePath = '/project/src/utils/test.spec.ts';
        const configDir = '/project';
        const patterns = ['**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          undefined,
          undefined,
          undefined,
          ['<rootDir>/src'],  // roots
        );

        expect(result).toBe(true);
      });

      it('should resolve roots with rootDir', () => {
        const filePath = '/project/packages/app/src/test.spec.ts';
        const configDir = '/project';
        const patterns = ['**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          'packages/app',  // rootDir
          undefined,
          undefined,
          ['<rootDir>/src'],  // roots relative to rootDir
        );

        expect(result).toBe(true);
      });

      it('should include files when roots contains <rootDir> and rootDir is undefined', () => {
        const filePath = '/project/src/test.spec.ts';
        const configDir = '/project';
        const patterns = ['**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          undefined,  // rootDir
          undefined,
          undefined,
          ['<rootDir>'],  // roots
        );

        expect(result).toBe(true);
      });
    });

    describe('regex patterns', () => {
      it('should match files using regex patterns', () => {
        const filePath = '/project/src/components/Button.spec.tsx';
        const configDir = '/project';
        const patterns = ['src/.*\\.spec\\.[tj]sx?'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          true,  // isRegex
          undefined,
        );

        expect(result).toBe(true);
      });

      it('should skip invalid regex patterns', () => {
        const filePath = '/project/src/test.spec.ts';
        const configDir = '/project';
        const patterns = ['[invalid(regex'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          true,  // isRegex
          undefined,
        );

        expect(result).toBe(false);  // Invalid regex doesn't match
      });
    });

    describe('rootDir token resolution', () => {
      it('should match with patterns relative to rootDir', () => {
        const filePath = '/project/packages/app/src/test.spec.ts';
        const configDir = '/project';
        // When rootDir is set, relativePath is calculated from baseDir (configDir + rootDir)
        // So relativePath = 'src/test.spec.ts' for a file in /project/packages/app/src/
        const patterns = ['src/**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          'packages/app',  // rootDir
        );

        expect(result).toBe(true);
      });

      it('should strip <rootDir>/ when rootDir is undefined', () => {
        const filePath = '/project/src/test.spec.ts';
        const configDir = '/project';
        const patterns = ['<rootDir>/src/**/*.spec.ts'];

        const result = fileMatchesPatternsExplicit(
          filePath,
          configDir,
          patterns,
          false,
          undefined,
        );

        expect(result).toBe(true);
      });
    });
  });

  describe('fileMatchesPatterns', () => {
    it('should use default patterns when no patterns provided', () => {
      const filePath = '/project/src/utils.test.ts';
      const configDir = '/project';

      const result = fileMatchesPatterns(
        filePath,
        configDir,
        undefined,  // no patterns
        false,
        undefined,
      );

      expect(result).toBe(true);  // Matches default pattern **/*.test.*
    });

    it('should use default patterns for empty array', () => {
      const filePath = '/project/src/__tests__/utils.ts';
      const configDir = '/project';

      const result = fileMatchesPatterns(
        filePath,
        configDir,
        [],  // empty patterns
        false,
        undefined,
      );

      expect(result).toBe(true);  // Matches default pattern **/__tests__/**/*
    });

    it('should use provided patterns when available', () => {
      const filePath = '/project/src/utils.integration.ts';
      const configDir = '/project';

      const result = fileMatchesPatterns(
        filePath,
        configDir,
        ['**/*.integration.ts'],
        false,
        undefined,
      );

      expect(result).toBe(true);
    });
  });

  describe('detectFrameworkByPatternMatch', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockedFs.existsSync = jest.fn().mockReturnValue(true);
    });

    it('should return undefined when neither config has explicit patterns', () => {
      const directoryPath = '/project';
      const filePath = '/project/src/test.spec.ts';
      const jestConfigPath = '/project/jest.config.js';
      const vitestConfigPath = '/project/vitest.config.ts';

      mockedFs.readFileSync = jest.fn().mockImplementation((p: string) => {
        if (p === jestConfigPath) {
          return 'module.exports = {};';  // No testMatch/testRegex
        }
        if (p === vitestConfigPath) {
          return 'export default {};';  // No include
        }
        return '';
      }) as any;

      const result = detectFrameworkByPatternMatch(
        directoryPath,
        filePath,
        jestConfigPath,
        vitestConfigPath,
      );

      expect(result).toBeUndefined();
    });

    it('should return jest when only jest has explicit patterns that match', () => {
      const directoryPath = '/project';
      const filePath = '/project/src/utils.spec.ts';
      const jestConfigPath = '/project/jest.config.js';
      const vitestConfigPath = '/project/vitest.config.ts';

      mockedFs.readFileSync = jest.fn().mockImplementation((p: string) => {
        if (p === jestConfigPath) {
          return "module.exports = { testMatch: ['**/*.spec.ts'] };";
        }
        if (p === vitestConfigPath) {
          return 'export default {};';
        }
        return '';
      }) as any;

      const result = detectFrameworkByPatternMatch(
        directoryPath,
        filePath,
        jestConfigPath,
        vitestConfigPath,
      );

      expect(result).toBe('jest');
    });

    it('should return vitest when jest has patterns but file does not match', () => {
      const directoryPath = '/project';
      const filePath = '/project/src/utils.test.ts';
      const jestConfigPath = '/project/jest.config.js';
      const vitestConfigPath = '/project/vitest.config.ts';

      mockedFs.readFileSync = jest.fn().mockImplementation((p: string) => {
        if (p === jestConfigPath) {
          return "module.exports = { testMatch: ['**/*.spec.ts'] };";  // Only .spec.ts
        }
        if (p === vitestConfigPath) {
          return 'export default {};';  // No include
        }
        return '';
      }) as any;

      const result = detectFrameworkByPatternMatch(
        directoryPath,
        filePath,
        jestConfigPath,
        vitestConfigPath,
      );

      expect(result).toBe('vitest');
    });

    it('should return vitest when only vitest has explicit patterns that match', () => {
      const directoryPath = '/project';
      const filePath = '/project/src/utils.test.ts';
      const jestConfigPath = '/project/jest.config.js';
      const vitestConfigPath = '/project/vitest.config.ts';

      mockedFs.readFileSync = jest.fn().mockImplementation((p: string) => {
        if (p === jestConfigPath) {
          return 'module.exports = {};';
        }
        if (p === vitestConfigPath) {
          return "export default { test: { include: ['**/*.test.ts'] } };";
        }
        return '';
      }) as any;

      const result = detectFrameworkByPatternMatch(
        directoryPath,
        filePath,
        jestConfigPath,
        vitestConfigPath,
      );

      expect(result).toBe('vitest');
    });

    it('should return jest when vitest has patterns but file does not match', () => {
      const directoryPath = '/project';
      const filePath = '/project/src/utils.spec.ts';
      const jestConfigPath = '/project/jest.config.js';
      const vitestConfigPath = '/project/vitest.config.ts';

      mockedFs.readFileSync = jest.fn().mockImplementation((p: string) => {
        if (p === jestConfigPath) {
          return 'module.exports = {};';
        }
        if (p === vitestConfigPath) {
          return "export default { test: { include: ['**/*.test.ts'] } };";  // Only .test.ts
        }
        return '';
      }) as any;

      const result = detectFrameworkByPatternMatch(
        directoryPath,
        filePath,
        jestConfigPath,
        vitestConfigPath,
      );

      expect(result).toBe('jest');
    });

    it('should return jest when both have patterns and only jest matches', () => {
      const directoryPath = '/project';
      const filePath = '/project/src/utils.spec.ts';
      const jestConfigPath = '/project/jest.config.js';
      const vitestConfigPath = '/project/vitest.config.ts';

      mockedFs.readFileSync = jest.fn().mockImplementation((p: string) => {
        if (p === jestConfigPath) {
          return "module.exports = { testMatch: ['**/*.spec.ts'] };";
        }
        if (p === vitestConfigPath) {
          return "export default { test: { include: ['**/*.test.ts'] } };";
        }
        return '';
      }) as any;

      const result = detectFrameworkByPatternMatch(
        directoryPath,
        filePath,
        jestConfigPath,
        vitestConfigPath,
      );

      expect(result).toBe('jest');
    });

    it('should return vitest when both have patterns and only vitest matches', () => {
      const directoryPath = '/project';
      const filePath = '/project/src/utils.test.ts';
      const jestConfigPath = '/project/jest.config.js';
      const vitestConfigPath = '/project/vitest.config.ts';

      mockedFs.readFileSync = jest.fn().mockImplementation((p: string) => {
        if (p === jestConfigPath) {
          return "module.exports = { testMatch: ['**/*.spec.ts'] };";
        }
        if (p === vitestConfigPath) {
          return "export default { test: { include: ['**/*.test.ts'] } };";
        }
        return '';
      }) as any;

      const result = detectFrameworkByPatternMatch(
        directoryPath,
        filePath,
        jestConfigPath,
        vitestConfigPath,
      );

      expect(result).toBe('vitest');
    });

    it('should return undefined when both have patterns and both match', () => {
      const directoryPath = '/project';
      const filePath = '/project/src/utils.test.ts';
      const jestConfigPath = '/project/jest.config.js';
      const vitestConfigPath = '/project/vitest.config.ts';

      mockedFs.readFileSync = jest.fn().mockImplementation((p: string) => {
        if (p === jestConfigPath) {
          return "module.exports = { testMatch: ['**/*.test.ts'] };";
        }
        if (p === vitestConfigPath) {
          return "export default { test: { include: ['**/*.test.ts'] } };";
        }
        return '';
      }) as any;

      const result = detectFrameworkByPatternMatch(
        directoryPath,
        filePath,
        jestConfigPath,
        vitestConfigPath,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined when both have patterns and neither matches', () => {
      const directoryPath = '/project';
      const filePath = '/project/src/utils.integration.ts';
      const jestConfigPath = '/project/jest.config.js';
      const vitestConfigPath = '/project/vitest.config.ts';

      mockedFs.readFileSync = jest.fn().mockImplementation((p: string) => {
        if (p === jestConfigPath) {
          return "module.exports = { testMatch: ['**/*.spec.ts'] };";
        }
        if (p === vitestConfigPath) {
          return "export default { test: { include: ['**/*.test.ts'] } };";
        }
        return '';
      }) as any;

      const result = detectFrameworkByPatternMatch(
        directoryPath,
        filePath,
        jestConfigPath,
        vitestConfigPath,
      );

      expect(result).toBeUndefined();
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



      const specFile = path.join(rootPath, 'src', 'utils.spec.ts');
      expect(matchesTestFilePattern(specFile)).toBe(true);

      const testFile = path.join(rootPath, 'src', 'utils.test.ts');
      expect(matchesTestFilePattern(testFile)).toBe(true);
    });
  });
});
