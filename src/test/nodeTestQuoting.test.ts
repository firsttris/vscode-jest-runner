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
});
