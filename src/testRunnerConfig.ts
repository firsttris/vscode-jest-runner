import { dirname, resolve } from 'node:path';
import * as vscode from 'vscode';
import { findConfigPath, resolveConfigPath } from './ConfigResolver';
import * as Settings from './config/Settings';
import { getDebugConfiguration } from './debug/DebugConfigurationProvider';
import { getFrameworkAdapter } from './frameworkAdapters';
import type { TestFrameworkName } from './testDetection/frameworkDefinitions';
import { findTestFrameworkDirectory } from './testDetection/frameworkDetection';
import { getTestFrameworkForFile } from './testDetection/testFileDetection';
import type { CodeLensOption } from './util';
import { normalizePath } from './utils/PathUtils';
import {
	resolveBinaryPath,
	resolveConfigPath as resolveConfigPathInTree,
} from './utils/ResolverUtils';
import { quote } from './utils/TestNameUtils';
import { resolveVariables } from './utils/VariableUtils';

const PROJECT_DIRECTORY_FRAMEWORKS: ReadonlySet<TestFrameworkName> = new Set([
	'jest',
	'vitest',
	'rstest',
]);

export class TestRunnerConfig {
	public get jestCommand(): string {
		return this.getJestCommand();
	}

	private getJestCommand(filePath?: string): string {
		return this.resolveNodeCommand(
			Settings.getJestCommand(),
			'jest',
			'npx --no-install jest',
			filePath,
		);
	}

	public get vitestCommand(): string {
		return this.getVitestCommand();
	}

	private getVitestCommand(filePath?: string): string {
		return this.resolveNodeCommand(
			Settings.getVitestCommand(),
			'vitest',
			'npx --no-install vitest',
			filePath,
		);
	}

	/**
	 * Custom command if configured, else the package's binary resolved from
	 * the working directory of `filePath`, else `fallback`.
	 */
	private resolveNodeCommand(
		customCommand: string | undefined,
		packageName: string,
		fallback: string,
		filePath?: string,
		binName?: string,
	): string {
		if (customCommand) {
			return this.resolveVariables(customCommand, filePath);
		}

		const binaryPath = resolveBinaryPath(
			packageName,
			this.getCwd(filePath),
			binName,
		);
		return binaryPath ? `node ${quote(binaryPath)}` : fallback;
	}

	public get nodeTestCommand(): string {
		return this.getNodeTestCommand();
	}

	private getNodeTestCommand(filePath?: string): string {
		const customCommand = Settings.getNodeTestCommand();
		return customCommand
			? this.resolveVariables(customCommand, filePath)
			: 'node';
	}

	public get bunCommand(): string {
		return 'bun';
	}

	public get denoCommand(): string {
		return 'deno';
	}

	public get playwrightCommand(): string {
		return this.getPlaywrightCommand();
	}

	private getPlaywrightCommand(filePath?: string): string {
		const customCommand = Settings.getPlaywrightCommand();
		if (customCommand) {
			return this.resolveVariables(customCommand, filePath);
		}
		return 'npx playwright';
	}

	public get rstestCommand(): string {
		return this.getRstestCommand();
	}

	private getRstestCommand(filePath?: string): string {
		return this.resolveNodeCommand(
			Settings.getRstestCommand(),
			'@rstest/core',
			'npx --no-install rstest',
			filePath,
			'rstest',
		);
	}

	public getTestCommand(filePath?: string): string {
		if (filePath) {
			const framework = getTestFrameworkForFile(filePath);
			if (framework === 'vitest') {
				return this.getVitestCommand(filePath);
			}
			if (framework === 'node-test') {
				return this.getNodeTestCommand(filePath);
			}
			if (framework === 'bun') {
				return this.bunCommand;
			}
			if (framework === 'deno') {
				return this.denoCommand;
			}
			if (framework === 'playwright') {
				return this.getPlaywrightCommand(filePath);
			}
			if (framework === 'rstest') {
				return this.getRstestCommand(filePath);
			}
		}
		return this.getJestCommand(filePath);
	}

	// ... (existing getters)

	public get playwrightRunOptions(): string[] | null {
		return Settings.getPlaywrightRunOptions();
	}

	public get playwrightDebugOptions(): Partial<vscode.DebugConfiguration> {
		return Settings.getPlaywrightDebugOptions();
	}

	// ...

	public buildPlaywrightArgs(
		filePath: string,
		testName: string | undefined,
		withQuotes: boolean,
		options: string[] = [],
	): string[] {
		return getFrameworkAdapter('playwright').buildArgs(
			filePath,
			testName,
			withQuotes,
			options,
			'',
			Settings.getPlaywrightRunOptions(),
		);
	}

	public buildTestArgs(
		filePath: string,
		testName: string | undefined,
		withQuotes: boolean,
		options: string[] = [],
	): string[] {
		const framework = this.getTestFramework(filePath);
		if (framework === 'vitest') {
			return this.buildVitestArgs(filePath, testName, withQuotes, options);
		}
		if (framework === 'node-test') {
			return this.buildNodeTestArgs(filePath, testName, withQuotes, options);
		}
		if (framework === 'bun') {
			return this.buildBunArgs(filePath, testName, withQuotes, options);
		}
		if (framework === 'deno') {
			return this.buildDenoArgs(filePath, testName, withQuotes, options);
		}
		if (framework === 'playwright') {
			return this.buildPlaywrightArgs(filePath, testName, withQuotes, options);
		}
		if (framework === 'rstest') {
			return this.buildRstestArgs(filePath, testName, withQuotes, options);
		}
		return this.buildJestArgs(filePath, testName, withQuotes, options);
	}

	public get enableESM(): boolean {
		return Settings.isESMEnabled();
	}

	public getEnvironmentForRun(
		_filePath: string,
	): Record<string, string> | undefined {
		if (this.enableESM) {
			return { NODE_OPTIONS: '--experimental-vm-modules' };
		}
		return undefined;
	}

	public getTestFramework(filePath?: string): TestFrameworkName | undefined {
		if (filePath) {
			return getTestFrameworkForFile(filePath);
		}
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			return getTestFrameworkForFile(editor.document.uri.fsPath);
		}
		return undefined;
	}

	public get changeDirectoryToWorkspaceRoot(): boolean {
		return Settings.isChangeDirectoryToWorkspaceRoot();
	}

	public get preserveEditorFocus(): boolean {
		return Settings.isPreserveEditorFocus();
	}

	/** Working directory for the active editor's file. */
	public get cwd(): string {
		return this.getCwd();
	}

	/**
	 * Working directory for running `filePath`. Without a path, the active
	 * editor's file is used, which is only right for editor-driven commands:
	 * Test Explorer runs must pass the test file.
	 */
	public getCwd(filePath?: string): string {
		return (
			this.getProjectPathFromConfig(filePath) ||
			this.getPackagePath(filePath) ||
			this.getWorkspaceFolderPath(filePath)
		);
	}

	/**
	 * Working directory for a Test Explorer run of `filePath`.
	 *
	 * Jest, Vitest and Rstest report their project directory (where the config
	 * lives). For the other frameworks the detected directory is just the test
	 * file's folder, so they run from the directory of their nearest config
	 * (deno.json, bun.lock, playwright.config.*): Deno and Playwright look for
	 * it in the working directory, not next to the test file. Without a
	 * config they run from the nearest package.json, else the workspace.
	 */
	public getTestRunCwd(filePath: string): string {
		const projectPath = this.getProjectPathFromConfig(filePath);
		if (projectPath) {
			return projectPath;
		}

		const result = findTestFrameworkDirectory(filePath);
		if (result && PROJECT_DIRECTORY_FRAMEWORKS.has(result.framework)) {
			return normalizePath(result.directory);
		}

		const workspaceFolderPath = this.getWorkspaceFolderPath(filePath);
		const configPath =
			(result && this.findConfigPath(filePath, undefined, result.framework)) ||
			resolveConfigPathInTree(
				['package.json'],
				dirname(filePath),
				workspaceFolderPath,
			);

		return configPath ? dirname(configPath) : workspaceFolderPath;
	}

	public get projectPathFromConfig(): string | undefined {
		return this.getProjectPathFromConfig();
	}

	private getProjectPathFromConfig(filePath?: string): string | undefined {
		const projectPath = Settings.getProjectPath();
		if (projectPath) {
			return resolve(this.getWorkspaceFolderPath(filePath), projectPath);
		}
		return undefined;
	}

	public get useNearestConfig(): boolean | undefined {
		return Settings.isUseNearestConfig();
	}

	public get currentPackagePath() {
		return this.getPackagePath();
	}

	private getPackagePath(filePath?: string): string {
		const uri = this.getContextUri(filePath);
		if (!uri) {
			return '';
		}

		const result = findTestFrameworkDirectory(uri.fsPath);
		return result ? normalizePath(result.directory) : '';
	}

	/**
	 * `value` with VS Code variables such as `${workspaceFolder}` replaced,
	 * resolved against the workspace folder of `filePath`.
	 */
	public resolveVariables(value: string, filePath?: string): string {
		return resolveVariables(value, this.getWorkspaceFolderPath(filePath));
	}

	public get currentWorkspaceFolderPath(): string {
		return this.getWorkspaceFolderPath();
	}

	private getWorkspaceFolderPath(filePath?: string): string {
		const uri = this.getContextUri(filePath);
		const workspaceFolder = uri
			? vscode.workspace.getWorkspaceFolder(uri)
			: undefined;

		return (
			workspaceFolder?.uri.fsPath ||
			vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
			''
		);
	}

	private getContextUri(filePath?: string): vscode.Uri | undefined {
		return filePath
			? vscode.Uri.file(filePath)
			: vscode.window.activeTextEditor?.document.uri;
	}

	private getResolutionContext(targetPath?: string) {
		return {
			currentWorkspaceFolderPath: this.getWorkspaceFolderPath(targetPath),
			projectPathFromConfig: this.getProjectPathFromConfig(targetPath),
			useNearestConfig: this.useNearestConfig,
		};
	}

	private getConfigPath(
		targetPath: string,
		configKey: string,
		framework?: TestFrameworkName,
	): string {
		return resolveConfigPath(
			targetPath,
			configKey,
			this.getResolutionContext(targetPath),
			framework,
		);
	}

	public getJestConfigPath(targetPath: string): string {
		return this.getConfigPath(targetPath, 'jestrunner.configPath', 'jest');
	}

	public findConfigPath(
		targetPath?: string,
		targetConfigFilename?: string,
		framework?: TestFrameworkName,
	): string | undefined {
		return findConfigPath(
			targetPath,
			this.getResolutionContext(targetPath),
			targetConfigFilename,
			framework,
		);
	}

	public getVitestConfigPath(targetPath: string): string {
		return this.getConfigPath(
			targetPath,
			'jestrunner.vitestConfigPath',
			'vitest',
		);
	}

	public getRstestConfigPath(targetPath: string): string {
		return this.findConfigPath(targetPath, undefined, 'rstest') || '';
	}

	public get runOptions(): string[] | null {
		return Settings.getJestRunOptions();
	}

	public get debugOptions(): Partial<vscode.DebugConfiguration> {
		return Settings.getJestDebugOptions();
	}

	public get vitestDebugOptions(): Partial<vscode.DebugConfiguration> {
		return Settings.getVitestDebugOptions();
	}

	public get nodeTestDebugOptions(): Partial<vscode.DebugConfiguration> {
		return Settings.getNodeTestDebugOptions();
	}

	public get nodeTestRunOptions(): string[] | null {
		return Settings.getNodeTestRunOptions();
	}

	public get bunRunOptions(): string[] | null {
		return Settings.getBunRunOptions();
	}

	public get denoRunOptions(): string[] | null {
		return Settings.getDenoRunOptions();
	}

	public get bunDebugOptions(): Partial<vscode.DebugConfiguration> {
		return Settings.getBunDebugOptions();
	}

	public get denoDebugOptions(): Partial<vscode.DebugConfiguration> {
		return Settings.getDenoDebugOptions();
	}

	public get rstestRunOptions(): string[] | null {
		return Settings.getRstestRunOptions();
	}

	public get rstestDebugOptions(): Partial<vscode.DebugConfiguration> {
		return Settings.getRstestDebugOptions();
	}

	public get isCodeLensEnabled(): boolean {
		return Settings.isCodeLensEnabled();
	}

	public get codeLensOptions(): CodeLensOption[] {
		return Settings.getCodeLensOptions();
	}

	public getAllPotentialSourceFiles(): string {
		// Return a broad pattern to catch all potential test files
		// Actual filtering is done by isTestFile() which reads patterns
		// from framework configs (Jest testMatch / Vitest include)
		return '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}';
	}

	public buildJestArgs(
		filePath: string,
		testName: string | undefined,
		withQuotes: boolean,
		options: string[] = [],
	): string[] {
		const configPath = this.getJestConfigPath(filePath);
		return getFrameworkAdapter('jest').buildArgs(
			filePath,
			testName,
			withQuotes,
			options,
			configPath,
			this.runOptions,
		);
	}

	public buildVitestArgs(
		filePath: string,
		testName: string | undefined,
		withQuotes: boolean,
		options: string[] = [],
	): string[] {
		const configPath = this.getVitestConfigPath(filePath);
		const runOptions = Settings.getVitestRunOptions() ?? this.runOptions;

		return getFrameworkAdapter('vitest').buildArgs(
			filePath,
			testName,
			withQuotes,
			options,
			configPath,
			runOptions,
		);
	}

	public buildNodeTestArgs(
		filePath: string,
		testName: string | undefined,
		withQuotes: boolean,
		options: string[] = [],
	): string[] {
		return getFrameworkAdapter('node-test').buildArgs(
			filePath,
			testName,
			withQuotes,
			options,
			'',
			this.nodeTestRunOptions,
		);
	}

	public buildBunArgs(
		filePath: string,
		testName: string | undefined,
		withQuotes: boolean,
		options: string[] = [],
	): string[] {
		return getFrameworkAdapter('bun').buildArgs(
			filePath,
			testName,
			withQuotes,
			options,
			'',
			Settings.getBunRunOptions(),
		);
	}

	public buildDenoArgs(
		filePath: string,
		testName: string | undefined,
		withQuotes: boolean,
		options: string[] = [],
	): string[] {
		return getFrameworkAdapter('deno').buildArgs(
			filePath,
			testName,
			withQuotes,
			options,
			'',
			Settings.getDenoRunOptions(),
		);
	}

	public buildRstestArgs(
		filePath: string,
		testName: string | undefined,
		withQuotes: boolean,
		options: string[] = [],
	): string[] {
		const configPath = this.getRstestConfigPath(filePath);
		return getFrameworkAdapter('rstest').buildArgs(
			filePath,
			testName,
			withQuotes,
			options,
			configPath,
			Settings.getRstestRunOptions(),
		);
	}

	public getDebugConfiguration(
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		return getDebugConfiguration(this, filePath, testName);
	}
}
