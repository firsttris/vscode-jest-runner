import { buildTestArgs } from '../execution/TestArgumentBuilder';
import { TestRunnerConfig } from '../testRunnerConfig';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
    Uri: { file: (f: string) => ({ fsPath: f }) },
    TestItem: jest.fn(),
    TestController: jest.fn(),
}));

describe('TestArgumentBuilder', () => {
    let mockConfig: TestRunnerConfig;
    let mockController: vscode.TestController;

    beforeEach(() => {
        mockConfig = {
            buildTestArgs: jest.fn(),
            getJestConfigPath: jest.fn(),
            getVitestConfigPath: jest.fn(),
            buildNodeTestArgs: jest.fn(),
        } as any;
        mockController = {} as any;
    });

    describe('node-test', () => {
        it('should generate correct args for node-test with coverage', () => {
            const files = ['/path/to/test.js'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.js', [{ label: 'test1' }]);

            const args = buildTestArgs(
                files,
                testsByFile,
                'node-test',
                [],
                true, // collectCoverage
                mockConfig,
                mockController
            );

            expect(args).toContain('--experimental-test-coverage');

            // Check for tap reporter and its destination
            const tapIndex = args.indexOf('tap');
            expect(tapIndex).toBeGreaterThan(0);
            expect(args[tapIndex - 1]).toBe('--test-reporter');
            expect(args[tapIndex + 1]).toBe('--test-reporter-destination');
            expect(args[tapIndex + 2]).toBe('stdout');

            // Check for lcov reporter and its destination
            const lcovIndex = args.indexOf('lcov');
            expect(lcovIndex).toBeGreaterThan(0);
            expect(args[lcovIndex - 1]).toBe('--test-reporter');
            expect(args[lcovIndex + 1]).toBe('--test-reporter-destination');
            expect(args[lcovIndex + 2]).toBe('lcov.info');
        });

        it('should remove --coverage from additional args', () => {
            const files = ['/path/to/test.js'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.js', [{ label: 'test1' }]);

            const args = buildTestArgs(
                files,
                testsByFile,
                'node-test',
                ['--coverage'],
                true, // collectCoverage
                mockConfig,
                mockController
            );

            expect(args).toContain('--experimental-test-coverage');
            expect(args.filter(a => a === '--coverage').length).toBe(0);
        });
    });
});
