import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
	Uri,
	WorkspaceConfiguration,
	WorkspaceFolder,
} from './__mocks__/vscode';

describe('TestRunnerConfig', () => {
	describe('jestCommand', () => {
		let jestRunnerConfig: TestRunnerConfig;

		beforeEach(() => {
			jestRunnerConfig = new TestRunnerConfig();
			jest
				.spyOn(vscode.workspace, 'getWorkspaceFolder')
				.mockReturnValue(
					new WorkspaceFolder(new Uri('/home/user/project') as any) as any,
				);
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it('should return custom jest command when set', () => {
			jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
				new WorkspaceConfiguration({
					'jestrunner.jestCommand': 'yarn jest',
				}),
			);

			expect(jestRunnerConfig.jestCommand).toBe('yarn jest');
		});

		it('should resolve ${workspaceFolder} in custom jest command', () => {
			jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
				new WorkspaceConfiguration({
					'jestrunner.jestCommand':
						'node ${workspaceFolder}/node_modules/jest/bin/jest.js',
				}),
			);

			expect(
				jestRunnerConfig.getTestCommand('/home/user/project/src/a.test.ts'),
			).toBe('node /home/user/project/node_modules/jest/bin/jest.js');
		});

		it('should return default jest command when not set (fallback)', () => {
			jest
				.spyOn(vscode.workspace, 'getConfiguration')
				.mockReturnValue(new WorkspaceConfiguration({}));

			// Mock failure to find binary
			jest.spyOn(fs, 'existsSync').mockReturnValue(false);

			expect(jestRunnerConfig.jestCommand).toBe('npx --no-install jest');
		});
	});
});
