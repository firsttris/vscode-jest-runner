import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import {
	type CoverageProvider,
	DetailedFileCoverage,
} from '../coverageProvider';
import {
	buildTestArgs,
	buildTestArgsFast,
	canUseFastMode,
} from '../execution/TestArgumentBuilder';
import { collectTestsByFile } from '../execution/TestCollector';
import {
	executeTestCommand,
	executeTestCommandFast,
	logTestExecution,
} from '../execution/TestProcessRunner';
import type { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import { getTestFrameworkForFile } from '../testDetection/testFileDetection';
import { processTestResults } from '../testResultProcessor';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { logError, logInfo } from '../utils/Logger';
import { isWindows, normalizePath } from '../utils/PathUtils';
import { quote, toTestItemNamePattern } from '../utils/TestNameUtils';

/** Files that can run in one process: same framework, directory and config. */
interface RunContext {
	allFiles: string[];
	allTests: vscode.TestItem[];
	testsByFile: Map<string, vscode.TestItem[]>;
	framework: TestFrameworkName;
	workspaceFolder: string;
	cwd: string;
	/** Config passed to the runner; empty for frameworks that take none. */
	configPath: string;
}

export class TestRunExecutor {
	private static readonly WINDOWS_SAFE_COMMAND_LENGTH = 30000;

	constructor(
		private readonly testController: vscode.TestController,
		private readonly testRunnerConfig: TestRunnerConfig,
		private readonly coverageProvider: CoverageProvider,
	) {}

	public async runHandler(
		request: vscode.TestRunRequest,
		token: vscode.CancellationToken,
		additionalArgs: string[] = [],
	): Promise<void> {
		return this.executeTests(request, token, additionalArgs, false);
	}

	public async coverageHandler(
		request: vscode.TestRunRequest,
		token: vscode.CancellationToken,
	): Promise<void> {
		return this.executeTests(request, token, [], true);
	}

	public async loadDetailedCoverage(
		_testRun: vscode.TestRun,
		fileCoverage: vscode.FileCoverage,
		token: vscode.CancellationToken,
	): Promise<vscode.FileCoverageDetail[]> {
		if (fileCoverage instanceof DetailedFileCoverage) {
			return this.coverageProvider.loadDetailedCoverage(fileCoverage, token);
		}
		return [];
	}

	private async executeTests(
		request: vscode.TestRunRequest,
		token: vscode.CancellationToken,
		additionalArgs: string[] = [],
		collectCoverage = false,
	): Promise<void> {
		const run = this.testController.createTestRun(request);
		const testsByFile = collectTestsByFile(request, this.testController);

		for (const test of Array.from(testsByFile.values()).flat()) {
			run.started(test);
		}

		if (token.isCancellationRequested) {
			run.end();
			return;
		}

		try {
			for (const context of this.createRunContexts(testsByFile, run)) {
				if (token.isCancellationRequested) {
					for (const test of context.allTests) {
						run.skipped(test);
					}
					continue;
				}

				try {
					await this.runContext(
						context,
						additionalArgs,
						collectCoverage,
						token,
						run,
					);
				} catch (error) {
					this.handleError(error, context.testsByFile, run);
				}
			}
		} catch (error) {
			this.handleError(error, testsByFile, run);
		} finally {
			run.end();
		}
	}

	private async runContext(
		context: RunContext,
		additionalArgs: string[],
		collectCoverage: boolean,
		token: vscode.CancellationToken,
		run: vscode.TestRun,
	): Promise<void> {
		const { allFiles, allTests, framework, testsByFile, cwd } = context;

		this.cleanupBunCoverage(framework, collectCoverage, cwd);

		if (this.shouldRunFastMode(testsByFile, collectCoverage, additionalArgs)) {
			await this.runFastMode(
				allFiles[0],
				allTests[0],
				framework,
				cwd,
				token,
				run,
			);
		} else {
			await this.runStandardMode(
				context,
				additionalArgs,
				collectCoverage,
				token,
				run,
			);
		}
	}

	/**
	 * Splits the requested files into groups that can share one process.
	 * A request may span frameworks (e.g. Vitest and Playwright), workspace
	 * folders or packages of a monorepo, and each needs its own command,
	 * working directory and config.
	 */
	private createRunContexts(
		testsByFile: Map<string, vscode.TestItem[]>,
		run: vscode.TestRun,
	): RunContext[] {
		const contexts = new Map<string, RunContext>();

		for (const [file, tests] of testsByFile) {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(
				vscode.Uri.file(file),
			)?.uri.fsPath;

			if (!workspaceFolder) {
				for (const test of tests) {
					run.failed(
						test,
						new vscode.TestMessage('Could not determine workspace folder'),
					);
				}
				continue;
			}

			const framework = getTestFrameworkForFile(file) || 'jest';
			const cwd = this.testRunnerConfig.getTestRunCwd(file);
			const configPath = this.resolveGroupingConfigPath(framework, file);
			const key = [framework, workspaceFolder, cwd, configPath].join('\0');

			let context = contexts.get(key);
			if (!context) {
				context = {
					allFiles: [],
					allTests: [],
					testsByFile: new Map(),
					framework,
					workspaceFolder,
					cwd,
					configPath,
				};
				contexts.set(key, context);
			}

			context.allFiles.push(file);
			context.allTests.push(...tests);
			context.testsByFile.set(file, tests);
		}

		return Array.from(contexts.values());
	}

	/** Config file passed to the runner, for frameworks that take one. */
	private resolveGroupingConfigPath(
		framework: TestFrameworkName,
		file: string,
	): string {
		switch (framework) {
			case 'jest':
			case 'vitest':
			case 'rstest':
				return this.resolveCoverageConfigPath(framework, file);
			default:
				return '';
		}
	}

	private cleanupBunCoverage(
		framework: TestFrameworkName,
		collectCoverage: boolean,
		cwd: string,
	): void {
		if (framework !== 'bun' || !collectCoverage) {
			return;
		}

		try {
			const coveragePath = join(cwd, 'coverage', 'lcov.info');
			if (fs.existsSync(coveragePath)) {
				fs.unlinkSync(coveragePath);
			}
		} catch (_e) {
			// Ignore errors during cleanup
		}
	}

	private shouldRunFastMode(
		testsByFile: Map<string, vscode.TestItem[]>,
		collectCoverage: boolean,
		additionalArgs: string[],
	): boolean {
		return (
			canUseFastMode(testsByFile, collectCoverage) &&
			additionalArgs.length === 0
		);
	}

	private async runFastMode(
		file: string,
		test: vscode.TestItem,
		framework: TestFrameworkName,
		cwd: string,
		token: vscode.CancellationToken,
		run: vscode.TestRun,
	): Promise<void> {
		const testCommand = this.testRunnerConfig.getTestCommand(file);

		const testName = toTestItemNamePattern(test);
		const args = buildTestArgsFast(
			file,
			testName,
			framework,
			this.testRunnerConfig,
		);
		const commandArgs = args;
		const esmEnv = this.getEsmEnv(file, framework);

		logInfo(`Running fast mode: ${testCommand} ${commandArgs.join(' ')}`);

		await executeTestCommandFast(
			testCommand,
			commandArgs,
			token,
			test,
			run,
			cwd,
			esmEnv,
		);
	}

	private async runStandardMode(
		context: RunContext,
		additionalArgs: string[],
		collectCoverage: boolean,
		token: vscode.CancellationToken,
		run: vscode.TestRun,
	): Promise<void> {
		const { allFiles, allTests, testsByFile, framework, workspaceFolder, cwd } =
			context;
		const sessionId = randomUUID();

		const testCommand = this.testRunnerConfig.getTestCommand(allFiles[0]);

		const args = buildTestArgs(
			allFiles,
			testsByFile,
			framework,
			additionalArgs,
			collectCoverage,
			this.testRunnerConfig,
			this.testController,
		);

		const commandArgs = this.adjustArgsForWindowsLengthLimit(
			testCommand,
			framework,
			allFiles,
			args,
		);
		const esmEnv = this.getEsmEnv(allFiles[0], framework);

		logTestExecution(
			framework,
			testCommand,
			commandArgs,
			allTests.length,
			allFiles.length,
			!!esmEnv,
		);

		const result = await executeTestCommand(
			testCommand,
			commandArgs,
			token,
			allTests,
			run,
			cwd,
			{ ...(esmEnv ?? {}), JSTR_SESSION_ID: sessionId },
			sessionId,
		);

		if (result === null) {
			return;
		}

		try {
			if (!result.structuredResultsProcessed) {
				this.handleBunReport(framework, result, cwd);
				this.handleDenoReport(framework, result, cwd);
				processTestResults(result.output, allTests, run, framework, sessionId);
			}
		} finally {
			// Always process coverage, even if test result processing fails
			if (framework === 'deno' && collectCoverage) {
				await this.handleDenoCoverage(workspaceFolder, cwd);
			}

			if (collectCoverage) {
				// Jest, Vitest and Rstest already resolved it for grouping.
				const configPath =
					context.configPath ||
					this.resolveCoverageConfigPath(framework, allFiles[0]);

				await this.processCoverageData(
					run,
					workspaceFolder,
					framework,
					configPath,
					allFiles.length > 0 ? allFiles[0] : undefined,
				);
			}
		}
	}

	private adjustArgsForWindowsLengthLimit(
		testCommand: string,
		framework: TestFrameworkName,
		allFiles: string[],
		args: string[],
	): string[] {
		if (!isWindows()) {
			return args;
		}

		const commandLength = `${testCommand} ${args.join(' ')}`.length;
		if (commandLength <= TestRunExecutor.WINDOWS_SAFE_COMMAND_LENGTH) {
			return args;
		}

		let fallbackArgs = args;

		if (framework === 'jest') {
			const fileSet = new Set(allFiles.map(normalizePath));
			fallbackArgs = args.filter((arg) => !fileSet.has(arg));
		}

		if (framework === 'vitest') {
			fallbackArgs = this.removeVitestExplicitFileArgs(args);
		}

		const fallbackLength = `${testCommand} ${fallbackArgs.join(' ')}`.length;

		if (fallbackArgs !== args && fallbackLength < commandLength) {
			logInfo(
				`Windows command length fallback activated for ${framework}: ${commandLength} -> ${fallbackLength}`,
			);
			return fallbackArgs;
		}

		return args;
	}

	private resolveCoverageConfigPath(
		framework: TestFrameworkName,
		targetFile: string,
	): string {
		if (framework === 'vitest') {
			return this.testRunnerConfig.getVitestConfigPath(targetFile);
		}

		if (framework === 'rstest') {
			return this.testRunnerConfig.getRstestConfigPath(targetFile);
		}

		return this.testRunnerConfig.getJestConfigPath(targetFile);
	}

	private removeVitestExplicitFileArgs(args: string[]): string[] {
		if (args.length === 0 || args[0] !== 'run') {
			return args;
		}

		const nextOptionIndex = args.findIndex((arg, index) => {
			if (index <= 0) {
				return false;
			}
			return arg.startsWith('-');
		});

		if (nextOptionIndex <= 0) {
			return args;
		}

		return ['run', ...args.slice(nextOptionIndex)];
	}

	private getEsmEnv(
		file: string,
		framework: TestFrameworkName,
	): Record<string, string> | undefined {
		const isVitest = framework === 'vitest';
		const isNodeTest = framework === 'node-test';
		return isVitest || isNodeTest
			? undefined
			: this.testRunnerConfig.getEnvironmentForRun(file);
	}

	private handleBunReport(
		framework: TestFrameworkName,
		result: { output: string },
		cwd: string,
	): void {
		if (framework !== 'bun') {
			return;
		}

		const bunReportPath = join(cwd, '.bun-report.xml');
		try {
			if (fs.existsSync(bunReportPath)) {
				const reportContent = fs.readFileSync(bunReportPath, 'utf8');
				result.output += `\n${reportContent}`;
				try {
					fs.unlinkSync(bunReportPath);
				} catch (e) {
					logError('Failed to delete Bun report file', e);
				}
			}
		} catch (e) {
			logError('Failed to read Bun report file', e);
		}
	}

	private handleDenoReport(
		framework: TestFrameworkName,
		result: { output: string },
		cwd: string,
	): void {
		if (framework !== 'deno') {
			return;
		}

		const denoReportPath = join(cwd, '.deno-report.xml');
		try {
			if (fs.existsSync(denoReportPath)) {
				const reportContent = fs.readFileSync(denoReportPath, 'utf8');
				result.output += `\n${reportContent}`;
				try {
					fs.unlinkSync(denoReportPath);
				} catch (e) {
					logError('Failed to delete Deno report file', e);
				}
			}
		} catch (e) {
			logError('Failed to read Deno report file', e);
		}
	}

	private async handleDenoCoverage(
		workspaceFolder: string,
		cwd: string,
	): Promise<void> {
		try {
			const coverageCommand = `deno coverage coverage --lcov > ${quote(join(workspaceFolder, 'lcov.info'))}`;
			await new Promise<void>((resolve, reject) => {
				const cp = spawn(coverageCommand, {
					shell: true,
					cwd,
				});
				cp.on('close', (code) => {
					if (code === 0) resolve();
					else
						reject(
							new Error(`Deno coverage conversion failed with code ${code}`),
						);
				});
				cp.on('error', reject);
			});
		} catch (e) {
			logError('Failed to convert Deno coverage', e);
		}
	}

	private handleError(
		error: unknown,
		testsByFile: Map<string, vscode.TestItem[]>,
		run: vscode.TestRun,
	): void {
		const errOutput =
			error instanceof Error
				? error.message
				: error
					? String(error)
					: 'Test execution failed';

		for (const test of Array.from(testsByFile.values()).flat()) {
			run.failed(test, new vscode.TestMessage(errOutput));
		}
	}

	private async processCoverageData(
		run: vscode.TestRun,
		workspaceFolder: string,
		framework: TestFrameworkName = 'jest',
		configPath?: string,
		testFilePath?: string,
	): Promise<void> {
		try {
			const coverageMap = await this.coverageProvider.readCoverageFromFile(
				workspaceFolder,
				framework,
				configPath,
				testFilePath,
			);

			if (!coverageMap) {
				logInfo(
					`No coverage data found. Make sure coverageReporters includes "json" in your ${framework} config.`,
				);
				return;
			}

			const fileCoverages =
				this.coverageProvider.convertToVSCodeCoverage(coverageMap);

			logInfo(`Adding coverage for ${fileCoverages.length} files`);

			for (const fileCoverage of fileCoverages) {
				run.addCoverage(fileCoverage);
			}
		} catch (error) {
			logError('Failed to process coverage data', error);
		}
	}
}
