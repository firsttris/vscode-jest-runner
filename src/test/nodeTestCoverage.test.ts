import { TestRunnerConfig } from '../testRunnerConfig';
import { CoverageProvider } from '../coverageProvider';
import * as path from 'path';
import * as fs from 'fs';

// Mock dependencies
jest.mock('fs');
jest.mock('lcov-parse', () => {
    return (file: string, cb: (err: any, data: any) => void) => {
        if (file.includes('lcov.info')) {
            cb(null, [
                {
                    file: file.includes('relative') ? 'node/test.js' : '/path/to/test.js',
                    lines: {
                        details: [
                            { line: 1, hit: 1 },
                            { line: 2, hit: 0 },
                        ]
                    },
                    functions: {
                        details: [
                            { name: 'testFunc', line: 1, hit: 1 }
                        ]
                    },
                    branches: {
                        details: []
                    }
                }
            ]);
        } else {
            cb(new Error('File not found'), null);
        }
    };
}, { virtual: true });

describe('Node Test Coverage Support', () => {
    let config: TestRunnerConfig;

    beforeEach(() => {
        config = new TestRunnerConfig();
        // Reset mocks
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('{}');
    });

    describe('buildNodeTestArgs', () => {
        it('should add coverage flags when coverage option is present', () => {
            const filePath = '/path/to/test.js';
            const args = config.buildNodeTestArgs(
                filePath,
                undefined,
                false,
                ['--coverage']
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

            expect(args).not.toContain('--coverage'); // Should be removed
        });

        it('should not add coverage flags when coverage option is not present', () => {
            const filePath = '/path/to/test.js';
            const args = config.buildNodeTestArgs(
                filePath,
                undefined,
                false,
                []
            );

            expect(args).not.toContain('--experimental-test-coverage');
            expect(args).not.toContain('lcov');
        });
    });

    describe('CoverageProvider', () => {
        let provider: CoverageProvider;

        beforeEach(() => {
            provider = new CoverageProvider();
        });

        it('should read lcov coverage for node-test framework', async () => {
            const coverage = await provider.readCoverageFromFile(
                '/workspace',
                'node-test'
            );

            expect(coverage).toBeDefined();
            expect(coverage!['/path/to/test.js']).toBeDefined();
            expect(coverage!['/path/to/test.js'].s['0']).toBe(1);
            expect(coverage!['/path/to/test.js'].s['1']).toBe(0);
            expect(coverage!['/path/to/test.js'].fnMap['0'].name).toBe('testFunc');
        });
        it('should read lcov coverage from test file directory if not found in root', async () => {
            // Mock lcov.info not existing in root but existing in test file dir
            (fs.existsSync as jest.Mock).mockImplementation((pathStr: string) => {
                const normalizedPath = pathStr.replace(/\\/g, '/');
                return normalizedPath.includes('/path/to/lcov.info'); // Simulate exists next to file
            });

            const coverage = await provider.readCoverageFromFile(
                '/workspace',
                'node-test',
                undefined,
                '/path/to/test.js'
            );

            expect(coverage).toBeDefined();
            // Verify path normalization or finding
            const calls = (fs.existsSync as jest.Mock).mock.calls.map(c => c[0].replace(/\\/g, '/'));
            expect(calls).toContain('/path/to/lcov.info');
        });
        it('should resolve relative paths in lcov file', async () => {
            // Mock lcov.info with relative path content
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            // Our mock lcov-parse returns 'node/test.js' when filename includes 'relative'
            // We verify that it gets resolved against the lcov path directory
            const lcovPath = '/workspace/relative/lcov.info';

            const coverage = await (provider as any).readLcovCoverage(lcovPath);

            expect(coverage).toBeDefined();
            // Expected resolution: dirname(/workspace/relative/lcov.info) + node/test.js
            // = /workspace/relative/node/test.js
            const expectedPath = path.resolve('/workspace/relative', 'node/test.js');
            console.log('Expected:', expectedPath);
            // Check keys of coverage map
            const keys = Object.keys(coverage!);
            expect(keys[0]).toBe(expectedPath);
        });
    });
});
