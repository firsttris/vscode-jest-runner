import type * as vscode from 'vscode';
import * as Settings from '../config/Settings';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { appendUniqueArgs, prependUniqueArgs } from '../utils/ArgUtils';
import { logWarning } from '../utils/Logger';
import { resolveBinaryPath } from '../utils/ResolverUtils';
import { parseCommandAndEnv } from '../utils/ShellUtils';
import { resolveTestNameStringInterpolation } from '../utils/TestNameUtils';

export const getDebugConfiguration = (
	config: TestRunnerConfig,
	filePath?: string,
	testName?: string,
): vscode.DebugConfiguration => {
	const framework = config.getTestFramework(filePath);

	if (framework === 'bun') {
		return getBunDebugConfig(config, filePath, testName);
	}

	if (framework === 'deno') {
		return getDenoDebugConfig(config, filePath, testName);
	}

	if (framework === 'node-test') {
		return getNodeTestDebugConfig(config, filePath, testName);
	}

	if (framework === 'rstest') {
		return getRstestDebugConfig(config, filePath, testName);
	}

	if (framework === 'vitest') {
		return getVitestDebugConfig(config, filePath, testName);
	}

	if (framework === 'playwright') {
		return getPlaywrightDebugConfig(config, filePath, testName);
	}

	return getJestDebugConfig(config, filePath, testName);
};

const getBunDebugConfig = (
	config: TestRunnerConfig,
	filePath?: string,
	testName?: string,
): vscode.DebugConfiguration => {
	const withTestName = testName
		? [
				'test',
				'--inspect-wait',
				'-t',
				resolveTestNameStringInterpolation(testName),
			]
		: ['test', '--inspect-wait'];
	const runtimeArgs = appendUniqueArgs(withTestName, config.bunRunOptions);

	const debugConfig: vscode.DebugConfiguration = {
		...createDebugConfigBase(
			config,
			'Debug Bun Tests',
			'bun',
			config.bunDebugOptions,
		),
		args: [],
		program: filePath,
		runtimeArgs,
	};

	return debugConfig;
};

const getDenoDebugConfig = (
	config: TestRunnerConfig,
	filePath?: string,
	testName?: string,
): vscode.DebugConfiguration => {
	const withTestName = testName
		? [
				'test',
				'--inspect-brk',
				'--allow-all',
				'--filter',
				resolveTestNameStringInterpolation(testName),
			]
		: ['test', '--inspect-brk', '--allow-all'];
	const withRunOptions = appendUniqueArgs(withTestName, config.denoRunOptions);
	const runtimeArgs = filePath ? [...withRunOptions, filePath] : withRunOptions;

	const debugConfig: vscode.DebugConfiguration = {
		...createDebugConfigBase(
			config,
			'Debug Deno Tests',
			'node',
			config.denoDebugOptions,
		),
		port: 9229,
		runtimeExecutable: 'deno',
		runtimeArgs,
		attachSimplePort: 9229,
		args: [],
	};

	return debugConfig;
};

const getNodeTestDebugConfig = (
	config: TestRunnerConfig,
	filePath?: string,
	testName?: string,
): vscode.DebugConfiguration => {
	const customCommand = Settings.getNodeTestCommand();
	const runtimeState = getRuntimeCommandState(customCommand);
	const baseRuntimeArgs = runtimeState.runtimeExecutable
		? appendUniqueArgs(runtimeState.args, ['--test'])
		: customCommand
			? []
			: ['--test'];
	const resolvedTestName = testName
		? testName.includes('%')
			? resolveTestNameStringInterpolation(testName)
			: testName
		: undefined;
	const runtimeArgsWithTestName = resolvedTestName
		? [...baseRuntimeArgs, '--test-name-pattern', resolvedTestName]
		: baseRuntimeArgs;
	const runtimeArgs = appendUniqueArgs(
		runtimeArgsWithTestName,
		config.nodeTestRunOptions,
	);
	const debugEnv = mergeEnv(runtimeState.env, config.nodeTestDebugOptions.env);

	return {
		...createDebugConfigBase(
			config,
			'Debug Node.js Tests',
			'node',
			config.nodeTestDebugOptions,
		),
		args: [],
		program: filePath || '',
		runtimeArgs,
		runtimeExecutable: runtimeState.runtimeExecutable,
		env: debugEnv,
	};
};

const getRstestDebugConfig = (
	config: TestRunnerConfig,
	filePath?: string,
	testName?: string,
): vscode.DebugConfiguration => {
	const commandState = getProgramCommandState(Settings.getRstestCommand());
	const debugArgsWithFile = withFileArgs(
		commandState.args,
		filePath,
		(path) => config.buildRstestArgs(path, testName, false),
	);
	const executableState = resolveProgramOrNpx(
		commandState.program,
		resolveBinaryPath('@rstest/core', config.cwd, 'rstest'),
		'rstest',
		debugArgsWithFile,
		'Could not resolve rstest binary path, falling back to npx',
	);
	const debugEnv = mergeEnv(commandState.env, config.rstestDebugOptions.env);

	return {
		...createDebugConfigBase(
			config,
			'Debug Rstest Tests',
			'node',
			config.rstestDebugOptions,
		),
		...executableState,
		env: debugEnv,
	};
};

const getVitestDebugConfig = (
	config: TestRunnerConfig,
	filePath?: string,
	testName?: string,
): vscode.DebugConfiguration => {
	const commandState = getProgramCommandState(Settings.getVitestCommand());
	const debugArgsWithFile = withFileArgs(
		commandState.args,
		filePath,
		(path) => config.buildVitestArgs(path, testName, false),
	);
	const executableState = resolveProgramOrNpx(
		commandState.program,
		resolveBinaryPath('vitest', config.cwd),
		'vitest',
		debugArgsWithFile,
		'Could not resolve vitest binary path, falling back to npx',
	);
	const mergedEnv = mergeEnv(commandState.env, config.vitestDebugOptions.env);

	return {
		...createDebugConfigBase(
			config,
			'Debug Vitest Tests',
			'node',
			config.vitestDebugOptions,
		),
		...executableState,
		env: optionalEnv(mergedEnv),
	};
};

const getPlaywrightDebugConfig = (
	config: TestRunnerConfig,
	filePath?: string,
	testName?: string,
): vscode.DebugConfiguration => {
	const commandState = getProgramCommandState(Settings.getPlaywrightCommand());
	const debugArgsWithFile = withFileArgs(
		commandState.args,
		filePath,
		(path) => config.buildPlaywrightArgs(path, testName, false),
	);
	const debugArgs = appendUniqueArgs(debugArgsWithFile, ['--workers=1']);
	const executableState = resolveProgramOrNpx(
		commandState.program,
		resolveBinaryPath('@playwright/test', config.cwd, 'playwright'),
		'playwright',
		debugArgs,
		'Could not resolve playwright binary path, falling back to npx',
	);
	const debugEnv = mergeEnv(
		commandState.env,
		config.playwrightDebugOptions.env,
	);

	return {
		...createDebugConfigBase(
			config,
			'Debug Playwright Tests',
			'node',
			config.playwrightDebugOptions,
		),
		...executableState,
		env: debugEnv,
	};
};

const getJestDebugConfig = (
	config: TestRunnerConfig,
	filePath?: string,
	testName?: string,
): vscode.DebugConfiguration => {
	const baseDebugEnv: Record<string, string> = config.enableESM
		? { NODE_OPTIONS: '--experimental-vm-modules' }
		: {};
	const commandState = getProgramCommandState(Settings.getJestCommand());
	const debugArgsWithFile = withFileArgs(
		commandState.args,
		filePath,
		(path) => config.buildJestArgs(path, testName, false),
	);
	const executableState = commandState.program
		? resolveCommandExecution(commandState.program, debugArgsWithFile)
		: resolveProgramOrNpx(
				undefined,
				resolveBinaryPath('jest', config.cwd),
				'jest',
				prependUniqueArgs(debugArgsWithFile, ['--runInBand']),
				'Could not resolve jest binary path, falling back to npx',
			);
	const debugEnv = mergeEnv(
		baseDebugEnv,
		commandState.env,
		config.debugOptions.env,
	);

	return {
		...createDebugConfigBase(
			config,
			'Debug Jest Tests',
			'node',
			config.debugOptions,
		),
		...executableState,
		env: optionalEnv(debugEnv),
	};
};

const createDebugConfigBase = (
	config: TestRunnerConfig,
	name: string,
	type: string,
	options: Partial<vscode.DebugConfiguration>,
): vscode.DebugConfiguration => ({
	console: 'integratedTerminal',
	internalConsoleOptions: 'neverOpen',
	name,
	request: 'launch',
	type,
	cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
	...options,
});

const withFileArgs = (
	baseArgs: string[],
	filePath: string | undefined,
	buildArgs: (filePath: string) => string[],
): string[] => (filePath ? appendUniqueArgs(baseArgs, buildArgs(filePath)) : baseArgs);

const getProgramCommandState = (command?: string): {
	program: string | undefined;
	args: string[];
	env: Record<string, string>;
} => {
	if (!command) {
		return { program: undefined, args: [], env: {} };
	}

	const { env, executable, args } = parseCommandAndEnv(command);
	if (!executable) {
		return { program: undefined, args: [], env: {} };
	}

	return {
		program: executable,
		args,
		env: Object.keys(env).length > 0 ? env : {},
	};
};

const getRuntimeCommandState = (command?: string): {
	runtimeExecutable: string | undefined;
	args: string[];
	env: Record<string, string>;
} => {
	if (!command) {
		return { runtimeExecutable: undefined, args: [], env: {} };
	}

	const { env, executable, args } = parseCommandAndEnv(command);
	if (!executable) {
		return { runtimeExecutable: undefined, args: [], env: {} };
	}

	return {
		runtimeExecutable: executable,
		args,
		env: Object.keys(env).length > 0 ? env : {},
	};
};

const resolveProgramOrNpx = (
	preferredProgram: string | undefined,
	resolvedProgram: string | undefined,
	npxCommand: string,
	args: string[],
	warning: string,
): {
	program: string | undefined;
	runtimeExecutable: string | undefined;
	runtimeArgs?: string[];
	args: string[];
} => {
	if (preferredProgram) {
		return resolveCommandExecution(preferredProgram, args);
	}

	if (resolvedProgram) {
		return {
			program: resolvedProgram,
			runtimeExecutable: undefined,
			args,
		};
	}

	logWarning(warning);
	return {
		program: undefined,
		runtimeExecutable: 'npx',
		args: prependUniqueArgs(args, ['--no-install', npxCommand]),
	};
};

const resolveCommandExecution = (
	executable: string,
	args: string[],
): {
	program: string | undefined;
	runtimeExecutable: string | undefined;
	runtimeArgs?: string[];
	args: string[];
} => {
	if (isNodeRuntimeExecutable(executable)) {
		return {
			program: executable,
			runtimeExecutable: undefined,
			args,
		};
	}

	return {
		program: undefined,
		runtimeExecutable: executable,
		runtimeArgs: args,
		args: [],
	};
};

const isNodeRuntimeExecutable = (executable: string): boolean => {
	const fileName = executable.split(/[/\\]/).pop() ?? executable;
	const normalized = fileName.replace(/\.(cmd|exe)$/i, '').toLowerCase();
	return normalized === 'node' || normalized === 'iojs';
};

const mergeEnv = (
	...envs: (Record<string, string> | undefined)[]
): Record<string, string> => {
	const merged: Record<string, string> = {};

	for (const env of envs) {
		if (!env) {
			continue;
		}

		for (const [key, value] of Object.entries(env)) {
			merged[key] = value;
		}
	}

	return merged;
};

const optionalEnv = (
	env: Record<string, string>,
): Record<string, string> | undefined =>
	Object.keys(env).length > 0 ? env : undefined;
