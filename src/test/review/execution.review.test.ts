import type * as vscode from 'vscode';
import { buildTestArgs } from '../../execution/TestArgumentBuilder';
import { getFrameworkAdapter } from '../../frameworkAdapters';
import type { TestRunnerConfig } from '../../testRunnerConfig';
import { normalizeArgsForNonShellSpawn } from '../../utils/ShellUtils';

/**
 * Deno's `--filter` semantics (cli/tools/test/mod.rs, TestFilter::from_flag):
 * a value wrapped in slashes is a regex, anything else a plain substring.
 */
const denoFilterMatches = (filter: string, testName: string): boolean => {
	if (filter.startsWith('/') && filter.endsWith('/')) {
		return new RegExp(filter.slice(1, -1)).test(testName);
	}
	return testName.includes(filter);
};

interface FakeTestItem {
	id: string;
	label: string;
	uri?: { fsPath: string };
	parent?: FakeTestItem;
	children: {
		size: number;
		forEach: (callback: (item: FakeTestItem) => void) => void;
	};
}

const makeItem = (
	id: string,
	label: string,
	children: FakeTestItem[] = [],
): FakeTestItem => {
	const item: FakeTestItem = {
		id,
		label,
		children: {
			size: children.length,
			forEach: (callback) => children.forEach(callback),
		},
	};
	children.forEach((child) => {
		child.parent = item;
	});
	return item;
};

describe('execution review', () => {
	describe('Deno test name filter', () => {
		it('single-test filter of the deno adapter matches the selected test', () => {
			const args = getFrameworkAdapter('deno').buildArgs(
				'/project/math_test.ts',
				'adds numbers',
				false,
				[],
				'',
				null,
			);
			const filter = args[args.indexOf('--filter') + 1];

			expect(denoFilterMatches(filter, 'adds numbers')).toBe(true);
		});

		it('batched filter for partially selected deno files matches the selected tests', () => {
			const file = '/project/math_test.ts';
			const a = makeItem(`${file}:it:1:adds numbers`, 'adds numbers');
			const b = makeItem(`${file}:it:5:subtracts`, 'subtracts');
			const c = makeItem(`${file}:it:9:multiplies`, 'multiplies');
			const fileItem = makeItem(file, 'math_test.ts', [a, b, c]);
			const controller = {
				items: { get: () => fileItem },
			} as unknown as vscode.TestController;

			const args = buildTestArgs(
				[file],
				new Map([[file, [a, b] as unknown as vscode.TestItem[]]]),
				'deno',
				[],
				false,
				{} as TestRunnerConfig,
				controller,
			);
			// The spawn path unquotes the args before passing them on.
			const spawned = normalizeArgsForNonShellSpawn(args);
			const filter = spawned[spawned.indexOf('--filter') + 1];

			expect(denoFilterMatches(filter, 'adds numbers')).toBe(true);
			expect(denoFilterMatches(filter, 'subtracts')).toBe(true);
			expect(denoFilterMatches(filter, 'multiplies')).toBe(false);
		});
	});

	describe('run options with flag values', () => {
		it('keeps every value of playwrightRunOptions such as --workers 1 --retries 1', () => {
			const args = getFrameworkAdapter('playwright').buildArgs(
				'/project/e2e/login.spec.ts',
				undefined,
				false,
				[],
				'',
				['--workers', '1', '--retries', '1'],
			);

			expect(args).toEqual([
				'test',
				'--workers',
				'1',
				'--retries',
				'1',
				'/project/e2e/login.spec.ts',
			]);
		});
	});

	describe('Test Explorer run of a fully selected Jest file', () => {
		it('passes jestrunner.runOptions like a partial run does', () => {
			const file = '/project/src/math.test.ts';
			const leaf = makeItem(`${file}:it:1:adds`, 'adds');
			const fileItem = makeItem(file, 'math.test.ts', [leaf]);
			const controller = {
				items: { get: () => fileItem },
			} as unknown as vscode.TestController;
			const config = {
				getJestConfigPath: () => '',
				runOptions: ['--testTimeout=60000'],
			} as unknown as TestRunnerConfig;

			const args = buildTestArgs(
				[file],
				new Map([[file, [leaf] as unknown as vscode.TestItem[]]]),
				'jest',
				[],
				false,
				config,
				controller,
			);

			expect(args).toContain('--testTimeout=60000');
		});
	});
});

describe('Windows command parsing', () => {
	it('keeps a $ in the quoted binary path of the default command (e.g. D:\\work\\$monorepo)', () => {
		jest.isolateModules(() => {
			jest.doMock('../../utils/PathUtils', () => ({
				...jest.requireActual('../../utils/PathUtils'),
				isWindows: () => true,
			}));
			const { parseCommandAndEnv } = require('../../utils/ShellUtils');
			const { quote } = require('../../utils/TestNameUtils');
			const binaryPath =
				'D:\\work\\$monorepo\\node_modules\\jest\\bin\\jest.js';
			// What TestRunnerConfig.resolveNodeCommand builds on Windows.
			const command = `node ${quote(binaryPath)}`;

			expect(parseCommandAndEnv(command)).toEqual({
				env: {},
				executable: 'node',
				args: [binaryPath],
			});
		});
	});
});
