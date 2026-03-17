import type * as vscode from 'vscode';
import * as Settings from '../config/Settings';
import type { TestRunnerConfig } from '../testRunnerConfig';
import {
	appendUniqueArgs,
	prependUniqueArgs,
	UniqueArgument,
} from '../utils/ArgUtils';
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
		const runtimeArgs = new UniqueArgument('test', '--inspect-wait');

		if (testName) {
			const resolved = resolveTestNameStringInterpolation(testName);
			runtimeArgs.append('-t', resolved);
		}

		if (config.bunRunOptions) {
			runtimeArgs.append(config.bunRunOptions);
		}

		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Bun Tests',
			request: 'launch',
			type: 'bun',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.bunDebugOptions,
			args: [],
			program: filePath,
			runtimeArgs: runtimeArgs.toArray(),
		};

		return debugConfig;
	}

	private getDenoDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const runtimeArgs = new UniqueArgument(
			'test',
			'--inspect-brk',
			'--allow-all',
		);

		if (testName) {
			const resolved = resolveTestNameStringInterpolation(testName);
			runtimeArgs.append('--filter', resolved);
		}

		if (config.denoRunOptions) {
			runtimeArgs.append(config.denoRunOptions);
		}

		if (filePath) {
			runtimeArgs.append(filePath);
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
			runtimeArgs: runtimeArgs.toArray(),
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
		const runtimeArgs = new UniqueArgument();

		let runtimeExecutable: string | undefined;
		let debugConfigEnv: Record<string, string> | undefined = {};

		const customCommand = Settings.getNodeTestCommand();
		if (customCommand) {
			const { env, executable, args } = parseCommandAndEnv(customCommand);
			if (executable) {
				runtimeArgs.append('--test');
				runtimeArgs.append(args);

				runtimeExecutable = executable;
				if (Object.keys(env).length > 0) {
					debugConfigEnv = { ...debugConfigEnv, ...env };
				}
			}
		} else {
			runtimeArgs.append('--test');
		}

		if (testName) {
			let resolvedTestName = testName;
			if (testName.includes('%')) {
				resolvedTestName = resolveTestNameStringInterpolation(testName);
			}
			runtimeArgs.append('--test-name-pattern', resolvedTestName);
		}

		if (config.nodeTestRunOptions) {
			runtimeArgs.append(config.nodeTestRunOptions);
		}

		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Node.js Tests',
			request: 'launch',
			type: 'node',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.nodeTestDebugOptions,
			args: [],
			program: filePath || '',
			runtimeArgs: runtimeArgs.toArray(),
			runtimeExecutable,
			env: debugConfigEnv,
		};

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
					debugConfig.args = appendUniqueArgs(debugConfig.args, testArgs);
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
					debugConfig.args = appendUniqueArgs(debugConfig.args, testArgs);
				}
				return debugConfig;
			}
		}

		const testArgs = new UniqueArgument();

		if (filePath) {
			testArgs.append(config.buildVitestArgs(filePath, testName, false));
		}

		testArgs.prepend('run');

		const binaryPath = resolveBinaryPath('vitest', config.cwd);

		if (binaryPath) {
			debugConfig.program = binaryPath;
			debugConfig.args = testArgs.toArray();
		} else {
			logWarning('Could not resolve vitest binary path, falling back to npx');
			debugConfig.runtimeExecutable = 'npx';
			debugConfig.args = ['--no-install', 'vitest', ...testArgs.toArray()];
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
					debugConfig.args = appendUniqueArgs(debugConfig.args, testArgs);
				}
				return debugConfig;
			}
		}

		const testArgs = new UniqueArgument();
		if (filePath) {
			testArgs.append(config.buildPlaywrightArgs(filePath, testName, false));
		}

		const binaryPath = resolveBinaryPath(
			'@playwright/test',
			config.cwd,
			'playwright',
		);

		testArgs.append('--workers=1');

		if (binaryPath) {
			debugConfig.program = binaryPath;
			debugConfig.args = testArgs.toArray();
		} else {
			logWarning(
				'Could not resolve playwright binary path, falling back to npx',
			);
			debugConfig.runtimeExecutable = 'npx';
			testArgs.prepend(['--no-install', 'playwright']);
			debugConfig.args = testArgs.toArray();
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
					debugConfig.args = appendUniqueArgs(debugConfig.args, testArgs);
				}
				return debugConfig;
			}
		}

		const testArgs = new UniqueArgument();
		if (filePath) {
			testArgs.append(config.buildJestArgs(filePath, testName, false));
		}

		const binaryPath = resolveBinaryPath('jest', config.cwd);

		testArgs.prepend('--runInBand');

		if (binaryPath) {
			debugConfig.program = binaryPath;
			debugConfig.args = testArgs.toArray();
		} else {
			logWarning('Could not resolve jest binary path, falling back to npx');
			debugConfig.runtimeExecutable = 'npx';
			testArgs.prepend(['--no-install', 'jest']);
			debugConfig.args = testArgs.toArray();
		}

		return debugConfig;
	}
}
