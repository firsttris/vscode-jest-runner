import * as vscode from 'vscode';
import * as testDetection from '../testDetection/testFileDetection';
import { TestRunnerConfig } from '../testRunnerConfig';
import * as ResolverUtils from '../utils/ResolverUtils';
import {
	Document,
	TextEditor,
	Uri,
	WorkspaceConfiguration,
	WorkspaceFolder,
} from './__mocks__/vscode';

describe('TestRunnerConfig - Playwright Debug', () => {
	let config: TestRunnerConfig;
	const mockFilePath = '/home/user/project/tests/example.spec.ts';

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
				new TextEditor(new Document(new Uri(mockFilePath) as any)) as any,
			);

		jest
			.spyOn(testDetection, 'getTestFrameworkForFile')
			.mockReturnValue('playwright');
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('should create a node debug configuration', () => {
		jest
			.spyOn(vscode.workspace, 'getConfiguration')
			.mockReturnValue(new WorkspaceConfiguration({}));
		jest.spyOn(ResolverUtils, 'resolveBinaryPath').mockReturnValue(undefined);

		const debugConfig = config.getDebugConfiguration(mockFilePath);

		expect(debugConfig.type).toBe('node');
		expect(debugConfig.request).toBe('launch');
		expect(debugConfig.name).toBe('Debug Playwright Tests');
	});

	it('should include --workers=1 for single-threaded debugging', () => {
		jest
			.spyOn(vscode.workspace, 'getConfiguration')
			.mockReturnValue(new WorkspaceConfiguration({}));
		jest.spyOn(ResolverUtils, 'resolveBinaryPath').mockReturnValue(undefined);

		const debugConfig = config.getDebugConfiguration(mockFilePath);

		expect(debugConfig.args).toContain('--workers=1');
	});

	it('should fall back to npx when no binary found', () => {
		jest
			.spyOn(vscode.workspace, 'getConfiguration')
			.mockReturnValue(new WorkspaceConfiguration({}));
		jest.spyOn(ResolverUtils, 'resolveBinaryPath').mockReturnValue(undefined);

		const debugConfig = config.getDebugConfiguration(mockFilePath);

		expect(debugConfig.runtimeExecutable).toBe('npx');
		expect(debugConfig.args).toContain('--no-install');
		expect(debugConfig.args).toContain('playwright');
	});

	it('should use resolved binary path when available', () => {
		jest
			.spyOn(vscode.workspace, 'getConfiguration')
			.mockReturnValue(new WorkspaceConfiguration({}));
		jest
			.spyOn(ResolverUtils, 'resolveBinaryPath')
			.mockReturnValue('/home/user/project/node_modules/.bin/playwright');

		const debugConfig = config.getDebugConfiguration(mockFilePath);

		expect(debugConfig.program).toBe(
			'/home/user/project/node_modules/.bin/playwright',
		);
		expect(debugConfig.runtimeExecutable).toBeUndefined();
	});

	it('should include test args with file path', () => {
		jest
			.spyOn(vscode.workspace, 'getConfiguration')
			.mockReturnValue(new WorkspaceConfiguration({}));
		jest
			.spyOn(ResolverUtils, 'resolveBinaryPath')
			.mockReturnValue('/home/user/project/node_modules/.bin/playwright');

		const debugConfig = config.getDebugConfiguration(mockFilePath);

		expect(debugConfig.args).toContain('test');
		expect(debugConfig.args).toContain(mockFilePath);
	});

	it('should include test name filter in debug args', () => {
		jest
			.spyOn(vscode.workspace, 'getConfiguration')
			.mockReturnValue(new WorkspaceConfiguration({}));
		jest
			.spyOn(ResolverUtils, 'resolveBinaryPath')
			.mockReturnValue('/home/user/project/node_modules/.bin/playwright');

		const debugConfig = config.getDebugConfiguration(
			mockFilePath,
			'should login',
		);

		expect(debugConfig.args).toContain('-g');
		expect(
			debugConfig.args.some((a: string) => a.includes('should login')),
		).toBe(true);
	});

	it('should use custom playwright command when set', () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
			new WorkspaceConfiguration({
				'jestrunner.playwrightCommand': '/custom/path/playwright',
			}),
		);

		const debugConfig = config.getDebugConfiguration(mockFilePath);

		expect(debugConfig.program).toBeUndefined();
		expect(debugConfig.runtimeExecutable).toBe('/custom/path/playwright');
	});

	it('should use custom command with env vars', () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
			new WorkspaceConfiguration({
				'jestrunner.playwrightCommand': 'PWDEBUG=1 /custom/path/playwright',
			}),
		);

		const debugConfig = config.getDebugConfiguration(mockFilePath);

		expect(debugConfig.program).toBeUndefined();
		expect(debugConfig.runtimeExecutable).toBe('/custom/path/playwright');
		expect(debugConfig.env).toEqual(expect.objectContaining({ PWDEBUG: '1' }));
	});

	it('should preserve custom playwright command args without npx fallback', () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
			new WorkspaceConfiguration({
				'jestrunner.playwrightCommand':
					'node ./custom-playwright.mjs --config=playwright.custom.ts',
			}),
		);
		jest.spyOn(ResolverUtils, 'resolveBinaryPath').mockReturnValue(undefined);

		const debugConfig = config.getDebugConfiguration(mockFilePath, 'my test');

		expect(debugConfig.program).toBe('node');
		expect(debugConfig.runtimeExecutable).toBeUndefined();
		expect(debugConfig.args).toEqual([
			'./custom-playwright.mjs',
			'--config=playwright.custom.ts',
			'test',
			'-g',
			'my test',
			mockFilePath,
			'--workers=1',
		]);
	});

	it('should include custom playwrightDebugOptions', () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
			new WorkspaceConfiguration({
				'jestrunner.playwrightDebugOptions': {
					env: { CUSTOM_ENV: 'true' },
				},
			}),
		);
		jest.spyOn(ResolverUtils, 'resolveBinaryPath').mockReturnValue(undefined);

		const debugConfig = config.getDebugConfiguration(mockFilePath);

		expect(debugConfig.env).toEqual(
			expect.objectContaining({ CUSTOM_ENV: 'true' }),
		);
	});

	it('should include test args in custom command debug config', () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
			new WorkspaceConfiguration({
				'jestrunner.playwrightCommand': '/custom/playwright',
			}),
		);

		const debugConfig = config.getDebugConfiguration(mockFilePath, 'my test');

		expect(debugConfig.runtimeExecutable).toBe('/custom/playwright');
		expect(debugConfig.runtimeArgs).toContain('test');
		expect(debugConfig.runtimeArgs).toContain('-g');
		expect(
			debugConfig.runtimeArgs?.some((a: string) => a.includes('my test')),
		).toBe(
			true,
		);
		expect(debugConfig.runtimeArgs).toContain(mockFilePath);
	});

	it('should not duplicate test filters from custom playwright command', () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
			new WorkspaceConfiguration({
				'jestrunner.playwrightCommand': '/custom/playwright test -g smoke',
			}),
		);

		const debugConfig = config.getDebugConfiguration(mockFilePath, 'my test');

		expect(
			debugConfig.runtimeArgs?.filter((arg: string) => arg === 'test'),
		).toHaveLength(1);
		expect(
			debugConfig.runtimeArgs?.filter((arg: string) => arg === '-g'),
		).toHaveLength(2);
		expect(debugConfig.runtimeArgs).toEqual(
			expect.arrayContaining(['smoke', 'my test', mockFilePath]),
		);
	});

	it('should not duplicate test subcommand from run options', () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
			new WorkspaceConfiguration({
				'jestrunner.playwrightRunOptions': ['test', '--headed'],
			}),
		);
		jest
			.spyOn(ResolverUtils, 'resolveBinaryPath')
			.mockReturnValue('/home/user/project/node_modules/.bin/playwright');

		const debugConfig = config.getDebugConfiguration(mockFilePath);

		expect(
			debugConfig.args?.filter((arg: string) => arg === 'test'),
		).toHaveLength(1);
		expect(debugConfig.args).toContain('--headed');
	});
});
