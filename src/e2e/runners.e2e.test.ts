/**
 * End-to-end runs of real Jest and Vitest processes, as opposed to the unit
 * tests that mock spawning. Covers what only a real process can show,
 * especially on Windows: command lines through cmd.exe, quoting of special
 * test names, reporters loaded from the temp directory, result matching,
 * killing the process tree on cancel, and terminal commands (CodeLens) in
 * the shells a VS Code terminal may run.
 *
 * Run with `npm run test:e2e` (CI does on Windows, Linux and macOS).
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	CancellationTokenSource,
	TestController,
	type TestItem,
	TestRun,
	Uri,
	WorkspaceConfiguration,
	WorkspaceFolder,
} from '../test/__mocks__/vscode';
import { TestRunExecutor } from '../testController/TestRunExecutor';
import { getOrCreateFileTestItem, parseTestsInFile } from '../testDiscovery';
import { TestRunner } from '../testRunner';
import { TestRunnerConfig } from '../testRunnerConfig';
import { stripAnsi } from '../utils/ShellUtils';
import { escapeRegExp } from '../utils/TestNameUtils';

jest.mock('vscode', () => {
	const mock = jest.requireActual('../test/__mocks__/vscode');
	// Discovery builds ranges from positions, as the real API does.
	return { ...mock, Range: mock.VscodeRange };
});

jest.setTimeout(180_000);

const IS_WINDOWS = process.platform === 'win32';
const REPO_ROOT = path.resolve(__dirname, '../..');

/** Names that need quoting in every shell, each for another reason. */
const SPECIAL_NAMES = [
	'costs $5 `now`',
	`it's "quoted"`,
	'50% (done) [x]',
	'a|b & c > d',
];

/**
 * `failingPlain` makes a copy whose "plain" fails at the same line and in the
 * same describe block, so only the file tells the two apart.
 */
const namesTestFile = (header: string, failingPlain = false) => `${header}
describe('names', () => {
${SPECIAL_NAMES.map((name) => `\tit(${JSON.stringify(name)}, () => {});`).join('\n')}
\tit('plain', () => {${failingPlain ? ' expect(1).toBe(2); ' : ''}});
\tit('fails', () => {
\t\texpect(1).toBe(2);
\t});
});
`;

let root: string;
let linkedRoot: string;
/** Root of the workspace as VS Code opened it. */
let workspaceRoot: string;
let settings: Record<string, unknown>;
let logs: string[];

const write = (relativePath: string, content: string) => {
	const file = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
	return file;
};

beforeAll(() => {
	// A space in the path, as under "C:\Users\John Doe", must survive quoting.
	root = path.join(
		fs.realpathSync.native(
			fs.mkdtempSync(path.join(os.tmpdir(), 'jest-runner-e2e-')),
		),
		'my workspace',
	);
	fs.mkdirSync(root);
	// The runners are resolved from the fixtures like from a real project.
	fs.symlinkSync(
		path.join(REPO_ROOT, 'node_modules'),
		path.join(root, 'node_modules'),
		'junction',
	);
	write('package.json', JSON.stringify({ name: 'e2e', private: true }));

	write(
		'jest-project/package.json',
		JSON.stringify({ name: 'jest-project', devDependencies: { jest: '*' } }),
	);
	write('jest-project/jest.config.js', 'module.exports = {};\n');
	write('jest-project/names.test.js', namesTestFile(''));
	write('jest-project/other.test.js', namesTestFile('', true));
	write(
		'jest-project/slow.test.js',
		`it('sleeps', async () => {
	require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'slow.pid'))}, String(process.pid));
	await new Promise((resolve) => setTimeout(resolve, 120000));
});
`,
	);

	write(
		'vitest-project/package.json',
		JSON.stringify({
			name: 'vitest-project',
			type: 'module',
			devDependencies: { vitest: '*' },
		}),
	);
	write('vitest-project/vitest.config.mjs', 'export default { test: {} };\n');
	write(
		'vitest-project/names.test.js',
		namesTestFile("import { describe, expect, it } from 'vitest';"),
	);
	write(
		'vitest-project/other.test.js',
		namesTestFile("import { describe, expect, it } from 'vitest';", true),
	);

	// The same workspace opened through a symlink (as /var on macOS, which
	// links to /private/var), while runners report the resolved paths.
	linkedRoot = path.join(path.dirname(root), 'linked workspace');
	fs.symlinkSync(root, linkedRoot, 'junction');
});

afterAll(() => {
	// Removes the junctions first, never what they point to.
	for (const link of [path.join(root, 'node_modules'), linkedRoot]) {
		try {
			fs.unlinkSync(link);
		} catch {
			fs.rmdirSync(link);
		}
	}
	fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

beforeEach(() => {
	settings = {};
	logs = [];
	workspaceRoot = root;
	jest
		.spyOn(vscode.workspace, 'getConfiguration')
		.mockImplementation(() => new WorkspaceConfiguration(settings) as any);
	jest
		.spyOn(vscode.workspace, 'getWorkspaceFolder')
		.mockImplementation(() => workspaceFolder() as any);
	jest.spyOn(vscode.window, 'createOutputChannel').mockReturnValue({
		appendLine: (line: string) => logs.push(line),
	} as any);
});

afterEach(() => {
	jest.restoreAllMocks();
});

const workspaceFolder = () => new WorkspaceFolder(Uri.file(workspaceRoot));

/** Fails with the extension's log, since CI output is all there is. */
const withLogs = (assertion: () => void) => {
	try {
		assertion();
	} catch (error) {
		console.log(`Extension log:\n${logs.join('\n')}`);
		throw error;
	}
};

/** Discovers the tests of `relativePath` as the Test Explorer does. */
const discover = (controller: TestController, relativePath: string) => {
	const file = path.join(workspaceRoot, relativePath);
	const fileItem = getOrCreateFileTestItem(
		controller as any,
		workspaceFolder() as any,
		file,
	) as unknown as TestItem;
	parseTestsInFile(file, fileItem as any, controller as any);

	// The mock does not link children to their parents like VS Code.
	const link = (item: TestItem) =>
		item.children.forEach((child) => {
			child.parent = item;
			link(child);
		});
	link(fileItem);
	return fileItem;
};

const findTest = (item: TestItem, label: string): TestItem => {
	let found: TestItem | undefined;
	const search = (current: TestItem) => {
		if (current.label === label && current.children.size === 0) {
			found = current;
		}
		current.children.forEach(search);
	};
	search(item);
	if (!found) throw new Error(`No test "${label}" in ${item.id}`);
	return found;
};

const labels = (mock: jest.Mock) =>
	mock.mock.calls.map(([test]) => test.label as string).sort();

/** "file > label" of each reported test. */
const inFiles = (mock: jest.Mock) =>
	mock.mock.calls
		.map(([test]) => `${path.basename(test.uri.fsPath)} > ${test.label}`)
		.sort();

/** Runs `include` through the Test Explorer's run handler. */
const runTests = async (
	controller: TestController,
	include: TestItem[],
	token = new CancellationTokenSource().token,
) => {
	const run = new TestRun();
	controller.createTestRun.mockReturnValue(run);
	const executor = new TestRunExecutor(
		controller as any,
		new TestRunnerConfig(),
		{} as any,
	);
	await executor.runHandler({ include, exclude: [] } as any, token as any);
	return {
		passed: labels(run.passed),
		failed: labels(run.failed),
		passedInFiles: inFiles(run.passed),
		failedInFiles: inFiles(run.failed),
		skipped: labels(run.skipped),
		messages: run.failed.mock.calls.map(([, message]) => message.message),
	};
};

describe.each([
	['jest', 'jest-project'],
	['vitest', 'vitest-project'],
])('Test Explorer runs of %s', (_framework, project) => {
	const file = `${project}/names.test.js`;

	it('reports each test of a whole file', async () => {
		const controller = new TestController('e2e', 'e2e');
		const outcome = await runTests(controller, [discover(controller, file)]);

		withLogs(() => {
			expect(outcome.passed).toEqual([...SPECIAL_NAMES, 'plain'].sort());
			expect(outcome.failed).toEqual(['fails']);
			expect(outcome.messages[0]).toMatch(/expected.*2/is);
		});
	});

	it('runs only the selected tests with special names', async () => {
		const controller = new TestController('e2e', 'e2e');
		const fileItem = discover(controller, file);
		const outcome = await runTests(
			controller,
			SPECIAL_NAMES.map((name) => findTest(fileItem, name)),
		);

		withLogs(() => {
			expect(outcome.passed).toEqual([...SPECIAL_NAMES].sort());
			expect(outcome.failed).toEqual([]);
		});
	});

	it.each(SPECIAL_NAMES)('runs the single test %s', async (name) => {
		const controller = new TestController('e2e', 'e2e');
		const outcome = await runTests(controller, [
			findTest(discover(controller, file), name),
		]);

		withLogs(() => {
			expect(outcome.passed).toEqual([name]);
			expect(outcome.failed).toEqual([]);
		});
	});
});

describe.each([
	['jest', 'jest-project'],
	['vitest', 'vitest-project'],
])('Test Explorer runs of %s in two files', (_framework, project) => {
	it.each([
		['its real path', () => root],
		['a symlink', () => linkedRoot],
	])(
		'keeps namesakes apart in a workspace opened through %s',
		async (_, getRoot) => {
			workspaceRoot = getRoot();
			const controller = new TestController('e2e', 'e2e');
			const outcome = await runTests(controller, [
				findTest(discover(controller, `${project}/names.test.js`), 'plain'),
				findTest(discover(controller, `${project}/other.test.js`), 'plain'),
			]);

			withLogs(() => {
				expect(outcome.passedInFiles).toEqual(['names.test.js > plain']);
				expect(outcome.failedInFiles).toEqual(['other.test.js > plain']);
			});
		},
	);
});

describe('Test Explorer runs of jest', () => {
	describe('through the npm shim of a custom command', () => {
		// On Windows the shim is jest.cmd, which only runs through cmd.exe.
		beforeEach(() => {
			settings['jestrunner.jestCommand'] =
				`"${path.join(root, 'node_modules', '.bin', 'jest')}"`;
		});

		it('runs the selected tests with special names', async () => {
			const controller = new TestController('e2e', 'e2e');
			const fileItem = discover(controller, 'jest-project/names.test.js');
			const outcome = await runTests(
				controller,
				SPECIAL_NAMES.map((name) => findTest(fileItem, name)),
			);

			withLogs(() => {
				expect(outcome.passed).toEqual([...SPECIAL_NAMES].sort());
				expect(outcome.failed).toEqual([]);
			});
		});

		it('kills the runner when the run is cancelled', async () => {
			const pidFile = path.join(root, 'slow.pid');
			fs.rmSync(pidFile, { force: true });
			const controller = new TestController('e2e', 'e2e');
			const test = findTest(
				discover(controller, 'jest-project/slow.test.js'),
				'sleeps',
			);
			const cancellation = new CancellationTokenSource();

			const running = runTests(controller, [test], cancellation.token);
			const pid = Number(await waitFor(() => readIfExists(pidFile)));
			cancellation.cancel();
			const outcome = await running;

			withLogs(() => {
				expect(outcome.skipped).toEqual(['sleeps']);
			});
			// The test process sits below cmd.exe on Windows.
			await waitFor(() => !isRunning(pid));
		});
	});
});

const readIfExists = (file: string) =>
	fs.existsSync(file) ? fs.readFileSync(file, 'utf8') || undefined : undefined;

const isRunning = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const waitFor = async <T>(
	condition: () => T | undefined | false,
	timeout = 60_000,
): Promise<T> => {
	const start = Date.now();
	for (;;) {
		const value = condition();
		if (value) return value;
		if (Date.now() - start > timeout) {
			throw new Error(`Timed out after ${timeout}ms`);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
};

type Shell = {
	name: string;
	path: string;
	args: (command: string) => string[];
};

const powerShellArgs = (command: string) => [
	'-NoProfile',
	'-NonInteractive',
	'-Command',
	command,
];

const SHELLS: Shell[] = (
	IS_WINDOWS
		? [
				{
					name: 'Windows PowerShell',
					path: 'powershell.exe',
					args: powerShellArgs,
				},
				{ name: 'PowerShell', path: 'pwsh.exe', args: powerShellArgs },
				{
					name: 'cmd',
					path: 'cmd.exe',
					// As VS Code's terminal: the line is read as typed.
					args: (command: string) => ['/d', '/s', '/c', `"${command}"`],
				},
				{
					name: 'Git Bash',
					path: 'C:\\Program Files\\Git\\bin\\bash.exe',
					args: (command: string) => ['-c', command],
				},
			]
		: [
				{ name: 'bash', path: '/bin/bash', args: (command) => ['-c', command] },
				{ name: 'zsh', path: '/bin/zsh', args: (command) => ['-c', command] },
			]
).filter((shell) => !spawnSync(shell.path, shell.args('exit 0')).error);

const runInShell = (shell: Shell, command: string, cwd: string) =>
	new Promise<{ code: number | null; output: string }>((resolve) => {
		let output = '';
		const child = spawn(shell.path, shell.args(command), {
			cwd,
			windowsVerbatimArguments: shell.name === 'cmd',
			env: { ...process.env, FORCE_COLOR: '0' },
		});
		child.stdout.on('data', (chunk) => {
			output += chunk;
		});
		child.stderr.on('data', (chunk) => {
			output += chunk;
		});
		child.on('close', (code) => resolve({ code, output: stripAnsi(output) }));
	});

describe.each(SHELLS)('Terminal commands in $name', (shell) => {
	beforeEach(() => {
		(vscode.env as { shell: string }).shell = shell.path;
	});

	afterEach(() => {
		(vscode.env as { shell: string }).shell = '';
	});

	it.each([
		...SPECIAL_NAMES.map((name) => ['jest', name]),
		...SPECIAL_NAMES.map((name) => ['vitest', name]),
	])('runs the %s test %s', async (framework, name) => {
		const file = path.join(root, `${framework}-project`, 'names.test.js');
		const config = new TestRunnerConfig();
		const runner = new TestRunner(config);
		// As the "Run" CodeLens of the test builds it.
		const command = (
			runner as unknown as {
				buildCommand(file: string, testName: string): string;
			}
		).buildCommand(file, escapeRegExp(`names ${name}`));
		runner.dispose();

		const { code, output } = await runInShell(
			shell,
			command,
			config.getTestRunCwd(file),
		);

		withLogs(() => {
			expect({ command, output }).toEqual({
				command,
				// Jest: "Tests: 6 skipped, 1 passed", Vitest: "Tests 1 passed | 6 skipped"
				output: expect.stringMatching(/Tests:?\s+(\d+ skipped, )?1 passed/),
			});
			expect(code).toBe(0);
		});
	});
});
