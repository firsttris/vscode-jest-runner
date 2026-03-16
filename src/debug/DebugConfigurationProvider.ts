import type * as vscode from 'vscode';
import * as Settings from '../config/Settings';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { mergeUniqueArgs } from '../utils/ArgUtils';
import { logWarning } from '../utils/Logger';
import { resolveBinaryPath } from '../utils/ResolverUtils';
import { parseCommandAndEnv } from '../utils/ShellUtils';
import { resolveTestNameStringInterpolation } from '../utils/TestNameUtils';

export class DebugConfigurationProvider {
	public getDebugConfiguration(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const framework = config.getTestFramework(filePath);

		if (framework === 'bun') {
			return this.getBunDebugConfig(config, filePath, testName);
		}

		if (framework === 'deno') {
			return this.getDenoDebugConfig(config, filePath, testName);
		}

		if (framework === 'node-test') {
			return this.getNodeTestDebugConfig(config, filePath, testName);
		}

		if (framework === 'rstest') {
			return this.getRstestDebugConfig(config, filePath, testName);
		}

		if (framework === 'vitest') {
			return this.getVitestDebugConfig(config, filePath, testName);
		}

		if (framework === 'playwright') {
			return this.getPlaywrightDebugConfig(config, filePath, testName);
		}

		return this.getJestDebugConfig(config, filePath, testName);
	}

	private getBunDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Bun Tests',
			request: 'launch',
			type: 'bun',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.bunDebugOptions,
			runtimeArgs: ['test', '--inspect-wait'],
		};

		if (testName) {
			const resolved = resolveTestNameStringInterpolation(testName);
			debugConfig.runtimeArgs.push('-t', resolved);
		}

		if (config.bunRunOptions) {
			debugConfig.runtimeArgs = mergeUniqueArgs(
				debugConfig.runtimeArgs,
				config.bunRunOptions,
			);
		}

		debugConfig.program = filePath;
		debugConfig.args = [];

		return debugConfig;
	}

	private getDenoDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const baseRuntimeArgs = ['test', '--inspect-brk', '--allow-all'];
		const withTestNameArgs = testName
			? [
					...baseRuntimeArgs,
					'--filter',
					resolveTestNameStringInterpolation(testName),
				]
			: baseRuntimeArgs;

		const runtimeArgs = mergeUniqueArgs(withTestNameArgs, config.denoRunOptions);

		if (filePath) {
			runtimeArgs.push(filePath);
		}

		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Deno Tests',
			request: 'launch',
			type: 'node',
			port: 9229,
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.denoDebugOptions,
			runtimeExecutable: 'deno',
			runtimeArgs,
			attachSimplePort: 9229,
			args: [],
		};

		return debugConfig;
	}

	private getNodeTestDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Node.js Tests',
			request: 'launch',
			type: 'node',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.nodeTestDebugOptions,
		};

		const customCommand = Settings.getNodeTestCommand();
		if (customCommand) {
			const { env, executable, args } = parseCommandAndEnv(customCommand);
			if (executable) {
				debugConfig.runtimeExecutable = executable;
				debugConfig.runtimeArgs = mergeUniqueArgs(args, ['--test']);
				if (Object.keys(env).length > 0) {
					debugConfig.env = { ...debugConfig.env, ...env };
				}
			}
		} else {
			debugConfig.runtimeArgs = ['--test'];
		}

		if (testName) {
			let resolvedTestName = testName;
			if (testName.includes('%')) {
				resolvedTestName = resolveTestNameStringInterpolation(testName);
			}
			debugConfig.runtimeArgs.push('--test-name-pattern', resolvedTestName);
		}

		if (config.nodeTestRunOptions) {
			debugConfig.runtimeArgs = mergeUniqueArgs(
				debugConfig.runtimeArgs,
				config.nodeTestRunOptions,
			);
		}

		debugConfig.program = filePath || '';
		debugConfig.args = [];

		return debugConfig;
	}

	private getRstestDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Rstest Tests',
			request: 'launch',
			type: 'node',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.rstestDebugOptions,
		};

		const customCommand = Settings.getRstestCommand();
		if (customCommand && typeof customCommand === 'string') {
			const { env, executable, args } = parseCommandAndEnv(customCommand);
			if (executable) {
				debugConfig.program = executable;
				debugConfig.args = [...args];
				if (Object.keys(env).length > 0) {
					debugConfig.env = { ...debugConfig.env, ...env };
				}
				if (filePath) {
					const testArgs = config.buildRstestArgs(filePath, testName, false);
					debugConfig.args = mergeUniqueArgs(debugConfig.args, testArgs);
				}
				return debugConfig;
			}
		}

		const testArgs = filePath
			? config.buildRstestArgs(filePath, testName, false)
			: [];
		const binaryPath = resolveBinaryPath('@rstest/core', config.cwd, 'rstest');

		if (binaryPath) {
			debugConfig.program = binaryPath;
			debugConfig.args = [...testArgs];
		} else {
			logWarning('Could not resolve rstest binary path, falling back to npx');
			debugConfig.runtimeExecutable = 'npx';
			debugConfig.args = ['--no-install', 'rstest', ...testArgs];
		}

		return debugConfig;
	}

	private getVitestDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Vitest Tests',
			request: 'launch',
			type: 'node',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.vitestDebugOptions,
		};

		const customCommand = Settings.getVitestCommand();
		if (customCommand && typeof customCommand === 'string') {
			const { env, executable, args } = parseCommandAndEnv(customCommand);
			if (executable) {
				debugConfig.program = executable;
				debugConfig.args = [...args];
				if (Object.keys(env).length > 0) {
					debugConfig.env = { ...debugConfig.env, ...env };
				}
				if (filePath) {
					const testArgs = config.buildVitestArgs(filePath, testName, false);
					debugConfig.args = mergeUniqueArgs(debugConfig.args, testArgs);
				}
				return debugConfig;
			}
		}

		const testArgs = filePath
			? config.buildVitestArgs(filePath, testName, false)
			: [];
		const vitestArgs = mergeUniqueArgs(testArgs, ['run'], 'prepend');
		const binaryPath = resolveBinaryPath('vitest', config.cwd);

		if (binaryPath) {
			debugConfig.program = binaryPath;
			debugConfig.args = [...vitestArgs];
		} else {
			logWarning('Could not resolve vitest binary path, falling back to npx');
			debugConfig.runtimeExecutable = 'npx';
			debugConfig.args = ['--no-install', 'vitest', ...vitestArgs];
		}

		return debugConfig;
	}

	private getPlaywrightDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Playwright Tests',
			request: 'launch',
			type: 'node',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.playwrightDebugOptions,
		};

		const customCommand = Settings.getPlaywrightCommand();
		if (customCommand) {
			const { env, executable, args } = parseCommandAndEnv(customCommand);
			if (executable) {
				debugConfig.program = executable;
				debugConfig.args = [...args];
				if (Object.keys(env).length > 0) {
					debugConfig.env = { ...debugConfig.env, ...env };
				}
				if (filePath) {
					const testArgs = config.buildPlaywrightArgs(
						filePath,
						testName,
						false,
					);
					debugConfig.args = mergeUniqueArgs(debugConfig.args, testArgs);
				}
				return debugConfig;
			}
		}

		const testArgs = filePath
			? config.buildPlaywrightArgs(filePath, testName, false)
			: [];
		const binaryPath = resolveBinaryPath(
			'@playwright/test',
			config.cwd,
			'playwright',
		);

		if (binaryPath) {
			debugConfig.program = binaryPath;
			debugConfig.args = [...testArgs, '--workers=1'];
		} else {
			logWarning(
				'Could not resolve playwright binary path, falling back to npx',
			);
			debugConfig.runtimeExecutable = 'npx';
			debugConfig.args = [
				'--no-install',
				'playwright',
				...testArgs,
				'--workers=1',
			];
		}

		return debugConfig;
	}

	private getJestDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Jest Tests',
			request: 'launch',
			type: 'node',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.debugOptions,
		};

		if (config.enableESM) {
			debugConfig.env = {
				...debugConfig.env,
				NODE_OPTIONS: '--experimental-vm-modules',
			};
		}

		const customCommand = Settings.getJestCommand();
		if (customCommand && typeof customCommand === 'string') {
			const { env, executable, args } = parseCommandAndEnv(customCommand);
			if (executable) {
				debugConfig.program = executable;
				debugConfig.args = [...args];
				if (Object.keys(env).length > 0) {
					debugConfig.env = { ...debugConfig.env, ...env };
				}
				if (filePath) {
					const testArgs = config.buildJestArgs(filePath, testName, false);
					debugConfig.args = mergeUniqueArgs(debugConfig.args, testArgs);
				}
				return debugConfig;
			}
		}

		const testArgs = filePath
			? config.buildJestArgs(filePath, testName, false)
			: [];
		const binaryPath = resolveBinaryPath('jest', config.cwd);
		const jestArgs = mergeUniqueArgs(testArgs, ['--runInBand'], 'prepend');

		if (binaryPath) {
			debugConfig.program = binaryPath;
			debugConfig.args = [...jestArgs];
		} else {
			logWarning('Could not resolve jest binary path, falling back to npx');
			debugConfig.runtimeExecutable = 'npx';
			debugConfig.args = ['--no-install', 'jest', ...jestArgs];
		}

		return debugConfig;
	}
}
