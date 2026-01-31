import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
    Document,
    TextEditor,
    Uri,
    WorkspaceConfiguration,
    WorkspaceFolder,
} from './__mocks__/vscode';
import * as fs from 'node:fs';
import * as testFileDetection from '../testDetection/testFileDetection';

describe('TestRunnerConfig - Node Test Runner', () => {
    let config: TestRunnerConfig;

    beforeEach(() => {
        config = new TestRunnerConfig();
        jest
            .spyOn(vscode.workspace, 'getWorkspaceFolder')
            .mockReturnValue(
                new WorkspaceFolder(new Uri('/home/user/project') as any) as any,
            );
        jest
            .spyOn(vscode.window, 'activeTextEditor', 'get')
            .mockReturnValue(
                new TextEditor(new Document(new Uri('/home/user/project/test.test.js') as any)) as any,
            );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('nodeTestCommand', () => {
        it('should return default node command when no custom command is set', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );

            expect(config.nodeTestCommand).toBe('node');
        });

        it('should return custom command when set', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.nodeTestCommand': 'tsx',
                } as any)
            );

            expect(config.nodeTestCommand).toBe('tsx');
        });
    });

    describe('getTestCommand', () => {
        it('should return node command for node-test framework', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('node-test');

            const command = config.getTestCommand('/path/to/test.test.js');

            expect(command).toBe('node');
        });

        it('should return jest command when framework is jest', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('jest');
            jest.spyOn(fs, 'existsSync').mockReturnValue(false);

            const command = config.getTestCommand('/path/to/test.spec.ts');

            expect(command).toBe('npx --no-install jest');
        });
    });

    describe('getTestFramework', () => {
        it('should return node-test for node test files', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('node-test');

            const framework = config.getTestFramework('/path/to/test.test.js');

            expect(framework).toBe('node-test');
        });

        it('should use active editor when no path provided', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            const mockGetFramework = jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('node-test');

            config.getTestFramework();

            expect(mockGetFramework).toHaveBeenCalledWith('/home/user/project/test.test.js');
        });
    });

    describe('nodeTestRunOptions', () => {
        it('should return null when no options configured', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );

            expect(config.nodeTestRunOptions).toBeNull();
        });

        it('should return configured options', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.nodeTestRunOptions': ['--experimental-test-coverage', '--test-reporter=spec'],
                })
            );

            expect(config.nodeTestRunOptions).toEqual(['--experimental-test-coverage', '--test-reporter=spec']);
        });
    });

    describe('nodeTestDebugOptions', () => {
        it('should return empty object by default', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );

            expect(config.nodeTestDebugOptions).toEqual({});
        });
    });

    describe('enableESM', () => {
        it('should return false by default', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );

            expect(config.enableESM).toBe(false);
        });

        it('should return true when enabled', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.enableESM': true,
                })
            );

            expect(config.enableESM).toBe(true);
        });
    });

    describe('getEnvironmentForRun', () => {
        it('should return undefined when ESM is disabled', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.enableESM': false,
                })
            );

            expect(config.getEnvironmentForRun('/path/to/test.js')).toBeUndefined();
        });

        it('should return NODE_OPTIONS when ESM is enabled', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.enableESM': true,
                })
            );

            const env = config.getEnvironmentForRun('/path/to/test.js');

            expect(env).toEqual({ NODE_OPTIONS: '--experimental-vm-modules' });
        });
    });

    describe('preserveEditorFocus', () => {
        it('should return false by default', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );

            expect(config.preserveEditorFocus).toBe(false);
        });
    });

    describe('runOptions validation', () => {
        it('should return null when runOptions is not set', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );

            expect(config.runOptions).toBeNull();
        });

        it('should return array when runOptions is valid array', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.runOptions': ['--verbose', '--bail'],
                })
            );

            expect(config.runOptions).toEqual(['--verbose', '--bail']);
        });
    });

    describe('codeLensOptions', () => {
        it('should return empty array when not configured', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );

            expect(config.codeLensOptions).toEqual([]);
        });
    });

    describe('getDebugConfiguration for node-test', () => {
        it('should return node test debug configuration', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('node-test');

            const debugConfig = config.getDebugConfiguration('/path/to/test.test.js');

            expect(debugConfig.name).toBe('Debug Node.js Tests');
            expect(debugConfig.runtimeArgs).toContain('--test');
        });

        it('should include test name pattern in debug configuration', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('node-test');

            const debugConfig = config.getDebugConfiguration('/path/to/test.test.js', 'my test');

            expect(debugConfig.runtimeArgs).toContain('--test-name-pattern');
            expect(debugConfig.runtimeArgs).toContain('my test');
        });

        it('should resolve template placeholders in test name', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('node-test');

            const debugConfig = config.getDebugConfiguration('/path/to/test.test.js', 'test %s');

            expect(debugConfig.runtimeArgs).toContain('--test-name-pattern');
            const patternArg = debugConfig.runtimeArgs![debugConfig.runtimeArgs!.indexOf('--test-name-pattern') + 1];
            expect(patternArg).not.toContain('%s');
        });

        it('should include nodeTestRunOptions in debug configuration', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.nodeTestRunOptions': ['--experimental-test-coverage'],
                })
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('node-test');

            const debugConfig = config.getDebugConfiguration('/path/to/test.test.js');

            expect(debugConfig.runtimeArgs).toContain('--experimental-test-coverage');
        });

        it('should set program to file path', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('node-test');

            const debugConfig = config.getDebugConfiguration('/path/to/test.test.js');

            expect(debugConfig.program).toBe('/path/to/test.test.js');
        });

        it('should use custom node test command when set', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.nodeTestCommand': 'tsx',
                } as any)
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('node-test');

            const debugConfig = config.getDebugConfiguration('/path/to/test.test.js');

            expect(debugConfig.runtimeExecutable).toBe('tsx');
        });
    });

    describe('getDebugConfiguration for jest with ESM', () => {
        it('should include NODE_OPTIONS for ESM mode', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.enableESM': true,
                })
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('jest');
            jest.spyOn(fs, 'existsSync').mockReturnValue(false);

            const debugConfig = config.getDebugConfiguration('/path/to/test.spec.ts');

            expect(debugConfig.env?.NODE_OPTIONS).toBe('--experimental-vm-modules');
        });

        it('should not include NODE_OPTIONS when ESM is disabled', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.enableESM': false,
                })
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('jest');
            jest.spyOn(fs, 'existsSync').mockReturnValue(false);

            const debugConfig = config.getDebugConfiguration('/path/to/test.spec.ts');

            expect(debugConfig.env?.NODE_OPTIONS).toBeUndefined();
        });
    });
});
