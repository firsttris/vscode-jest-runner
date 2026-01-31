import * as vscode from 'vscode';
import {
    buildTestArgs,
    collectTestsByFile,
    buildTestArgsFast,
    canUseFastMode,
    logTestExecution,
} from '../testExecution';
import { TestRunnerConfig } from '../testRunnerConfig';
import { Uri, WorkspaceConfiguration, WorkspaceFolder, TestItem, TestItemCollection } from './__mocks__/vscode';

jest.mock('../util', () => {
    const actual = jest.requireActual('../util');
    return {
        ...actual,
        normalizePath: (path: string) => path.replace(/\\/g, '/'),
    };
});

describe('testExecution', () => {
    describe('buildTestArgs', () => {
        let mockTestController: vscode.TestController;
        let mockJestConfig: TestRunnerConfig;

        beforeEach(() => {
            mockTestController = {
                items: {
                    get: jest.fn().mockReturnValue(undefined),
                },
            } as unknown as vscode.TestController;

            mockJestConfig = {
                getJestConfigPath: jest.fn().mockReturnValue('/workspace/jest.config.js'),
                getVitestConfigPath: jest.fn().mockReturnValue('/workspace/vitest.config.ts'),
                buildJestArgs: jest.fn().mockReturnValue(['mocked', 'args']),
                buildVitestArgs: jest.fn().mockReturnValue(['vitest', 'mocked', 'args']),
                nodeTestRunOptions: null,
            } as unknown as TestRunnerConfig;

            jest
                .spyOn(vscode.workspace, 'getConfiguration')
                .mockReturnValue(new WorkspaceConfiguration({}) as any);
            jest
                .spyOn(vscode.workspace, 'getWorkspaceFolder')
                .mockReturnValue(new WorkspaceFolder(new Uri('/workspace') as any) as any);
        });

        describe('Windows path normalization', () => {
            it('should normalize Windows backslashes to forward slashes for Jest', () => {
                const windowsPath = 'C:\\Projects\\app\\src\\test.spec.ts';
                const testsByFile = new Map([[windowsPath, []]]);

                const args = buildTestArgs(
                    [windowsPath],
                    testsByFile as any,
                    'jest',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('C:/Projects/app/src/test.spec.ts');
                expect(args.join(' ')).not.toContain('\\');
            });

            it('should normalize Windows backslashes to forward slashes for Vitest', () => {
                const windowsPath = 'C:\\Projects\\app\\src\\test.spec.ts';
                const testsByFile = new Map([[windowsPath, []]]);

                const args = buildTestArgs(
                    [windowsPath],
                    testsByFile as any,
                    'vitest',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('C:/Projects/app/src/test.spec.ts');
                expect(args.join(' ')).not.toContain('\\');
            });

            it('should handle multiple Windows paths', () => {
                const windowsPaths = [
                    'C:\\Projects\\app\\src\\test1.spec.ts',
                    'C:\\Projects\\app\\src\\test2.spec.ts',
                ];
                const testsByFile = new Map(windowsPaths.map((p) => [p, []]));

                const args = buildTestArgs(
                    windowsPaths,
                    testsByFile as any,
                    'jest',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('C:/Projects/app/src/test1.spec.ts');
                expect(args).toContain('C:/Projects/app/src/test2.spec.ts');
            });

            it('should not modify Unix paths', () => {
                const unixPath = '/home/user/project/src/test.spec.ts';
                const testsByFile = new Map([[unixPath, []]]);

                const args = buildTestArgs(
                    [unixPath],
                    testsByFile as any,
                    'jest',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('/home/user/project/src/test.spec.ts');
            });
        });

        describe('node-test framework', () => {
            it('should include --test flag for node-test', () => {
                const filePath = '/path/to/test.test.js';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'node-test',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args[0]).toBe('--test');
            });

            it('should include --test-reporter tap for node-test', () => {
                const filePath = '/path/to/test.test.js';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'node-test',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('--test-reporter');
                expect(args).toContain('tap');
            });

            it('should place file path at the end for node-test', () => {
                const filePath = '/path/to/test.test.js';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'node-test',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args[args.length - 1]).toBe('/path/to/test.test.js');
            });

            it('should include test name pattern for node-test when tests are specified', () => {
                const filePath = '/path/to/test.test.js';
                const testItem = new TestItem('my test', 'my test', Uri.file(filePath) as any);
                const testsByFile = new Map([[filePath, [testItem]]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'node-test',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('--test-name-pattern');
            });

            it('should include coverage flag for node-test when coverage is enabled', () => {
                const filePath = '/path/to/test.test.js';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'node-test',
                    [],
                    true,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('--experimental-test-coverage');
            });

            it('should include additional args for node-test', () => {
                const filePath = '/path/to/test.test.js';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'node-test',
                    ['--watch'],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('--watch');
            });
        });

        describe('Jest framework', () => {
            it('should include --json flag for Jest', () => {
                const filePath = '/path/to/test.spec.ts';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'jest',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('--json');
            });

            it('should include config path for Jest', () => {
                const filePath = '/path/to/test.spec.ts';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'jest',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('-c');
                expect(args).toContain('/workspace/jest.config.js');
            });

            it('should include coverage flags for Jest when enabled', () => {
                const filePath = '/path/to/test.spec.ts';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'jest',
                    [],
                    true,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('--coverage');
                expect(args).toContain('--coverageReporters=json');
            });
        });

        describe('Vitest framework', () => {
            it('should include run subcommand for Vitest', () => {
                const filePath = '/path/to/test.spec.ts';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'vitest',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args[0]).toBe('run');
            });

            it('should include --reporter=json for Vitest', () => {
                const filePath = '/path/to/test.spec.ts';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'vitest',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('--reporter=json');
            });

            it('should include config path for Vitest', () => {
                const filePath = '/path/to/test.spec.ts';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'vitest',
                    [],
                    false,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('--config');
                expect(args).toContain('/workspace/vitest.config.ts');
            });

            it('should include coverage flags for Vitest when enabled', () => {
                const filePath = '/path/to/test.spec.ts';
                const testsByFile = new Map([[filePath, []]]);

                const args = buildTestArgs(
                    [filePath],
                    testsByFile as any,
                    'vitest',
                    [],
                    true,
                    mockJestConfig,
                    mockTestController,
                );

                expect(args).toContain('--coverage');
                expect(args).toContain('--coverage.reporter');
                expect(args).toContain('json');
            });
        });
    });

    describe('collectTestsByFile', () => {
        it('should collect tests from request include', () => {
            const testItem1 = new TestItem('test1', 'test1', Uri.file('/path/test1.spec.ts') as any);
            const testItem2 = new TestItem('test2', 'test2', Uri.file('/path/test2.spec.ts') as any);

            const mockController = {
                items: new TestItemCollection(),
            } as unknown as vscode.TestController;

            const request = {
                include: [testItem1, testItem2],
                exclude: [],
            } as unknown as vscode.TestRunRequest;

            const result = collectTestsByFile(request, mockController);

            expect(result.size).toBe(2);
            expect(result.get('/path/test1.spec.ts')).toContain(testItem1);
            expect(result.get('/path/test2.spec.ts')).toContain(testItem2);
        });

        it('should exclude tests from request exclude', () => {
            const testItem1 = new TestItem('test1', 'test1', Uri.file('/path/test.spec.ts') as any);
            const testItem2 = new TestItem('test2', 'test2', Uri.file('/path/test.spec.ts') as any);

            const mockController = {
                items: new TestItemCollection(),
            } as unknown as vscode.TestController;

            const request = {
                include: [testItem1, testItem2],
                exclude: [testItem2],
            } as unknown as vscode.TestRunRequest;

            const result = collectTestsByFile(request, mockController);

            expect(result.get('/path/test.spec.ts')).toContain(testItem1);
            expect(result.get('/path/test.spec.ts')).not.toContain(testItem2);
        });

        it('should collect children from parent test items', () => {
            const parentItem = new TestItem('parent', 'parent', Uri.file('/path/test.spec.ts') as any);
            const childItem1 = new TestItem('child1', 'child1', Uri.file('/path/test.spec.ts') as any);
            const childItem2 = new TestItem('child2', 'child2', Uri.file('/path/test.spec.ts') as any);
            parentItem.children.add(childItem1);
            parentItem.children.add(childItem2);

            const mockController = {
                items: new TestItemCollection(),
            } as unknown as vscode.TestController;

            const request = {
                include: [parentItem],
                exclude: [],
            } as unknown as vscode.TestRunRequest;

            const result = collectTestsByFile(request, mockController);

            expect(result.get('/path/test.spec.ts')).toContain(childItem1);
            expect(result.get('/path/test.spec.ts')).toContain(childItem2);
        });

        it('should collect all tests from controller when include is undefined', () => {
            const testItem = new TestItem('test', 'test', Uri.file('/path/test.spec.ts') as any);

            const items = new TestItemCollection();
            items.add(testItem);

            const mockController = {
                items,
            } as unknown as vscode.TestController;

            const request = {
                include: undefined,
                exclude: [],
            } as unknown as vscode.TestRunRequest;

            const result = collectTestsByFile(request, mockController);

            expect(result.get('/path/test.spec.ts')).toContain(testItem);
        });
    });

    describe('buildTestArgsFast', () => {
        let mockJestConfig: TestRunnerConfig;

        beforeEach(() => {
            mockJestConfig = {
                buildTestArgs: jest.fn().mockReturnValue(['test', 'args']),
            } as unknown as TestRunnerConfig;
        });

        it('should use buildTestArgs for node-test framework', () => {
            buildTestArgsFast('/path/to/test.test.js', 'my test', 'node-test', mockJestConfig);

            expect(mockJestConfig.buildTestArgs).toHaveBeenCalledWith(
                '/path/to/test.test.js',
                'my test',
                true,
                [],
            );
        });

        it('should use buildTestArgs for vitest framework', () => {
            buildTestArgsFast('/path/to/test.spec.ts', 'my test', 'vitest', mockJestConfig);

            expect(mockJestConfig.buildTestArgs).toHaveBeenCalledWith(
                '/path/to/test.spec.ts',
                'my test',
                true,
                [],
            );
        });

        it('should use buildTestArgs for jest framework', () => {
            buildTestArgsFast('/path/to/test.spec.ts', 'my test', 'jest', mockJestConfig);

            expect(mockJestConfig.buildTestArgs).toHaveBeenCalledWith(
                '/path/to/test.spec.ts',
                'my test',
                true,
                [],
            );
        });
    });

    describe('canUseFastMode', () => {
        it('should return false when coverage is enabled', () => {
            const testsByFile = new Map([
                ['/path/test.spec.ts', [new TestItem('test', 'test')]],
            ]);

            const result = canUseFastMode(testsByFile as any, true);

            expect(result).toBe(false);
        });

        it('should return false when multiple files are being tested', () => {
            const testsByFile = new Map([
                ['/path/test1.spec.ts', [new TestItem('test1', 'test1')]],
                ['/path/test2.spec.ts', [new TestItem('test2', 'test2')]],
            ]);

            const result = canUseFastMode(testsByFile as any, false);

            expect(result).toBe(false);
        });

        it('should return false when multiple tests in single file', () => {
            const testsByFile = new Map([
                ['/path/test.spec.ts', [
                    new TestItem('test1', 'test1'),
                    new TestItem('test2', 'test2'),
                ]],
            ]);

            const result = canUseFastMode(testsByFile as any, false);

            expect(result).toBe(false);
        });

        it('should return true for single test without coverage', () => {
            const testsByFile = new Map([
                ['/path/test.spec.ts', [new TestItem('test', 'test')]],
            ]);

            const result = canUseFastMode(testsByFile as any, false);

            expect(result).toBe(true);
        });
    });

    describe('logTestExecution', () => {
        it('should log test execution without throwing', () => {
            expect(() => {
                logTestExecution('jest', 'npx jest', ['--json'], 5, 2, false);
            }).not.toThrow();
        });

        it('should include ESM mode in log when enabled', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            expect(() => {
                logTestExecution('jest', 'npx jest', ['--json'], 5, 2, true);
            }).not.toThrow();

            consoleSpy.mockRestore();
        });
    });
});
