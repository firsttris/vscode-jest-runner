import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as vscode from 'vscode';
import {
	executeTestCommand,
	executeTestCommandFast,
} from '../execution/TestProcessRunner';
import { WorkspaceConfiguration } from './__mocks__/vscode';

jest.mock('node:child_process', () => ({
	spawn: jest.fn(),
}));
// Assert the direct (non-shell) spawn shape on every platform; the Windows
// shell path is covered in windowsSpawn.test.ts.
jest.mock('../utils/ShellUtils', () => ({
	...jest.requireActual('../utils/ShellUtils'),
	needsWindowsShell: () => false,
}));

type MockChildProcess = EventEmitter & {
	stdout: PassThrough;
	stderr: PassThrough;
	kill: jest.Mock;
};

function createMockChildProcess(): MockChildProcess {
	const cp = new EventEmitter() as MockChildProcess;
	cp.stdout = new PassThrough();
	cp.stderr = new PassThrough();
	cp.kill = jest.fn();
	return cp;
}

function createToken(): vscode.CancellationToken {
	return {
		isCancellationRequested: false,
		onCancellationRequested: jest.fn().mockReturnValue({ dispose: jest.fn() }),
	} as unknown as vscode.CancellationToken;
}

describe('TestProcessRunner spawn behavior', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest
			.spyOn(vscode.workspace, 'getConfiguration')
			.mockReturnValue(new WorkspaceConfiguration({}) as any);
	});

	it('should parse command/env and use non-shell spawn in executeTestCommand', async () => {
		const childProcess = createMockChildProcess();
		(spawn as unknown as jest.Mock).mockReturnValue(childProcess);

		const run = {
			appendOutput: jest.fn(),
			failed: jest.fn(),
			skipped: jest.fn(),
		} as unknown as vscode.TestRun;

		const promise = executeTestCommand(
			'NODE_OPTIONS=fromCommand npx --no-install jest',
			['--json'],
			createToken(),
			[{ id: 'test-id' } as unknown as vscode.TestItem],
			run,
			'/workspace',
			{ NODE_OPTIONS: 'fromAdditionalEnv', EXTRA: '1' },
		);

		childProcess.stdout.emit('data', '{"testResults":[]}\n');
		childProcess.stderr.emit('data', 'warn\n');
		childProcess.emit('close', 0);

		await promise;

		expect(spawn).toHaveBeenCalledWith(
			'npx',
			['--no-install', 'jest', '--json'],
			expect.objectContaining({
				cwd: '/workspace',
				shell: false,
				env: expect.objectContaining({
					FORCE_COLOR: 'true',
					NODE_OPTIONS: 'fromAdditionalEnv',
					EXTRA: '1',
				}),
			}),
		);
	});

	it('should not double-normalize CRLF output in executeTestCommand', async () => {
		const childProcess = createMockChildProcess();
		(spawn as unknown as jest.Mock).mockReturnValue(childProcess);

		const run = {
			appendOutput: jest.fn(),
			failed: jest.fn(),
			skipped: jest.fn(),
		} as unknown as vscode.TestRun;

		const promise = executeTestCommand(
			'npx --no-install jest',
			['--json'],
			createToken(),
			[{ id: 'test-id' } as unknown as vscode.TestItem],
			run,
			'/workspace',
		);

		childProcess.stdout.emit('data', '{"testResults":[]}\r\n');
		childProcess.stderr.emit('data', 'warn\r\n');
		childProcess.emit('close', 0);

		await promise;
	});

	it('should parse command/env and use non-shell spawn in executeTestCommandFast', async () => {
		const childProcess = createMockChildProcess();
		(spawn as unknown as jest.Mock).mockReturnValue(childProcess);

		const run = {
			appendOutput: jest.fn(),
			failed: jest.fn(),
			skipped: jest.fn(),
			passed: jest.fn(),
		} as unknown as vscode.TestRun;

		const promise = executeTestCommandFast(
			'FOO=bar node ./node_modules/jest/bin/jest.js',
			['--runInBand'],
			createToken(),
			{ id: 'test-id' } as unknown as vscode.TestItem,
			run,
			'/workspace',
			{ BAR: 'baz' },
		);

		childProcess.emit('close', 0);

		await promise;

		expect(spawn).toHaveBeenCalledWith(
			'node',
			['./node_modules/jest/bin/jest.js', '--runInBand'],
			expect.objectContaining({
				cwd: '/workspace',
				shell: false,
				env: expect.objectContaining({
					FORCE_COLOR: 'true',
					FOO: 'bar',
					BAR: 'baz',
				}),
			}),
		);
		expect((run as any).passed).toHaveBeenCalled();
	});

	it('should unquote shell-style args for non-shell executeTestCommand', async () => {
		const childProcess = createMockChildProcess();
		(spawn as unknown as jest.Mock).mockReturnValue(childProcess);

		const run = {
			appendOutput: jest.fn(),
			failed: jest.fn(),
			skipped: jest.fn(),
		} as unknown as vscode.TestRun;

		const promise = executeTestCommand(
			"node '/workspace/node_modules/vitest/vitest.mjs'",
			[
				'run',
				"'/workspace/vitest/sum.vitest.js'",
				'--config',
				"'/workspace/vitest/vitest.config.ts'",
				'-t',
				"'adds 1 \\+ 2 to equal 3'",
			],
			createToken(),
			[{ id: 'test-id' } as unknown as vscode.TestItem],
			run,
			'/workspace',
		);

		childProcess.stdout.emit('data', '{"testResults":[]}');
		childProcess.emit('close', 0);

		await promise;

		expect(spawn).toHaveBeenCalledWith(
			'node',
			[
				'/workspace/node_modules/vitest/vitest.mjs',
				'run',
				'/workspace/vitest/sum.vitest.js',
				'--config',
				'/workspace/vitest/vitest.config.ts',
				'-t',
				'adds 1 \\+ 2 to equal 3',
			],
			expect.objectContaining({
				shell: false,
			}),
		);
	});

	describe('multi-byte characters split across chunks', () => {
		const writeSplitUtf8 = async (
			stream: PassThrough,
			text: string,
		): Promise<void> => {
			const bytes = Buffer.from(text, 'utf8');
			// Split inside the two-byte "ü" so neither chunk is valid on its own.
			const splitAt = bytes.indexOf(Buffer.from('ü', 'utf8')) + 1;
			stream.write(bytes.subarray(0, splitAt));
			stream.write(bytes.subarray(splitAt));
			await new Promise((resolve) => setImmediate(resolve));
		};

		it('should decode stdout correctly in executeTestCommand', async () => {
			const childProcess = createMockChildProcess();
			(spawn as unknown as jest.Mock).mockReturnValue(childProcess);
			const run = {
				appendOutput: jest.fn(),
				failed: jest.fn(),
				skipped: jest.fn(),
			} as unknown as vscode.TestRun;

			const promise = executeTestCommand(
				'npx jest',
				[],
				createToken(),
				[{ id: 'test-id' } as unknown as vscode.TestItem],
				run,
				'/workspace',
			);
			await writeSplitUtf8(childProcess.stdout, 'prüft Größe\n');
			childProcess.emit('close', 0);

			const result = await promise;

			expect(result?.output).toBe('prüft Größe\n');
		});

		it('should decode output correctly in executeTestCommandFast', async () => {
			const childProcess = createMockChildProcess();
			(spawn as unknown as jest.Mock).mockReturnValue(childProcess);
			const run = {
				appendOutput: jest.fn(),
				failed: jest.fn(),
				skipped: jest.fn(),
				passed: jest.fn(),
			} as unknown as vscode.TestRun;

			const promise = executeTestCommandFast(
				'npx jest',
				[],
				createToken(),
				{ id: 'test-id' } as unknown as vscode.TestItem,
				run,
				'/workspace',
			);
			await writeSplitUtf8(childProcess.stderr, 'prüft Größe');
			childProcess.emit('close', 1);
			await promise;

			const appended = (run.appendOutput as jest.Mock).mock.calls
				.map(([chunk]) => chunk)
				.join('');
			expect(appended).toBe('prüft Größe');
			expect((run.failed as jest.Mock).mock.calls[0][1].message).toBe(
				'prüft Größe',
			);
		});
	});

	describe('reporting each outcome only once', () => {
		const createCancellableToken = () => {
			let listener: (() => void) | undefined;
			const token = {
				isCancellationRequested: false,
				onCancellationRequested: jest.fn((callback: () => void) => {
					listener = callback;
					return { dispose: jest.fn() };
				}),
			};
			const cancel = () => {
				token.isCancellationRequested = true;
				listener?.();
			};
			return { token: token as unknown as vscode.CancellationToken, cancel };
		};

		const createRun = () =>
			({
				appendOutput: jest.fn(),
				failed: jest.fn(),
				skipped: jest.fn(),
				passed: jest.fn(),
			}) as unknown as vscode.TestRun;

		const testItem = { id: 'test-id' } as unknown as vscode.TestItem;

		it('should report skipped once when a batched run is cancelled', async () => {
			const childProcess = createMockChildProcess();
			(spawn as unknown as jest.Mock).mockReturnValue(childProcess);
			const run = createRun();
			const { token, cancel } = createCancellableToken();

			const promise = executeTestCommand(
				'npx jest',
				[],
				token,
				[testItem],
				run,
				'/workspace',
			);
			cancel();
			childProcess.emit('close', null);

			await expect(promise).resolves.toBeNull();
			expect(childProcess.kill).toHaveBeenCalledTimes(1);
			expect(run.skipped).toHaveBeenCalledTimes(1);
			expect(run.failed).not.toHaveBeenCalled();
		});

		it('should report failed once when a batched run fails to spawn', async () => {
			const childProcess = createMockChildProcess();
			(spawn as unknown as jest.Mock).mockReturnValue(childProcess);
			const run = createRun();

			const promise = executeTestCommand(
				'missing-binary',
				[],
				createToken(),
				[testItem],
				run,
				'/workspace',
			);
			childProcess.emit('error', new Error('spawn missing-binary ENOENT'));
			childProcess.emit('close', -2);

			await expect(promise).resolves.toBeNull();
			expect(run.failed).toHaveBeenCalledTimes(1);
			expect((run.failed as jest.Mock).mock.calls[0][1].message).toContain(
				'ENOENT',
			);
		});

		it('should ignore output after the buffer limit was exceeded', async () => {
			jest
				.spyOn(vscode.workspace, 'getConfiguration')
				.mockReturnValue(
					new WorkspaceConfiguration({ maxBufferSize: 0 } as any) as any,
				);
			const childProcess = createMockChildProcess();
			(spawn as unknown as jest.Mock).mockReturnValue(childProcess);
			const run = createRun();

			const promise = executeTestCommand(
				'npx jest',
				[],
				createToken(),
				[testItem],
				run,
				'/workspace',
			);
			childProcess.stdout.emit('data', 'too much');
			childProcess.stderr.emit('data', 'too much');
			childProcess.emit('close', 1);

			await expect(promise).resolves.toBeNull();
			expect(childProcess.kill).toHaveBeenCalledTimes(1);
			expect(run.failed).toHaveBeenCalledTimes(1);
		});

		it('should still return JSON results that only appear on stderr', async () => {
			const childProcess = createMockChildProcess();
			(spawn as unknown as jest.Mock).mockReturnValue(childProcess);
			const run = createRun();

			const promise = executeTestCommand(
				'npx jest',
				[],
				createToken(),
				[testItem],
				run,
				'/workspace',
			);
			childProcess.stderr.emit('data', '{"testResults":[]}');
			childProcess.emit('close', 0);

			await expect(promise).resolves.toEqual({
				output: '\n{"testResults":[]}',
				structuredResultsProcessed: false,
			});
			expect(run.failed).not.toHaveBeenCalled();
		});

		it('should report skipped once when a fast run is cancelled', async () => {
			const childProcess = createMockChildProcess();
			(spawn as unknown as jest.Mock).mockReturnValue(childProcess);
			const run = createRun();
			const { token, cancel } = createCancellableToken();

			const promise = executeTestCommandFast(
				'npx jest',
				[],
				token,
				testItem,
				run,
				'/workspace',
			);
			cancel();
			childProcess.emit('close', null);
			await promise;

			expect(run.skipped).toHaveBeenCalledTimes(1);
			expect(run.failed).not.toHaveBeenCalled();
		});

		it('should report failed once when a fast run fails to spawn', async () => {
			const childProcess = createMockChildProcess();
			(spawn as unknown as jest.Mock).mockReturnValue(childProcess);
			const run = createRun();

			const promise = executeTestCommandFast(
				'missing-binary',
				[],
				createToken(),
				testItem,
				run,
				'/workspace',
			);
			childProcess.emit('error', new Error('spawn missing-binary ENOENT'));
			childProcess.emit('close', -2);
			await promise;

			expect(run.failed).toHaveBeenCalledTimes(1);
			expect((run.failed as jest.Mock).mock.calls[0][1].message).toContain(
				'ENOENT',
			);
		});
	});
});
