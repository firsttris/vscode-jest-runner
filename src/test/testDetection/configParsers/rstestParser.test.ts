import * as fs from 'node:fs';
import { getRstestConfig } from '../../../testDetection/configParsers/rstestParser';

jest.mock('fs');

const mockedFs = fs as jest.Mocked<typeof fs>;

jest.mock('../../../testDetection/configParsers/parseUtils', () => ({
  ...jest.requireActual('../../../testDetection/configParsers/parseUtils'),
  readConfigFile: (path: string) => fs.readFileSync(path, 'utf-8'),
}));

describe('rstestParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses include and exclude patterns from rstest config', () => {
    const configPath = '/project/rstest.config.ts';
    mockedFs.readFileSync.mockReturnValue(`
      export default {
        include: ['tests/e2e/**/*.e2e.ts'],
        exclude: ['tests/fixtures/**'],
      };
    `);

    const result = getRstestConfig(configPath);

    expect(result).toBeDefined();
    expect(result?.[0]?.patterns).toEqual(['tests/e2e/**/*.e2e.ts']);
    expect(result?.[0]?.excludePatterns).toEqual(['tests/fixtures/**']);
  });

  it('supports object-style exclude patterns', () => {
    const configPath = '/project/rstest.config.ts';
    mockedFs.readFileSync.mockReturnValue(`
      export default {
        include: ['tests/**/*.ts'],
        exclude: {
          patterns: ['tests/generated/**'],
          override: true,
        },
      };
    `);

    const result = getRstestConfig(configPath);

    expect(result).toBeDefined();
    expect(result?.[0]?.excludePatterns).toEqual(['tests/generated/**']);
  });

  it('resolves __dirname root to config directory', () => {
    const configPath = '/project/rstest.config.ts';
    mockedFs.readFileSync.mockReturnValue(`
      export default {
        root: __dirname,
        include: ['src/**/*.test.ts'],
      };
    `);

    const result = getRstestConfig(configPath);

    expect(result).toBeDefined();
    expect(result?.[0]?.rootDir).toBe('/project');
  });
});
