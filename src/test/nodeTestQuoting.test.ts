import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import { TestRunnerConfig } from '../testRunnerConfig';
import { quote } from '../utils/TestNameUtils';
import { pathToFileURL } from 'node:url';

// Define the mock variable
let mockIsWindows = false;

// Mock PathUtils
jest.mock('../utils/PathUtils', () => ({
  ...jest.requireActual('../utils/PathUtils'),
  isWindows: () => mockIsWindows,
  normalizePath: (p: string) => p, // simple pass through
}));

// Mock getReporterPaths
const mockReporterPaths = {
  jest: '/tmp/jest-reporter.js',
  vitest: '/tmp/vitest-reporter.js',
  node: '/tmp/with spaces/node-reporter.mjs',
};

jest.mock('../reporters/reporterPaths', () => ({
  getReporterPaths: () => mockReporterPaths,
}));

// Import after mocks
import { buildTestArgs } from '../execution/TestArgumentBuilder';

describe('Node Test Argument Quoting', () => {
  let mockTestController: vscode.TestController;
  let mockJestConfig: TestRunnerConfig;

  beforeEach(() => {
    mockTestController = {
      items: {
        get: jest.fn(),
      },
    } as unknown as vscode.TestController;

    mockJestConfig = new TestRunnerConfig();
    // Reset mock to default (non-Windows) before each test
    mockIsWindows = false;
  });

  it('should quote reporter path and file paths (Non-Windows)', () => {
    mockIsWindows = false;

    const allFiles = ['/path/with spaces/test.js'];
    const testsByFile = new Map<string, vscode.TestItem[]>();
    const mockTestItem = {
      label: 'test1',
      id: 'test1',
      children: { size: 0 },
    } as any;
    testsByFile.set(allFiles[0], [mockTestItem]);

    const framework: TestFrameworkName = 'node-test';
    const additionalArgs: string[] = [];
    const collectCoverage = false;

    const args = buildTestArgs(
      allFiles,
      testsByFile,
      framework,
      additionalArgs,
      collectCoverage,
      mockJestConfig,
      mockTestController,
    );

    const expectedReporterArg = quote(mockReporterPaths.node);
    const expectedFileArg = quote(allFiles[0]);

    // Check if reporter path is quoted
    const reporterIndex = args.indexOf('--test-reporter');
    assert.ok(reporterIndex !== -1, 'Should have --test-reporter arg');
    assert.strictEqual(
      args[reporterIndex + 1],
      expectedReporterArg,
      'Reporter path should be quoted (non-Windows)',
    );

    // Check if file path is quoted
    const fileIndex = args.findIndex((arg) => arg === expectedFileArg);
    assert.ok(fileIndex !== -1, 'File path should be in args and quoted');
  });

  it('should use file URL for reporter on Windows', () => {
    // Set mock to Windows
    mockIsWindows = true;

    const allFiles = ['/path/test.js'];
    const testsByFile = new Map<string, vscode.TestItem[]>();
    testsByFile.set(allFiles[0], [{ label: 'test1', id: 'test1' } as any]);

    const args = buildTestArgs(
      allFiles,
      testsByFile,
      'node-test',
      ['--jtr-structured'], // trigger reporter usage
      false,
      mockJestConfig,
      mockTestController,
    );

    const reporterIndex = args.indexOf('--test-reporter');
    assert.ok(reporterIndex !== -1, 'Should have --test-reporter arg');

    const actualReporterArgs = args[reporterIndex + 1];
    // Expected is pathToFileURL(mockReporterPaths.node).href quoted
    const expectedUrl = pathToFileURL(mockReporterPaths.node).href;
    assert.strictEqual(
      actualReporterArgs,
      quote(expectedUrl),
      'Reporter path should be a file URL on Windows',
    );
  });
});
