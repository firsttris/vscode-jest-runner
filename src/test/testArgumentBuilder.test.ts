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
            buildVitestArgs: jest.fn(),
            buildJestArgs: jest.fn(),
        } as any;
        mockController = {
            items: {
                get: jest.fn(),
            }
        } as any;
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

            // Mock file with 2 tests (partial run)
            (mockController.items.get as jest.Mock).mockReturnValue({
                children: { size: 2 }
            });

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
            expect(args).toContain('--junit-path=.deno-report.xml');
            expect(args[0]).toBe('test');
        });

        it('should include filter when specific tests are selected (partial run)', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);

            // Mock file with 2 tests (partial run)
            (mockController.items.get as jest.Mock).mockReturnValue({
                children: { size: 2 }
            });

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
            expect(args).toContain('--junit-path=.deno-report.xml');
            // Check if filter contains the test label (quoted)
            // Quote implementation might vary but it should be there
            const filterIndex = args.indexOf('--filter');
            expect(args[filterIndex + 1]).toMatch(/test1/);
        });

        it('should NOT include filter when running whole file', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }, { label: 'test2' }]);

            // Mock file with 2 tests (running all tests)
            (mockController.items.get as jest.Mock).mockReturnValue({
                children: { size: 2 }
            });

            const args = buildTestArgs(
                files,
                testsByFile,
                'deno',
                [],
                false,
                mockConfig,
                mockController
            );

            expect(args).not.toContain('--filter');
            expect(args).toContain('--junit-path=.deno-report.xml');
            expect(args).toContain('--allow-all');
        });

        it('should pass additional args', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);

            // Mock file with 2 tests (partial run)
            (mockController.items.get as jest.Mock).mockReturnValue({
                children: { size: 2 }
            });

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

    describe('vitest', () => {
        it('should generate correct args for vitest with coverage', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);
            (mockConfig.getVitestConfigPath as jest.Mock).mockReturnValue('/path/to/vitest.config.ts');

            const args = buildTestArgs(
                files,
                testsByFile,
                'vitest',
                [],
                true, // collectCoverage
                mockConfig,
                mockController
            );

            expect(args[0]).toBe('run');
            expect(args).toContain('/path/to/test.ts');
            expect(args).toContain('--reporter=json');
            expect(args).toContain('--config');
            expect(args).toContain('/path/to/vitest.config.ts');
            expect(args).toContain('--coverage');
            expect(args).toContain('--coverage.reporter');
            expect(args).toContain('json');
        });

        it('should use partial run logic when appropriate', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            const mockTestItem = { label: 'test1' };
            testsByFile.set('/path/to/test.ts', [mockTestItem]);

            // Mock controller to return a file item with more children, implying partial run
            (mockController.items.get as jest.Mock).mockReturnValue({
                children: { size: 5 }
            });

            // Mock implementation of buildVitestArgs to verify it's called
            (mockConfig.buildVitestArgs as jest.Mock).mockReturnValue(['--mocked-vitest-args']);

            const args = buildTestArgs(
                files,
                testsByFile,
                'vitest',
                [],
                false,
                mockConfig,
                mockController
            );

            expect(mockConfig.buildVitestArgs).toHaveBeenCalled();
            expect(args).toContain('--mocked-vitest-args');
        });
    });

    describe('playwright', () => {
        it('should generate correct args for playwright partial run', () => {
            const files = ['/path/to/test.spec.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.spec.ts', [{ label: 'should login' }]);

            // Mock file with more tests than selected (partial run)
            (mockController.items.get as jest.Mock).mockReturnValue({
                children: { size: 3 }
            });

            // Mock buildPlaywrightArgs for partial run path
            (mockConfig as any).buildPlaywrightArgs = jest.fn().mockReturnValue(['test', '-g', "'should login'", '/path/to/test.spec.ts']);

            const args = buildTestArgs(
                files,
                testsByFile,
                'playwright',
                [],
                false,
                mockConfig,
                mockController
            );

            expect((mockConfig as any).buildPlaywrightArgs).toHaveBeenCalled();
            expect(args).toContain('test');
        });

        it('should generate correct args for playwright full file run', () => {
            const files = ['/path/to/test.spec.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.spec.ts', [{ label: 'test1' }, { label: 'test2' }]);

            // Mock file with same number of tests (full run)
            (mockController.items.get as jest.Mock).mockReturnValue({
                children: { size: 2 }
            });

            (mockConfig as any).buildPlaywrightArgs = jest.fn().mockReturnValue(['test', '-g', "'(test1|test2)'", '/path/to/test.spec.ts']);

            const args = buildTestArgs(
                files,
                testsByFile,
                'playwright',
                [],
                false,
                mockConfig,
                mockController
            );

            expect((mockConfig as any).buildPlaywrightArgs).toHaveBeenCalled();
        });

        it('should handle multiple files', () => {
            const files = ['/path/to/test1.spec.ts', '/path/to/test2.spec.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test1.spec.ts', [{ label: 'test1' }]);
            testsByFile.set('/path/to/test2.spec.ts', [{ label: 'test2' }]);

            (mockConfig as any).buildPlaywrightArgs = jest.fn().mockReturnValue(['test', '-g', "'(test1|test2)'", '/path/to/test1.spec.ts']);

            const args = buildTestArgs(
                files,
                testsByFile,
                'playwright',
                [],
                false,
                mockConfig,
                mockController
            );

            // Should contain both normalized file paths
            expect(args.some(a => a.includes('test1.spec.ts'))).toBe(true);
            expect(args.some(a => a.includes('test2.spec.ts'))).toBe(true);
        });

        it('should pass additional args', () => {
            const files = ['/path/to/test.spec.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.spec.ts', [{ label: 'test1' }]);

            (mockController.items.get as jest.Mock).mockReturnValue({
                children: { size: 2 }
            });

            (mockConfig as any).buildPlaywrightArgs = jest.fn().mockReturnValue(['test', '-g', "'test1'", '/path/to/test.spec.ts']);

            const args = buildTestArgs(
                files,
                testsByFile,
                'playwright',
                ['--project=chromium'],
                false,
                mockConfig,
                mockController
            );

            expect((mockConfig as any).buildPlaywrightArgs).toHaveBeenCalledWith(
                '/path/to/test.spec.ts',
                expect.any(String),
                true,
                ['--project=chromium']
            );
        });
    });

    describe('jest', () => {
        it('should generate correct args for jest with coverage', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            testsByFile.set('/path/to/test.ts', [{ label: 'test1' }]);
            (mockConfig.getJestConfigPath as jest.Mock).mockReturnValue('/path/to/jest.config.ts');

            const args = buildTestArgs(
                files,
                testsByFile,
                'jest',
                [],
                true, // collectCoverage
                mockConfig,
                mockController
            );

            expect(args).toContain('/path/to/test.ts');
            expect(args).toContain('--json');
            expect(args).toContain('-c');
            expect(args).toContain('/path/to/jest.config.ts');
            expect(args).toContain('--coverage');
            expect(args).toContain('--coverageReporters=json');
        });

        it('should use partial run logic when appropriate', () => {
            const files = ['/path/to/test.ts'];
            const testsByFile = new Map();
            const mockTestItem = { label: 'test1' };
            testsByFile.set('/path/to/test.ts', [mockTestItem]);

            // Mock controller to return a file item with more children, implying partial run
            (mockController.items.get as jest.Mock).mockReturnValue({
                children: { size: 5 }
            });

            // Mock implementation of buildJestArgs to verify it's called
            (mockConfig.buildJestArgs as jest.Mock).mockReturnValue(['--mocked-jest-args']);


            const args = buildTestArgs(
                files,
                testsByFile,
                'jest',
                [],
                false,
                mockConfig,
                mockController
            );

            expect(mockConfig.buildJestArgs).toHaveBeenCalled();
            expect(args).toContain('--mocked-jest-args');
        });
    });
});

