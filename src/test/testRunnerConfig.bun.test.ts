
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

describe('TestRunnerConfig - Bun Runner', () => {
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
                new TextEditor(new Document(new Uri('/home/user/project/test.test.ts') as any)) as any,
            );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('bunCommand', () => {
        it('should return default bun command when no custom command is set', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );

            expect(config.bunCommand).toBe('bun');
        });

        it('should return custom command when set', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.bunCommand': '/usr/bin/bun',
                } as any)
            );

            expect(config.bunCommand).toBe('/usr/bin/bun');
        });
    });

    describe('getTestCommand', () => {
        it('should return bun command for bun framework', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            jest.spyOn(testFileDetection, 'getTestFrameworkForFile').mockReturnValue('bun');

            const command = config.getTestCommand('/path/to/test.test.ts');

            expect(command).toBe('bun');
        });
    });

    describe('bunRunOptions', () => {
        it('should return null when no options configured', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );

            expect(config.bunRunOptions).toBeNull();
        });

        it('should return configured options', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.bunRunOptions': ['--silent'],
                })
            );

            expect(config.bunRunOptions).toEqual(['--silent']);
        });
    });

    describe('buildBunArgs', () => {
        it('should build basic args', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            const args = config.buildBunArgs('/path/to/test.ts', undefined, false);
            expect(args).toEqual(['test', '/path/to/test.ts']);
        });

        it('should include test name when provided', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({})
            );
            const args = config.buildBunArgs('/path/to/test.ts', 'my test', false);
            expect(args).toEqual(['test', '-t', 'my test', '/path/to/test.ts']);
        });

        it('should include run options', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                    'jestrunner.bunRunOptions': ['--silent'],
                })
            );
            const args = config.buildBunArgs('/path/to/test.ts', undefined, false);
            expect(args).toEqual(['test', '--silent', '/path/to/test.ts']);
        });
    });
});
