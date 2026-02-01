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

            // Check for structured reporter and its destination
            const reporterIndex = args.findIndex((a) => typeof a === 'string' && a.includes('node-reporter.mjs'));
            expect(reporterIndex).toBeGreaterThan(0);
            expect(args[reporterIndex - 1]).toBe('--test-reporter');
            expect(args[reporterIndex + 1]).toBe('--test-reporter-destination');
            expect(args[reporterIndex + 2]).toBe('stdout');

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

    describe('deno', () => {
        it('should generate correct args for deno with coverage', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);

            const args = buildTestArgs(
                files,
                testsByFile,
                'deno',
                [],
                true, // collectCoverage
                mockConfig,
                mockController
            );

            expect(args).toContain('--coverage=coverage');
            expect(args).toContain('--allow-all');
            expect(args[0]).toBe('test');
        });

        it('should include filter when specific tests are selected', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);

            const args = buildTestArgs(
                files,
                testsByFile,
                'deno',
                [],
                false,
                mockConfig,
                mockController
            );

            expect(args).toContain('--filter');
            // Check if filter contains the test label (quoted)
            // Quote implementation might vary but it should be there
            const filterIndex = args.indexOf('--filter');
            expect(args[filterIndex + 1]).toMatch(/test1/);
        });

        it('should pass additional args', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);

            const args = buildTestArgs(
                files,
                testsByFile,
                'deno',
                ['--unstable'],
                false,
                mockConfig,
                mockController
            );

            expect(args).toContain('--unstable');
        });
    });
    describe('bun', () => {
        it('should generate correct args for bun with coverage', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);

            const args = buildTestArgs(
                files,
                testsByFile,
                'bun',
                [],
                true, // collectCoverage
                mockConfig,
                mockController
            );

            expect(args[0]).toBe('test');
            expect(args).toContain('--coverage');
            expect(args).toContain('--coverage-reporter=lcov');
            expect(args).toContain('--reporter=junit');
            expect(args).toContain('--reporter-outfile=.bun-report.xml');
        });

        it('should include -t filter when specific tests are selected', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);

            const args = buildTestArgs(
                files,
                testsByFile,
                'bun',
                [],
                false,
                mockConfig,
                mockController
            );

            expect(args).toContain('-t');
            const filterIndex = args.indexOf('-t');
            expect(args[filterIndex + 1]).toMatch(/test1/);
        });

        it('should pass additional args', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);

            const args = buildTestArgs(
                files,
                testsByFile,
                'bun',
                ['--bail'],
                false,
                mockConfig,
                mockController
            );

            expect(args).toContain('--bail');
        });
    });
});
