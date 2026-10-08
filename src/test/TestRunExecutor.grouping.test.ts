import { dirname } from 'node:path';
import type * as vscode from 'vscode';
import type { CoverageProvider } from '../coverageProvider';
import { buildTestArgs } from '../execution/TestArgumentBuilder';
import { collectTestsByFile } from '../execution/TestCollector';
import { executeTestCommand } from '../execution/TestProcessRunner';
import { TestRunExecutor } from '../testController/TestRunExecutor';
import { getTestFrameworkForFile } from '../testDetection/testFileDetection';
import type { TestRunnerConfig } from '../testRunnerConfig';

jest.mock('vscode', () => ({
	workspace: {
		getWorkspaceFolder: jest
			.fn()
			.mockReturnValue({ uri: { fsPath: '/workspace' } }),
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
jest.mock('../execution/TestCollector', () => ({
	...jest.requireActual('../execution/TestCollector'),
	collectTestsByFile: jest.fn(),
}));
jest.mock('../execution/TestArgumentBuilder', () => ({
	buildTestArgs: jest.fn().mockReturnValue([]),
	canUseFastMode: jest.fn().mockReturnValue(false),
}));
jest.mock('../execution/TestProcessRunner', () => ({
	executeTestCommand: jest.fn(),
	executeTestCommandFast: jest.fn(),
	logTestExecution: jest.fn(),
}));
jest.mock('../testDetection/testFileDetection', () => ({
	getTestFrameworkForFile: jest.fn(),
}));

const frameworks: Record<string, string> = {};

/** Number of leaf tests each discovered file item holds. */
const testsInFile: Record<string, number> = {};

const fileItem = (file: string) => {
	const leaves = testsInFile[file] ?? 1;
	return {
		id: file,
		children: {
			size: leaves,
			forEach: (cb: (child: unknown) => void) => {
				for (let i = 0; i < leaves; i++) cb({ children: { size: 0 } });
			},
		},
	};
};

const setRequestedFiles = (files: Record<string, string>) => {
	const testsByFile = new Map<string, unknown[]>();
	for (const [file, framework] of Object.entries(files)) {
		frameworks[file] = framework;
		testsByFile.set(file, [{ id: `${file}:it:1:test`, label: 'test' }]);
	}
	(collectTestsByFile as jest.Mock).mockReturnValue(testsByFile);
};

/** [framework, files, cwd] of every spawned runner process. */
const spawnedRuns = () =>
	(executeTestCommand as jest.Mock).mock.calls.map((call, i) => [
		(buildTestArgs as jest.Mock).mock.calls[i][2],
		(buildTestArgs as jest.Mock).mock.calls[i][0],
		call[5],
	]);

describe('TestRunExecutor grouping', () => {
	let executor: TestRunExecutor;
	let run: { started: jest.Mock; failed: jest.Mock; end: jest.Mock };
	let config: Record<string, jest.Mock>;
	const token = { isCancellationRequested: false } as vscode.CancellationToken;
	const request = {} as vscode.TestRunRequest;

	beforeEach(() => {
		jest.clearAllMocks();
		for (const file of Object.keys(frameworks)) delete frameworks[file];
		for (const file of Object.keys(testsInFile)) delete testsInFile[file];

		(getTestFrameworkForFile as jest.Mock).mockImplementation(
			(file: string) => frameworks[file],
		);
		(executeTestCommand as jest.Mock).mockResolvedValue({
			output: '',
			structuredResultsProcessed: true,
		});

		run = { started: jest.fn(), failed: jest.fn(), end: jest.fn() };
		config = {
			// Each package directory is its own project.
			getTestRunCwd: jest.fn((file: string) => dirname(file)),
			getTestCommand: jest.fn().mockReturnValue('runner'),
			getEnvironmentForRun: jest.fn(),
			getJestConfigPath: jest.fn().mockReturnValue(''),
			getVitestConfigPath: jest.fn().mockReturnValue(''),
			getRstestConfigPath: jest.fn().mockReturnValue(''),
		};

		executor = new TestRunExecutor(
			{
				createTestRun: jest.fn().mockReturnValue(run),
				items: { get: (file: string) => fileItem(file) },
			} as any,
			config as unknown as TestRunnerConfig,
			{} as CoverageProvider,
		);
	});

	it('runs each framework with its own command', async () => {
		setRequestedFiles({
			'/workspace/app/unit.test.ts': 'vitest',
			'/workspace/app/e2e.spec.ts': 'playwright',
		});

		await executor.runHandler(request, token);

		expect(spawnedRuns()).toEqual([
			['vitest', ['/workspace/app/unit.test.ts'], '/workspace/app'],
			['playwright', ['/workspace/app/e2e.spec.ts'], '/workspace/app'],
		]);
		expect(config.getTestCommand).toHaveBeenCalledWith(
			'/workspace/app/e2e.spec.ts',
		);
		expect(run.end).toHaveBeenCalledTimes(1);
	});

	it('runs each package in its own working directory', async () => {
		setRequestedFiles({
			'/workspace/packages/a/a.test.ts': 'jest',
			'/workspace/packages/b/b.test.ts': 'jest',
		});

		await executor.runHandler(request, token);

		expect(spawnedRuns()).toEqual([
			['jest', ['/workspace/packages/a/a.test.ts'], '/workspace/packages/a'],
			['jest', ['/workspace/packages/b/b.test.ts'], '/workspace/packages/b'],
		]);
	});

	it('runs files of the same project in one process', async () => {
		setRequestedFiles({
			'/workspace/app/a.test.ts': 'jest',
			'/workspace/app/b.test.ts': 'jest',
		});

		await executor.runHandler(request, token);

		expect(spawnedRuns()).toEqual([
			[
				'jest',
				['/workspace/app/a.test.ts', '/workspace/app/b.test.ts'],
				'/workspace/app',
			],
		]);
	});

	it('splits files that use different configs', async () => {
		setRequestedFiles({
			'/workspace/app/a.test.ts': 'jest',
			'/workspace/app/b.int.test.ts': 'jest',
		});
		config.getJestConfigPath.mockImplementation((file: string) =>
			file.includes('.int.') ? 'jest.int.config.js' : 'jest.config.js',
		);

		await executor.runHandler(request, token);

		expect(executeTestCommand).toHaveBeenCalledTimes(2);
	});

	it('runs fully selected files apart from partially selected ones', async () => {
		setRequestedFiles({
			'/workspace/app/full.test.ts': 'jest',
			'/workspace/app/partial.test.ts': 'jest',
			'/workspace/app/full2.test.ts': 'jest',
		});
		testsInFile['/workspace/app/partial.test.ts'] = 3;

		await executor.runHandler(request, token);

		expect(spawnedRuns()).toEqual([
			[
				'jest',
				['/workspace/app/full.test.ts', '/workspace/app/full2.test.ts'],
				'/workspace/app',
			],
			['jest', ['/workspace/app/partial.test.ts'], '/workspace/app'],
		]);
	});

	it('keeps partially selected files of other frameworks together', async () => {
		setRequestedFiles({
			'/workspace/app/full.test.ts': 'bun',
			'/workspace/app/partial.test.ts': 'bun',
		});
		testsInFile['/workspace/app/partial.test.ts'] = 3;

		await executor.runHandler(request, token);

		expect(executeTestCommand).toHaveBeenCalledTimes(1);
	});

	it('still runs the other groups when one fails to start', async () => {
		setRequestedFiles({
			'/workspace/packages/a/a.test.ts': 'jest',
			'/workspace/packages/b/b.test.ts': 'jest',
		});
		(executeTestCommand as jest.Mock).mockRejectedValueOnce(
			new Error('spawn failed'),
		);

		await executor.runHandler(request, token);

		expect(executeTestCommand).toHaveBeenCalledTimes(2);
		expect(run.failed).toHaveBeenCalledTimes(1);
		expect(run.failed.mock.calls[0][0].id).toBe(
			'/workspace/packages/a/a.test.ts:it:1:test',
		);
	});
});
