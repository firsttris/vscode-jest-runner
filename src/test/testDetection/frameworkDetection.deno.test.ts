import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDenoTestFile } from '../../testDetection/frameworkDetection';
import { cacheManager } from '../../cache/CacheManager';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('isDenoTestFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.invalidateAll();
  });

  it('should detect Deno.test usage', () => {
    const filePath = '/test/deno_test.ts';
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue('Deno.test("my test", () => {});');

    expect(isDenoTestFile(filePath)).toBe(true);
  });

  it('should detect import from jsr:@std/expect', () => {
    const filePath = '/test/deno_expect.ts';
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      'import { expect } from "jsr:@std/expect";',
    );

    expect(isDenoTestFile(filePath)).toBe(true);
  });

  it('should detect import from deno.land', () => {
    const filePath = '/test/deno_land.ts';
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      'import { assert } from "https://deno.land/std/testing/asserts.ts";',
    );

    expect(isDenoTestFile(filePath)).toBe(true);
  });

  it('should return false for regular file', () => {
    const filePath = '/test/regular.ts';
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue('console.log("hello");');

    expect(isDenoTestFile(filePath)).toBe(false);
  });
});
