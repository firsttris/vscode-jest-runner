import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import { buildTestArgs } from '../execution/TestArgumentBuilder';
import { TestRunnerConfig } from '../testRunnerConfig';
import { quote } from '../utils/TestNameUtils';
import * as path from 'path';

// Mock getReporterPaths
const mockReporterPaths = {
    jest: '/tmp/jest-reporter.js',
    vitest: '/tmp/vitest-reporter.js',
    node: '/tmp/with spaces/node-reporter.mjs'
};

jest.mock('../reporters/reporterPaths', () => ({
    getReporterPaths: () => mockReporterPaths
}));

describe('Node Test Argument Quoting', () => {
    let mockTestController: vscode.TestController;
    let mockJestConfig: TestRunnerConfig;

    beforeEach(() => {
        mockTestController = {
            items: {
                get: jest.fn()
            }
        } as unknown as vscode.TestController;

        mockJestConfig = new TestRunnerConfig();
    });

    it('should quote reporter path and file paths', () => {
        const allFiles = ['/path/with spaces/test.js'];
        const testsByFile = new Map<string, vscode.TestItem[]>();
        const mockTestItem = {
            label: 'test1',
            id: 'test1',
            children: { size: 0 }
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
            mockTestController
        );

        const expectedReporterArg = quote(mockReporterPaths.node);
        const expectedFileArg = quote(allFiles[0]);

        // Check if reporter path is quoted
        const reporterIndex = args.indexOf('--test-reporter');
        assert.ok(reporterIndex !== -1, 'Should have --test-reporter arg');
        assert.strictEqual(args[reporterIndex + 1], expectedReporterArg, 'Reporter path should be quoted');

        // Check if file path is quoted
        const fileIndex = args.findIndex(arg => arg === expectedFileArg);
        assert.ok(fileIndex !== -1, 'File path should be in args and quoted');
    });

    it('should use file URL for reporter on Windows', () => {
        // Mock isWindows to true
        // We need to use jest.doMock for module mocking or modify the implementation to allow mocking
        // Since isWindows is a function in PathUtils, we can spy/mock it if we change how it's imported or structure the test

        // However, for this test file, let's just mock the module completely
        jest.resetModules();
        jest.mock('../utils/PathUtils', () => ({
            ...jest.requireActual('../utils/PathUtils'),
            isWindows: () => true,
            normalizePath: (p: string) => p // simple pass through
        }));

        // Re-require modules to get fresh mocks
        const { buildTestArgs } = require('../execution/TestArgumentBuilder');
        const { quote } = require('../utils/TestNameUtils');
        const { pathToFileURL } = require('node:url');

        const allFiles = ['/path/test.js'];
        const testsByFile = new Map();
        testsByFile.set(allFiles[0], [{ label: 'test1', id: 'test1' }]);

        const args = buildTestArgs(
            allFiles,
            testsByFile,
            'node-test',
            ['--jtr-structured'], // trigger reporter usage
            false,
            mockJestConfig,
            mockTestController
        );

        const reporterIndex = args.indexOf('--test-reporter');
        assert.ok(reporterIndex !== -1, 'Should have --test-reporter arg');

        const actualReporterArgs = args[reporterIndex + 1];
        // Expected is pathToFileURL(mockReporterPaths.node).href quoted
        const expectedUrl = pathToFileURL(mockReporterPaths.node).href;
        assert.strictEqual(actualReporterArgs, quote(expectedUrl), 'Reporter path should be a file URL on Windows');
    });
});
