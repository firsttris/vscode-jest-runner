import { type ChildProcess, spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { extractStructuredMessages } from '../reporting/structuredOutput';
import { processTestResultsFromParsed } from '../testResultProcessor';
import type { JestResults } from '../testResultTypes';
import { logDebug, logInfo } from '../utils/Logger';
import { isWindows } from '../utils/PathUtils';
import {
	needsWindowsShell,
	normalizeArgsForNonShellSpawn,
	parseCommandAndEnv,
	quoteForCmd,
	stripAnsi,
} from '../utils/ShellUtils';

interface ResolvedSpawnCommand {
	command: string;
	args: string[];
	env: NodeJS.ProcessEnv;
	shell: boolean;
}

function resolveSpawnCommand(
	command: string,
	args: string[],
	cwd: string,
	additionalEnv?: Record<string, string>,
): ResolvedSpawnCommand {
	const {
		env: parsedEnv,
		executable,
		args: baseArgs,
	} = parseCommandAndEnv(command);
	const commandExecutable = executable || command;
	const commandArgs = normalizeArgsForNonShellSpawn([...baseArgs, ...args]);
	const env = {
		...process.env,
		FORCE_COLOR: 'true',
		...parsedEnv,
		...additionalEnv,
	};

	if (isWindows() && needsWindowsShell(commandExecutable, env, cwd)) {
		return {
			command: [commandExecutable, ...commandArgs].map(quoteForCmd).join(' '),
			args: [],
			env,
			shell: true,
		};
	}

	return { command: commandExecutable, args: commandArgs, env, shell: false };
}

function spawnTestProcess(
	resolvedCommand: ResolvedSpawnCommand,
	cwd: string,
): ChildProcess {
	const child = spawn(resolvedCommand.command, resolvedCommand.args, {
		cwd,
		env: resolvedCommand.env,
		shell: resolvedCommand.shell,
	});
	// Decode as a stream so multi-byte UTF-8 characters split across
	// chunk boundaries are not garbled.
	child.stdout?.setEncoding('utf8');
	child.stderr?.setEncoding('utf8');
	return child;
}

/**
 * On Windows, kill() only ends the direct child: cmd.exe for .cmd shims such
 * as npx, or the runner without its workers. taskkill /T ends the whole tree.
 */
function killProcessTree(child: ChildProcess): void {
	if (!isWindows() || child.pid === undefined) {
		child.kill();
		return;
	}

	const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
		windowsHide: true,
	});
	taskkill.on('error', () => child.kill());
}

export function executeTestCommandFast(
	command: string,
	args: string[],
	token: vscode.CancellationToken,
	test: vscode.TestItem,
	run: vscode.TestRun,
	cwd: string,
	additionalEnv?: Record<string, string>,
): Promise<void> {
	return new Promise((resolve) => {
		const resolvedCommand = resolveSpawnCommand(
			command,
			args,
			cwd,
			additionalEnv,
		);

		const jestProcess = spawnTestProcess(resolvedCommand, cwd);

		let stdout = '';
		let stderr = '';
		let cancellationListener: vscode.Disposable | undefined;
		let settled = false;

		// 'error', 'close' and cancellation can all fire for the same process;
		// only the first one may report a result.
		const settle = (report: () => void) => {
			if (settled) return;
			settled = true;
			cancellationListener?.dispose();
			report();
			resolve();
		};

		jestProcess.stdout?.on('data', (chunk: string) => {
			stdout += chunk;
			run.appendOutput(chunk.replace(/\n/g, '\r\n'));
		});

		jestProcess.stderr?.on('data', (chunk: string) => {
			stderr += chunk;
			run.appendOutput(chunk.replace(/\n/g, '\r\n'));
		});

		jestProcess.on('error', (error) => {
			settle(() =>
				run.failed(
					test,
					new vscode.TestMessage(
						`Failed to execute test runner: ${error.message}`,
					),
				),
			);
		});

		jestProcess.on('close', (code) => {
			settle(() => {
				if (token.isCancellationRequested) {
					run.skipped(test);
				} else if (code === 0) {
					run.passed(test);
				} else {
					const errorOutput = stderr || stdout || 'Test failed';
					run.failed(test, new vscode.TestMessage(stripAnsi(errorOutput)));
				}
			});
		});

		cancellationListener = token.onCancellationRequested(() => {
			settle(() => {
				killProcessTree(jestProcess);
				run.skipped(test);
			});
		});
	});
}

export interface TestCommandResult {
	output: string;
	structuredResultsProcessed: boolean;
}

export function executeTestCommand(
	command: string,
	args: string[],
	token: vscode.CancellationToken,
	tests: vscode.TestItem[],
	run: vscode.TestRun,
	cwd: string,
	additionalEnv?: Record<string, string>,
	sessionId?: string,
): Promise<TestCommandResult | null> {
	return new Promise((resolve) => {
		const maxBufferSize =
			vscode.workspace
				.getConfiguration('jestrunner')
				.get<number>('maxBufferSize', 50) *
			1024 *
			1024;

		const resolvedCommand = resolveSpawnCommand(
			command,
			args,
			cwd,
			additionalEnv,
		);

		const jestProcess = spawnTestProcess(resolvedCommand, cwd);

		let stdout = '';
		let stderr = '';
		let parseBuffer = '';
		let lastStructured: JestResults | undefined;
		let cancellationListener: vscode.Disposable | undefined;
		let settled = false;

		// 'error', 'close', cancellation and buffer overflow can all fire for
		// the same process; only the first one may report a result.
		const settle = (result: TestCommandResult | null, report?: () => void) => {
			if (settled) return;
			settled = true;
			cancellationListener?.dispose();
			report?.();
			resolve(result);
		};

		const failAll = (message: string) => () =>
			tests.forEach(
				(test) => void run.failed(test, new vscode.TestMessage(message)),
			);

		const exceedsBuffer = (
			buffer: string,
			chunk: string,
			errorMsg: string,
		): boolean => {
			if (buffer.length + chunk.length <= maxBufferSize) {
				return false;
			}
			settle(null, () => {
				killProcessTree(jestProcess);
				failAll(errorMsg)();
			});
			return true;
		};

		jestProcess.stdout?.on('data', (chunk: string) => {
			if (settled) return;
			if (
				exceedsBuffer(stdout, chunk, 'Test output exceeded maximum buffer size')
			) {
				return;
			}

			stdout += chunk;
			parseBuffer += chunk;

			const { messages, remaining } = extractStructuredMessages<JestResults>(
				parseBuffer,
				sessionId,
			);
			parseBuffer = remaining;

			messages.forEach((msg) => {
				if (msg.type === 'results') {
					lastStructured = msg.payload;
					processTestResultsFromParsed(msg.payload, tests, run);
				}
			});
		});

		jestProcess.stderr?.on('data', (chunk: string) => {
			if (settled) return;
			if (
				exceedsBuffer(
					stderr,
					chunk,
					'Error output exceeded maximum buffer size',
				)
			) {
				return;
			}
			stderr += chunk;
		});

		jestProcess.on('error', (error) => {
			settle(null, failAll(`Failed to execute test runner: ${error.message}`));
		});

		jestProcess.on('close', () => {
			if (token.isCancellationRequested) {
				settle(null, () => tests.forEach((test) => void run.skipped(test)));
				return;
			}

			const combinedOutput = `${stdout}${stderr ? `\n${stderr}` : ''}`;

			if (lastStructured) {
				logDebug('Parsed structured test results from reporters');
				settle({ output: combinedOutput, structuredResultsProcessed: true });
				return;
			}

			if (!combinedOutput.trim()) {
				settle(null, failAll('No output from test runner'));
				return;
			}

			const hasJsonInStderr =
				stderr.includes('"testResults"') ||
				stderr.includes('"numFailedTestSuites"');

			if (!stdout && !hasJsonInStderr) {
				logInfo(`Runner stderr: ${stderr}`);
				settle(null, failAll(stderr));
				return;
			}

			logDebug(`Runner output (stdout): ${stdout.substring(0, 500)}...`);
			settle({ output: combinedOutput, structuredResultsProcessed: false });
		});

		cancellationListener = token.onCancellationRequested(() => {
			settle(null, () => {
				killProcessTree(jestProcess);
				tests.forEach((test) => void run.skipped(test));
			});
		});
	});
}

export function logTestExecution(
	framework: string,
	command: string,
	args: string[],
	testCount: number,
	fileCount: number,
	isEsm: boolean,
): void {
	logInfo(
		`Running batched ${framework} command: ${command} ${args.join(' ')} (${testCount} tests across ${fileCount} files)${isEsm ? ' [ESM mode]' : ''}`,
	);
}
