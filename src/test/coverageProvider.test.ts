import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  CoverageProvider,
  CoverageMap,
  FileCoverageData,
  DetailedFileCoverage,
} from '../coverageProvider';
import { CancellationToken, CancellationTokenSource } from './__mocks__/vscode';

jest.mock('fs');
jest.mock('../util', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
}));
jest.mock('../testDetection/testFileDetection', () => {
  const original = jest.requireActual('../testDetection/testFileDetection');
  return {
    ...original,
    matchesTestFilePattern: jest.fn((filePath: string) => {
      return filePath.includes('.test.') || filePath.includes('.spec.');
    }),
  };
});

const normalizePath = (p: string): string => p.split('/').join(path.sep);

describe('CoverageProvider', () => {
  let provider: CoverageProvider;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    provider = new CoverageProvider();
    jest.clearAllMocks();
  });

  describe('readCoverageFromFile', () => {
    const workspaceFolder = normalizePath('/workspace');
    const defaultCoveragePath = normalizePath(
      '/workspace/coverage/coverage-final.json',
    );

    it('should return undefined when coverage file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await provider.readCoverageFromFile(workspaceFolder);

      expect(result).toBeUndefined();
    });

    it('should return undefined when coverage file is empty', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');

      const result = await provider.readCoverageFromFile(workspaceFolder);

      expect(result).toBeUndefined();
    });

    it('should return undefined when coverage file content is empty string', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('');

      const result = await provider.readCoverageFromFile(workspaceFolder);

      expect(result).toBeUndefined();
    });

    it('should parse coverage from default location', async () => {
      const coverageData: CoverageMap = {
        '/workspace/src/index.ts': createMockFileCoverageData(
          '/workspace/src/index.ts',
        ),
      };

      mockFs.existsSync.mockImplementation((p) => typeof p === 'string' && p.includes('coverage-final.json'));
      mockFs.readFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('coverage-final.json')) return JSON.stringify(coverageData);
        return '';
      });

      const result = await provider.readCoverageFromFile(workspaceFolder);

      expect(result).toEqual(coverageData);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        defaultCoveragePath,
        'utf-8',
      );
    });

    it('should parse Jest coverageDirectory from config', async () => {
      const jestConfig = `module.exports = { coverageDirectory: './custom-coverage' };`;
      const coverageData: CoverageMap = {
        '/workspace/src/index.ts': createMockFileCoverageData(
          '/workspace/src/index.ts',
        ),
      };

      const jestConfigPath = normalizePath('/workspace/jest.config.js');
      const customCoveragePath = normalizePath(
        '/workspace/custom-coverage/coverage-final.json',
      );

      mockFs.existsSync.mockImplementation((p) => typeof p === 'string' && (p.includes('jest.config') || p.includes('coverage-final.json')));
      mockFs.readFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('jest.config')) return jestConfig;
        if (typeof p === 'string' && p.includes('coverage-final.json')) return JSON.stringify(coverageData);
        return '';
      });

      const result = await provider.readCoverageFromFile(
        workspaceFolder,
        'jest',
        jestConfigPath,
      );

      expect(result).toEqual(coverageData);
    });

    it('should parse Vitest reportsDirectory from config', async () => {
      const vitestConfig = `export default { test: { coverage: { reportsDirectory: './vitest-coverage' } } };`;
      const coverageData: CoverageMap = {
        '/workspace/src/index.ts': createMockFileCoverageData(
          '/workspace/src/index.ts',
        ),
      };

      const vitestConfigPath = normalizePath('/workspace/vitest.config.ts');
      const vitestCoveragePath = normalizePath(
        '/workspace/vitest-coverage/coverage-final.json',
      );

      mockFs.existsSync.mockImplementation((p) => typeof p === 'string' && (p.includes('vitest.config') || p.includes('coverage-final.json')));
      mockFs.readFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('vitest.config')) return vitestConfig;
        if (typeof p === 'string' && p.includes('coverage-final.json')) return JSON.stringify(coverageData);
        return '';
      });

      const result = await provider.readCoverageFromFile(
        workspaceFolder,
        'vitest',
        vitestConfigPath,
      );

      expect(result).toEqual(coverageData);
    });

    it('should use config path when provided', async () => {
      const configPath = normalizePath(
        '/workspace/packages/app/vitest.config.ts',
      );
      const vitestConfig = `export default { test: { coverage: { reportsDirectory: './coverage' } } };`;
      const coverageData: CoverageMap = {
        '/workspace/packages/app/src/index.ts': createMockFileCoverageData(
          '/workspace/packages/app/src/index.ts',
        ),
      };

      const appCoveragePath = normalizePath(
        '/workspace/packages/app/coverage/coverage-final.json',
      );

      mockFs.existsSync.mockImplementation((p) => typeof p === 'string' && (p.includes('vitest.config') || p.includes('coverage-final.json')));
      mockFs.readFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('vitest.config')) return vitestConfig;
        if (typeof p === 'string' && p.includes('coverage-final.json')) return JSON.stringify(coverageData);
        return '';
      });

      const result = await provider.readCoverageFromFile(
        workspaceFolder,
        'vitest',
        configPath,
      );

      expect(result).toEqual(coverageData);
    });

    it('should return undefined on JSON parse error', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json {');

      const result = await provider.readCoverageFromFile(workspaceFolder);

      expect(result).toBeUndefined();
    });
  });

  describe('convertToVSCodeCoverage', () => {
    const workspaceFolder = '/workspace';

    it('should convert coverage map to VS Code format', () => {
      const coverageMap: CoverageMap = {
        '/workspace/src/index.ts': createMockFileCoverageData(
          '/workspace/src/index.ts',
        ),
      };

      const result = provider.convertToVSCodeCoverage(
        coverageMap,
        workspaceFolder,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(DetailedFileCoverage);
      expect(result[0].uri.fsPath).toBe('/workspace/src/index.ts');
    });

    it('should skip node_modules files', () => {
      const coverageMap: CoverageMap = {
        '/workspace/node_modules/lodash/index.js': createMockFileCoverageData(
          '/workspace/node_modules/lodash/index.js',
        ),
        '/workspace/src/index.ts': createMockFileCoverageData(
          '/workspace/src/index.ts',
        ),
      };

      const result = provider.convertToVSCodeCoverage(
        coverageMap,
        workspaceFolder,
      );

      expect(result).toHaveLength(1);
      expect(result[0].uri.fsPath).toBe('/workspace/src/index.ts');
    });

    it('should skip test files', () => {
      const coverageMap: CoverageMap = {
        '/workspace/src/index.test.ts': createMockFileCoverageData(
          '/workspace/src/index.test.ts',
        ),
        '/workspace/src/index.spec.js': createMockFileCoverageData(
          '/workspace/src/index.spec.js',
        ),
        '/workspace/src/index.ts': createMockFileCoverageData(
          '/workspace/src/index.ts',
        ),
      };

      const result = provider.convertToVSCodeCoverage(
        coverageMap,
        workspaceFolder,
      );

      expect(result).toHaveLength(1);
      expect(result[0].uri.fsPath).toBe('/workspace/src/index.ts');
    });

    it('should calculate statement coverage correctly', () => {
      const coverageMap: CoverageMap = {
        '/workspace/src/index.ts': {
          path: '/workspace/src/index.ts',
          statementMap: {
            '0': {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 10 },
            },
            '1': {
              start: { line: 2, column: 0 },
              end: { line: 2, column: 10 },
            },
            '2': {
              start: { line: 3, column: 0 },
              end: { line: 3, column: 10 },
            },
          },
          fnMap: {},
          branchMap: {},
          s: { '0': 5, '1': 0, '2': 3 }, // 2 covered, 1 not covered
          f: {},
          b: {},
        },
      };

      const result = provider.convertToVSCodeCoverage(
        coverageMap,
        workspaceFolder,
      );

      expect(result[0].statementCoverage.covered).toBe(2);
      expect(result[0].statementCoverage.total).toBe(3);
    });

    it('should calculate branch coverage correctly', () => {
      const coverageMap: CoverageMap = {
        '/workspace/src/index.ts': {
          path: '/workspace/src/index.ts',
          statementMap: {},
          fnMap: {},
          branchMap: {
            '0': {
              loc: {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 10 },
              },
              type: 'if',
              locations: [
                { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
                { start: { line: 1, column: 5 }, end: { line: 1, column: 10 } },
              ],
              line: 1,
            },
          },
          s: {},
          f: {},
          b: { '0': [5, 0] }, // first branch covered, second not
        },
      };

      const result = provider.convertToVSCodeCoverage(
        coverageMap,
        workspaceFolder,
      );

      expect(result[0].branchCoverage?.covered).toBe(1);
      expect(result[0].branchCoverage?.total).toBe(2);
    });

    it('should calculate function coverage correctly', () => {
      const coverageMap: CoverageMap = {
        '/workspace/src/index.ts': {
          path: '/workspace/src/index.ts',
          statementMap: {},
          fnMap: {
            '0': {
              name: 'foo',
              decl: {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 10 },
              },
              loc: {
                start: { line: 1, column: 0 },
                end: { line: 3, column: 1 },
              },
              line: 1,
            },
            '1': {
              name: 'bar',
              decl: {
                start: { line: 5, column: 0 },
                end: { line: 5, column: 10 },
              },
              loc: {
                start: { line: 5, column: 0 },
                end: { line: 7, column: 1 },
              },
              line: 5,
            },
          },
          branchMap: {},
          s: {},
          f: { '0': 3, '1': 0 }, // foo covered, bar not
          b: {},
        },
      };

      const result = provider.convertToVSCodeCoverage(
        coverageMap,
        workspaceFolder,
      );

      expect(result[0].declarationCoverage?.covered).toBe(1);
      expect(result[0].declarationCoverage?.total).toBe(2);
    });

    it('should return empty array for empty coverage map', () => {
      const result = provider.convertToVSCodeCoverage({}, workspaceFolder);

      expect(result).toHaveLength(0);
    });
  });

  describe('loadDetailedCoverage', () => {
    it('should return empty array when cancelled', async () => {
      const tokenSource = new CancellationTokenSource();
      tokenSource.cancel();

      const fileCoverage = createMockDetailedFileCoverage();
      const result = await provider.loadDetailedCoverage(
        fileCoverage,
        tokenSource.token as any,
      );

      expect(result).toHaveLength(0);
    });

    it('should load statement coverage details', async () => {
      const token = new CancellationToken();
      const fileCoverage = createMockDetailedFileCoverage({
        statementMap: {
          '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          '1': { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
        },
        s: { '0': 5, '1': 0 },
      });

      const result = await provider.loadDetailedCoverage(
        fileCoverage,
        token as any,
      );

      const statements = result.filter(
        (d) => d instanceof vscode.StatementCoverage,
      );
      expect(statements.length).toBeGreaterThanOrEqual(2);
    });

    it('should load function coverage details', async () => {
      const token = new CancellationToken();
      const fileCoverage = createMockDetailedFileCoverage({
        fnMap: {
          '0': {
            name: 'testFunction',
            decl: {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 20 },
            },
            loc: { start: { line: 1, column: 0 }, end: { line: 3, column: 1 } },
            line: 1,
          },
        },
        f: { '0': 3 },
      });

      const result = await provider.loadDetailedCoverage(
        fileCoverage,
        token as any,
      );

      const declarations = result.filter(
        (d) => d instanceof vscode.DeclarationCoverage,
      );
      expect(declarations).toHaveLength(1);
      expect((declarations[0] as vscode.DeclarationCoverage).name).toBe(
        'testFunction',
      );
    });

    it('should load branch coverage details', async () => {
      const token = new CancellationToken();
      const fileCoverage = createMockDetailedFileCoverage({
        branchMap: {
          '0': {
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 20 },
            },
            type: 'if',
            locations: [
              { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
              { start: { line: 1, column: 10 }, end: { line: 1, column: 20 } },
            ],
            line: 1,
          },
        },
        b: { '0': [5, 2] },
      });

      const result = await provider.loadDetailedCoverage(
        fileCoverage,
        token as any,
      );

      const statementsWithBranches = result.filter(
        (d) =>
          d instanceof vscode.StatementCoverage &&
          (d as any).branches?.length > 0,
      );
      expect(statementsWithBranches.length).toBeGreaterThanOrEqual(1);
    });
  });
});

function createMockFileCoverageData(filePath: string): FileCoverageData {
  return {
    path: filePath,
    statementMap: {
      '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
    },
    fnMap: {},
    branchMap: {},
    s: { '0': 1 },
    f: {},
    b: {},
  };
}

function createMockDetailedFileCoverage(
  overrides: Partial<FileCoverageData> = {},
): DetailedFileCoverage {
  const data: FileCoverageData = {
    path: '/workspace/src/index.ts',
    statementMap: {},
    fnMap: {},
    branchMap: {},
    s: {},
    f: {},
    b: {},
    ...overrides,
  };

  return new DetailedFileCoverage(
    vscode.Uri.file(data.path),
    new vscode.TestCoverageCount(1, 1),
    undefined,
    undefined,
    data,
  );
}
