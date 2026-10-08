import type * as vscode from 'vscode';
import type { CoverageProvider } from '../coverageProvider';
import { buildTestArgs } from '../execution/TestArgumentBuilder';
import { collectTestsByFile } from '../execution/TestCollector';
import {
	executeTestCommand,
	runsInWindowsShell,
} from '../execution/TestProcessRunner';
import { TestRunExecutor } from '../testController/TestRunExecutor';
import { getTestFrameworkForFile } from '../testDetection/testFileDetection';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { escapeRegExpForPath } from '../utils/PathUtils';

jest.mock('vscode', () => ({
	workspace: {
		getWorkspaceFolder: jest
			.fn()
			.mockReturnValue({ uri: { fsPath: 'C:\\workspace' } }),
	},
	Uri: {
		file: jest.fn().mockImplementation((f) => ({ fsPath: f })),
	},
	TestMessage: jest.fn().mockImplementation((message) => ({ message })),
	FileCoverage: class {},
	TestCoverageCount: class {},
}));
jest.mock('child_process');
jest.mock('../coverageProvider');
jest.mock('../utils/Logger');
jest.mock('../utils/PathUtils', () => ({
	...jest.requireActual('../utils/PathUtils'),
	isWindows: () => true,
}));
jest.mock('../execution/TestCollector', () => ({
	collectTestsByFile: jest.fn(),
	isPartiallySelected: jest.fn().mockReturnValue(false),
}));
jest.mock('../execution/TestArgumentBuilder', () => ({
	buildTestArgs: jest.fn(),
	canUseFastMode: jest.fn().mockReturnValue(false),
}));
jest.mock('../execution/TestProcessRunner', () => ({
	executeTestCommand: jest.fn(),
	executeTestCommandFast: jest.fn(),
	logTestExecution: jest.fn(),
	runsInWindowsShell: jest.fn(),
}));
jest.mock('../testDetection/testFileDetection', () => ({
	getTestFrameworkForFile: jest.fn(),
}));

const FLAGS = ['--json', '--reporters', 'default'];

/** Requests `count` files and returns the args of each runner process. */
const runFiles = async (
	framework: string,
	count: number,
	toArg: (file: string) => string,
) => {
	const files = Array.from(
		{ length: count },
		(_, i) => `C:/workspace/src/some/deeply/nested/folder/file${i}.test.ts`,
	);
	(collectTestsByFile as jest.Mock).mockReturnValue(
		new Map(files.map((file) => [file, [{ id: file, label: 'test' }]])),
	);
	(getTestFrameworkForFile as jest.Mock).mockReturnValue(framework);
	(buildTestArgs as jest.Mock).mockImplementation((requested: string[]) =>
		framework === 'vitest'
			? ['run', ...requested.map(toArg), ...FLAGS]
			: [...requested.map(toArg), ...FLAGS],
	);

	const executor = new TestRunExecutor(
		{
			createTestRun: jest
				.fn()
				.mockReturnValue({ started: jest.fn(), end: jest.fn() }),
		} as any,
		{
			getTestRunCwd: jest.fn().mockReturnValue('C:/workspace'),
			getTestCommand: jest.fn().mockReturnValue('npx --no-install jest'),
			getEnvironmentForRun: jest.fn(),
			getJestConfigPath: jest.fn().mockReturnValue(''),
			getVitestConfigPath: jest.fn().mockReturnValue(''),
		} as unknown as TestRunnerConfig,
		{} as CoverageProvider,
	);
	await executor.runHandler(
		{} as vscode.TestRunRequest,
		{ isCancellationRequested: false } as vscode.CancellationToken,
	);

	return (executeTestCommand as jest.Mock).mock.calls.map(
		(call) => call[1] as string[],
	);
};

describe('TestRunExecutor Windows command length', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(executeTestCommand as jest.Mock).mockResolvedValue({
			output: '',
			structuredResultsProcessed: true,
		});
	});

	it('drops the escaped Jest path patterns of a too long command', async () => {
		(runsInWindowsShell as jest.Mock).mockReturnValue(false);

		const [args] = await runFiles('jest', 600, escapeRegExpForPath);

		expect(args).toEqual(FLAGS);
	});

	it('uses the cmd.exe limit for commands started through the shell', async () => {
		// ~9000 characters fit into 32767, but not into cmd.exe's 8191.
		(runsInWindowsShell as jest.Mock).mockReturnValue(true);

		const [args] = await runFiles('jest', 150, escapeRegExpForPath);

		expect(args).toEqual(FLAGS);
		expect(runsInWindowsShell).toHaveBeenCalledWith(
			'npx --no-install jest',
			'C:/workspace',
		);
	});

	it('keeps the files when the command fits', async () => {
		(runsInWindowsShell as jest.Mock).mockReturnValue(false);

		const [args] = await runFiles('jest', 150, escapeRegExpForPath);

		expect(args).toHaveLength(150 + FLAGS.length);
	});

	it('drops the explicit Vitest files of a too long command', async () => {
		(runsInWindowsShell as jest.Mock).mockReturnValue(true);

		const [args] = await runFiles('vitest', 150, (file) => file);

		expect(args).toEqual(['run', ...FLAGS]);
	});

	it('splits too long commands of frameworks that need their files', async () => {
		(runsInWindowsShell as jest.Mock).mockReturnValue(true);

		const runs = await runFiles('playwright', 300, (file) => file);

		// ~18000 characters: four runs of 75 files fit into cmd.exe's limit.
		expect(runs.map((args) => args.length - FLAGS.length)).toEqual([
			75, 75, 75, 75,
		]);
		expect(runs.flatMap((args) => args.slice(0, -FLAGS.length))).toHaveLength(
			300,
		);
		for (const args of runs) {
			expect(`npx --no-install jest ${args.join(' ')}`.length).toBeLessThan(
				7500,
			);
		}
		// Each run reports the results of its own tests only.
		expect(
			(executeTestCommand as jest.Mock).mock.calls.map(
				(call) => call[3].length,
			),
		).toEqual([75, 75, 75, 75]);
	});
});
