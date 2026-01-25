import * as fs from 'fs';
import * as path from 'path';
import { isEsmProject } from '../../testDetection';

jest.mock('fs');
jest.mock('vscode');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('esmDetection', () => {
  describe('isEsmProject', () => {
    const projectDir = '/test/project';

    beforeEach(() => {
      mockedFs.existsSync = jest.fn().mockReturnValue(false);
      mockedFs.readFileSync = jest.fn().mockReturnValue('');
      jest.spyOn(fs, 'statSync').mockImplementation((fsPath: fs.PathLike) => {
        if (fsPath === projectDir) {
          return { isDirectory: () => true } as fs.Stats;
        }
        throw new Error('ENOENT');
      });
    });

    it('should return true when package.json has type: module', () => {
      const packageJsonPath = path.join(projectDir, 'package.json');

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === packageJsonPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        if (fsPath === packageJsonPath) {
          return JSON.stringify({ type: 'module' });
        }
        return '';
      }) as any;

      expect(isEsmProject(projectDir)).toBe(true);
    });

    it('should return false when package.json has type: commonjs', () => {
      const packageJsonPath = path.join(projectDir, 'package.json');

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === packageJsonPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        if (fsPath === packageJsonPath) {
          return JSON.stringify({ type: 'commonjs' });
        }
        return '';
      }) as any;

      expect(isEsmProject(projectDir)).toBe(false);
    });

    it('should return true when jest.config has extensionsToTreatAsEsm', () => {
      const packageJsonPath = path.join(projectDir, 'package.json');
      const jestConfigPath = path.join(projectDir, 'jest.config.js');

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === packageJsonPath || fsPath === jestConfigPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        if (fsPath === packageJsonPath) {
          return JSON.stringify({});
        }
        if (fsPath === jestConfigPath) {
          return `module.exports = {
            extensionsToTreatAsEsm: ['.ts', '.tsx'],
          };`;
        }
        return '';
      }) as any;

      expect(isEsmProject(projectDir)).toBe(true);
    });

    it('should return true when jest.config has ts-jest useESM: true', () => {
      const packageJsonPath = path.join(projectDir, 'package.json');
      const jestConfigPath = path.join(projectDir, 'jest.config.js');

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === packageJsonPath || fsPath === jestConfigPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        if (fsPath === packageJsonPath) {
          return JSON.stringify({});
        }
        if (fsPath === jestConfigPath) {
          return `module.exports = {
            transform: {
              '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
            },
          };`;
        }
        return '';
      }) as any;

      expect(isEsmProject(projectDir)).toBe(true);
    });

    it('should return false when no ESM indicators are present', () => {
      const packageJsonPath = path.join(projectDir, 'package.json');
      const jestConfigPath = path.join(projectDir, 'jest.config.js');

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === packageJsonPath || fsPath === jestConfigPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        if (fsPath === packageJsonPath) {
          return JSON.stringify({ name: 'my-project' });
        }
        if (fsPath === jestConfigPath) {
          return `module.exports = {
            testMatch: ['**/*.test.ts'],
          };`;
        }
        return '';
      }) as any;

      expect(isEsmProject(projectDir)).toBe(false);
    });

    it('should use provided jestConfigPath instead of searching', () => {
      const packageJsonPath = path.join(projectDir, 'package.json');
      const customConfigPath = '/custom/path/jest.config.ts';

      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return fsPath === packageJsonPath || fsPath === customConfigPath;
      });

      mockedFs.readFileSync = jest.fn((fsPath: fs.PathLike) => {
        if (fsPath === packageJsonPath) {
          return JSON.stringify({});
        }
        if (fsPath === customConfigPath) {
          return `export default { extensionsToTreatAsEsm: ['.ts'] };`;
        }
        return '';
      }) as any;

      expect(isEsmProject(projectDir, customConfigPath)).toBe(true);
    });
  });
});
