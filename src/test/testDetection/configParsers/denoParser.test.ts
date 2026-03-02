import * as fs from 'node:fs';
import { getDenoConfig } from '../../../testDetection/configParsers/denoParser';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock readConfigFile from parseUtils since it uses fs.readFileSync
jest.mock('../../../testDetection/configParsers/parseUtils', () => ({
  ...jest.requireActual('../../../testDetection/configParsers/parseUtils'),
  readConfigFile: (path: string) => fs.readFileSync(path, 'utf-8'),
}));

describe('denoParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse simple deno.json with include', () => {
    const configPath = '/project/deno.json';
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        test: {
          include: ['src/**/*.test.ts'],
        },
      }),
    );

    const result = getDenoConfig(configPath);
    expect(result).toBeDefined();
    expect(result?.patterns).toEqual(['src/**/*.test.ts']);
    expect(result?.excludePatterns).toEqual([]);
    expect(result?.rootDir).toBe('/project');
  });

  it('should parse deno.json with exclude', () => {
    const configPath = '/project/deno.json';
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        test: {
          exclude: ['out/'],
        },
      }),
    );

    const result = getDenoConfig(configPath);
    expect(result).toBeDefined();
    expect(result?.patterns).toEqual([]); // Default patterns handling is done in caller usually, but parser returns empty if undefined
    expect(result?.excludePatterns).toEqual(['out/']);
  });

  it('should NOT merge global exclude with test exclude (user preference)', () => {
    const configPath = '/project/deno.json';
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        exclude: ['global-ignore/'],
        test: {
          exclude: ['test-ignore/'],
        },
      }),
    );

    const result = getDenoConfig(configPath);
    expect(result).toBeDefined();
    // Expect only test-specific exclude as requested
    expect(result?.excludePatterns).toEqual(['test-ignore/']);
  });

  it('should parse deno.jsonc (with comments) if content is valid json (mocked)', () => {
    // Note: The parser uses generic JSON.parse or parseConfigObject.
    // parseConfigObject handles some looseness.
    // Here we test logic assuming content is parsed.
    // If we want to test comment stripping, we'd need to mock readConfigFile to return comment-stripped content
    // or rely on parseConfigObject's capabilities.
    // Let's test standard structure.
    const configPath = '/project/deno.jsonc';
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        test: {
          include: ['tests/'],
          exclude: ['tests/e2e/'],
        },
      }),
    );

    const result = getDenoConfig(configPath);
    expect(result).toBeDefined();
    expect(result?.patterns).toEqual(['tests/']);
    expect(result?.excludePatterns).toEqual(['tests/e2e/']);
  });

  it('should return valid config with empty patterns if no test config', () => {
    const configPath = '/project/deno.json';
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        tasks: {
          start: 'deno run main.ts',
        },
      }),
    );

    const result = getDenoConfig(configPath);
    expect(result).toBeDefined();
    expect(result?.patterns).toEqual([]); // Fallback to defaults in consumer
  });

  it('should return undefined if file parsing fails', () => {
    const configPath = '/project/deno.json';
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('fail');
    });

    const result = getDenoConfig(configPath);
    expect(result).toBeUndefined();
  });
});
