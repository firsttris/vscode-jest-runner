import type * as vscode from 'vscode';
import * as Settings from '../config/Settings';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { appendUniqueArgs, UniqueArgument } from '../utils/ArgUtils';
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
		const debugArgs = new UniqueArgument();

		let program: string | undefined;
		let runtimeExecutable: string | undefined;
		let debugEnv: Record<string, string> | undefined = {};

		const customCommand = Settings.getRstestCommand();
		if (customCommand && typeof customCommand === 'string') {
			const { env, executable, args } = parseCommandAndEnv(customCommand);
			if (executable) {
				program = executable;
				debugArgs.append(...args);
				if (Object.keys(env).length > 0) {
					debugEnv = { ...debugEnv, ...env };
				}
			}
		}

		if (filePath) {
			debugArgs.append(...config.buildRstestArgs(filePath, testName, false));
		}

		const testArgs = filePath
			? config.buildRstestArgs(filePath, testName, false)
			: [];

		const binaryPath = resolveBinaryPath('@rstest/core', config.cwd, 'rstest');
		if (binaryPath) {
			program = binaryPath;
			debugArgs.append(...testArgs);
		} else {
			logWarning('Could not resolve rstest binary path, falling back to npx');
			runtimeExecutable = 'npx';
			debugArgs.append('--no-install', 'rstest', ...testArgs);
		}

		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Rstest Tests',
			request: 'launch',
			type: 'node',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.rstestDebugOptions,
			program,
			runtimeExecutable,
			args: debugArgs.toArray(),
			env: debugEnv,
		};

		return debugConfig;
	}

	private getVitestDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const debugArgs = new UniqueArgument();
		let program: string | undefined;
		let runtimeExecutable: string | undefined;
		let debugEnv: Record<string, string> | undefined = {};

		const customCommand = Settings.getVitestCommand();
		if (customCommand && typeof customCommand === 'string') {
			const { env, executable, args } = parseCommandAndEnv(customCommand);
			if (executable) {
				program = executable;
				debugArgs.append(...args);
				if (Object.keys(env).length > 0) {
					debugEnv = { ...debugEnv, ...env };
				}
			}
		}

		debugArgs.append('run');
		if (filePath) {
			debugArgs.append(config.buildVitestArgs(filePath, testName, false));
		}

		const binaryPath = resolveBinaryPath('vitest', config.cwd);
		if (binaryPath) {
			program = binaryPath;
		} else {
			logWarning('Could not resolve vitest binary path, falling back to npx');
			runtimeExecutable = 'npx';
			debugArgs.prepend(['--no-install', 'vitest']);
		}

		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Vitest Tests',
			request: 'launch',
			type: 'node',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.vitestDebugOptions,
			args: debugArgs.toArray(),
			program,
			runtimeExecutable,
			env: Object.values(debugEnv).length >= 1 ? debugEnv : undefined,
		};

		return debugConfig;
	}

	private getPlaywrightDebugConfig(
		config: TestRunnerConfig,
		filePath?: string,
		testName?: string,
	): vscode.DebugConfiguration {
		const debugArgs = new UniqueArgument();
		let program: string | undefined;
		let runtimeExecutable: string | undefined;
		let debugEnv: Record<string, string> | undefined = {};

		const customCommand = Settings.getPlaywrightCommand();
		if (customCommand) {
			const { env, executable, args } = parseCommandAndEnv(customCommand);
			if (executable) {
				program = executable;
				debugArgs.append(args);
				if (Object.keys(env).length > 0) {
					debugEnv = { ...debugEnv, ...env };
				}
			}
		}

		if (filePath) {
			debugArgs.append(config.buildPlaywrightArgs(filePath, testName, false));
		}

		const binaryPath = resolveBinaryPath(
			'@playwright/test',
			config.cwd,
			'playwright',
		);

		debugArgs.append('--workers=1');

		if (binaryPath) {
			program = binaryPath;
		} else {
			logWarning(
				'Could not resolve playwright binary path, falling back to npx',
			);
			runtimeExecutable = 'npx';
			debugArgs.prepend(['--no-install', 'playwright']);
		}

		const debugConfig: vscode.DebugConfiguration = {
			console: 'integratedTerminal',
			internalConsoleOptions: 'neverOpen',
			name: 'Debug Playwright Tests',
			request: 'launch',
			type: 'node',
			cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
			...config.playwrightDebugOptions,
			program,
			runtimeExecutable,
			args: debugArgs.toArray(),
			env: Object.values(debugEnv).length >= 1 ? debugEnv : undefined,
		};

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
