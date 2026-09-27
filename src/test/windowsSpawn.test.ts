import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import * as vscode from 'vscode';
import { executeTestCommand } from '../execution/TestProcessRunner';
import {
	needsWindowsShell,
	parseCommandAndEnv,
	quoteForCmd,
} from '../utils/ShellUtils';
import { WorkspaceConfiguration } from './__mocks__/vscode';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('node:fs', () => ({
	...jest.requireActual('node:fs'),
	existsSync: jest.fn(),
}));
jest.mock('../utils/PathUtils', () => ({
	...jest.requireActual('../utils/PathUtils'),
	isWindows: () => true,
}));

const NODE_DIR = 'C:\\Program Files\\nodejs';
const env = { Path: `${NODE_DIR};C:\\Windows\\system32` };

/** Simulates a Node.js installation: node.exe plus npm's .cmd shims. */
const installedFiles = new Set(
	[
		`${NODE_DIR}\\node.exe`,
		`${NODE_DIR}\\npx.cmd`,
		`${NODE_DIR}\\yarn.cmd`,
		'C:\\tools\\bun.exe',
		'C:\\tools\\bun.cmd',
	].map((f) => f.toLowerCase()),
);

describe('Windows spawning', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(existsSync as jest.Mock).mockImplementation((file: string) =>
			installedFiles.has(file.toLowerCase()),
		);
	});

	describe('needsWindowsShell', () => {
		it.each([
			['node', false],
			['node.exe', false],
			['npx', true],
			['npx.cmd', true],
			['yarn', true],
			['C:\\tools\\run.bat', true],
			// Not found at all: spawned directly, as before (ENOENT).
			['unknown-runner', false],
			['vitest.mjs', false],
			// An .exe wins over a .cmd shim, as it does without a shell.
			['C:\\tools\\bun', false],
		])('%s -> %s', (executable, expected) => {
			expect(needsWindowsShell(executable, env, 'C:\\project')).toBe(expected);
		});

		it('searches quoted PATH entries', () => {
			const quotedEnv = { Path: `"${NODE_DIR}"` };

			expect(needsWindowsShell('node', quotedEnv, 'C:\\project')).toBe(false);
			expect(needsWindowsShell('npx', quotedEnv, 'C:\\project')).toBe(true);
		});

		it('finds executables relative to the working directory', () => {
			installedFiles.add('c:\\project\\bin\\runner.cmd');

			expect(needsWindowsShell('bin\\runner', env, 'C:\\project')).toBe(true);
			expect(needsWindowsShell('bin\\runner', env, 'C:\\other')).toBe(false);
		});
	});

	describe('parseCommandAndEnv', () => {
		it.each([
			[
				'node C:\\proj\\node_modules\\jest\\bin\\jest.js',
				['node', 'C:\\proj\\node_modules\\jest\\bin\\jest.js'],
			],
			[
				'node "C:\\Program Files\\jest\\bin\\jest.js"',
				['node', 'C:\\Program Files\\jest\\bin\\jest.js'],
			],
			['node "C:\\dir\\" --json', ['node', 'C:\\dir\\', '--json']],
			// Single quotes keep backslashes literal, as in POSIX shells.
			["node 'C:\\it''s\\jest.js'", ['node', 'C:\\its\\jest.js']],
			['"C:\\tools\\it\'s\\jest.cmd"', ["C:\\tools\\it's\\jest.cmd"]],
		])('%s', (command, [executable, ...args]) => {
			expect(parseCommandAndEnv(command)).toEqual({
				env: {},
				executable,
				args,
			});
		});
	});

	describe('quoteForCmd', () => {
		it.each([
			['--json', '--json'],
			['C:/project/a.test.ts', 'C:/project/a.test.ts'],
			['C:\\Program Files\\x.js', '"C:\\Program Files\\x.js"'],
			['(a|b)', '"(a|b)"'],
			['say "hi"', '"say ""hi"""'],
			['', '""'],
			// Backslashes before a quote are doubled for the C runtime.
			['C:\\dir with space\\', '"C:\\dir with space\\\\"'],
			['a\\"b c', '"a\\\\""b c"'],
			// cmd.exe must not expand %VAR%, even inside quotes.
			['^shows %USERNAME% badge$', '"^shows "^%"USERNAME"^%" badge$"'],
			['50% a\\%', '"50"^%" a\\\\"^%""'],
		])('%s -> %s', (arg, expected) => {
			expect(quoteForCmd(arg)).toBe(expected);
		});
	});

	describe('executeTestCommand', () => {
		const originalPath = process.env.Path;

		beforeEach(() => {
			jest
				.spyOn(vscode.workspace, 'getConfiguration')
				.mockReturnValue(new WorkspaceConfiguration({}) as any);
			process.env.Path = env.Path;
		});

		afterEach(() => {
			process.env.Path = originalPath;
		});

		const runCommand = async (command: string, args: string[]) => {
			const child = Object.assign(new EventEmitter(), {
				stdout: new PassThrough(),
				stderr: new PassThrough(),
				kill: jest.fn(),
			});
			(spawn as unknown as jest.Mock).mockReturnValue(child);

			const promise = executeTestCommand(
				command,
				args,
				{
					isCancellationRequested: false,
					onCancellationRequested: () => ({ dispose: jest.fn() }),
				} as any,
				[],
				{ appendOutput: jest.fn(), failed: jest.fn() } as any,
				'C:\\project',
			);
			child.emit('close', 0);
			await promise;
		};

		it('starts .cmd shims such as npx through the shell', async () => {
			await runCommand('npx --no-install jest', ['-t', "'(a|b)'"]);

			expect(spawn).toHaveBeenCalledWith(
				'npx --no-install jest -t "(a|b)"',
				[],
				expect.objectContaining({ shell: true, cwd: 'C:\\project' }),
			);
		});

		it('keeps the backslashes of Windows paths in the command', async () => {
			await runCommand('node .\\node_modules\\jest\\bin\\jest.js', ['--json']);

			expect(spawn).toHaveBeenCalledWith(
				'node',
				['.\\node_modules\\jest\\bin\\jest.js', '--json'],
				expect.objectContaining({ shell: false }),
			);
		});

		it('starts node directly without a shell', async () => {
			await runCommand('node "C:\\Program Files\\jest\\bin\\jest.js"', [
				'--json',
			]);

			expect(spawn).toHaveBeenCalledWith(
				'node',
				['C:\\Program Files\\jest\\bin\\jest.js', '--json'],
				expect.objectContaining({ shell: false }),
			);
		});

		it('kills the whole process tree when cancelled', async () => {
			const child = Object.assign(new EventEmitter(), {
				stdout: new PassThrough(),
				stderr: new PassThrough(),
				kill: jest.fn(),
				pid: 4711,
			});
			const taskkill = Object.assign(new EventEmitter(), { kill: jest.fn() });
			(spawn as unknown as jest.Mock)
				.mockReturnValueOnce(child)
				.mockReturnValueOnce(taskkill);
			let cancel: () => void = () => {};

			const promise = executeTestCommand(
				'npx --no-install jest',
				[],
				{
					isCancellationRequested: false,
					onCancellationRequested: (listener: () => void) => {
						cancel = listener;
						return { dispose: jest.fn() };
					},
				} as any,
				[],
				{ appendOutput: jest.fn(), skipped: jest.fn() } as any,
				'C:\\project',
			);
			cancel();
			await promise;

			// kill() would only end cmd.exe, not jest below it.
			expect(spawn).toHaveBeenLastCalledWith(
				'taskkill',
				['/pid', '4711', '/T', '/F'],
				expect.objectContaining({ windowsHide: true }),
			);
			expect(child.kill).not.toHaveBeenCalled();
		});
	});
});
