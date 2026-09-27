import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { cacheManager } from '../cache/CacheManager';
import { getTestFrameworkForFile } from '../testDetection/testFileDetection';
import { TestRunnerConfig } from '../testRunnerConfig';
import { normalizePath } from '../utils/PathUtils';
import {
	Uri,
	WorkspaceConfiguration,
	WorkspaceFolder,
} from './__mocks__/vscode';

/**
 * Test Explorer runs in a monorepo with one sub-project per runner, using
 * real files and real framework detection: runners that look up their
 * config from the working directory (Deno, Playwright) must run from their
 * sub-project, not from the workspace root.
 */
describe('TestRunnerConfig.getTestRunCwd in a monorepo', () => {
	let root: string;
	let config: TestRunnerConfig;
	let settings: Record<string, unknown>;

	const write = (relativePath: string, content: string) => {
		const filePath = path.join(root, relativePath);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, content);
		return filePath;
	};

	const inRoot = (relativePath = '') =>
		normalizePath(path.join(root, relativePath));

	beforeAll(() => {
		root = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'jest-runner-cwd-')),
		);
		write('package.json', JSON.stringify({ name: 'mono', private: true }));

		write(
			'deno-project/deno.json',
			JSON.stringify({ imports: { '@std/assert': 'jsr:@std/assert@1' } }),
		);
		write(
			'deno-project/main.test.ts',
			'import { assertEquals } from "@std/assert";\nDeno.test("add test", () => { assertEquals(1, 1); });\n',
		);
		write(
			'deno-project/tests/nested.test.ts',
			'Deno.test("nested", () => {});\n',
		);

		write('bun-project/bun.lock', '{}');
		write(
			'bun-project/package.json',
			JSON.stringify({ name: 'bun-project', devDependencies: { bun: '1' } }),
		);
		write(
			'bun-project/tests/sum.test.ts',
			'import { expect, test } from "bun:test";\ntest("sum", () => { expect(1).toBe(1); });\n',
		);

		// Like the example project: no lockfile, no package.json.
		write(
			'bun-plain/bun.test.ts',
			'import { expect, test } from "bun:test";\ntest("add", () => { expect(1).toBe(1); });\n',
		);

		write('node-pkg/package.json', JSON.stringify({ name: 'node-pkg' }));
		write(
			'node-pkg/test/a.test.mjs',
			'import { test } from "node:test";\ntest("a", () => {});\n',
		);

		write(
			'e2e/package.json',
			JSON.stringify({
				name: 'e2e',
				devDependencies: { '@playwright/test': '1' },
			}),
		);
		write('e2e/playwright.config.ts', 'export default {};\n');
		write(
			'e2e/tests/home.spec.ts',
			'import { test } from "@playwright/test";\ntest("home", async () => {});\n',
		);

		write(
			'jest-project/package.json',
			JSON.stringify({ name: 'jest-project', devDependencies: { jest: '30' } }),
		);
		write('jest-project/jest.config.js', 'module.exports = {};\n');
		write(
			'jest-project/src/sum.test.js',
			'test("sum", () => { expect(1).toBe(1); });\n',
		);
	});

	afterAll(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	beforeEach(() => {
		cacheManager.invalidateAll();
		settings = {};
		jest
			.spyOn(vscode.workspace, 'getConfiguration')
			.mockImplementation(() => new WorkspaceConfiguration(settings) as any);
		jest
			.spyOn(vscode.workspace, 'getWorkspaceFolder')
			.mockReturnValue(new WorkspaceFolder(new Uri(root) as any) as any);
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			value: [new WorkspaceFolder(new Uri(root) as any)],
			configurable: true,
		});
		config = new TestRunnerConfig();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it.each([
		['deno', 'deno-project/main.test.ts', 'deno-project'],
		['deno', 'deno-project/tests/nested.test.ts', 'deno-project'],
		['bun', 'bun-project/tests/sum.test.ts', 'bun-project'],
		['bun', 'bun-plain/bun.test.ts', ''],
		['node-test', 'node-pkg/test/a.test.mjs', 'node-pkg'],
		['playwright', 'e2e/tests/home.spec.ts', 'e2e'],
		['jest', 'jest-project/src/sum.test.js', 'jest-project'],
	])('runs %s file %s from %s', (framework, file, expectedDir) => {
		const filePath = path.join(root, file);

		expect(getTestFrameworkForFile(filePath)).toBe(framework);
		expect(normalizePath(config.getTestRunCwd(filePath))).toBe(
			inRoot(expectedDir),
		);
	});

	it('runs a runner without config from the nearest package.json', () => {
		const filePath = write(
			'scripts/tool.test.mjs',
			'import { test } from "node:test";\ntest("tool", () => {});\n',
		);

		expect(getTestFrameworkForFile(filePath)).toBe('node-test');
		expect(normalizePath(config.getTestRunCwd(filePath))).toBe(inRoot());
	});

	it('prefers jestrunner.projectPath', () => {
		settings['jestrunner.projectPath'] = 'deno-project';

		expect(
			normalizePath(
				config.getTestRunCwd(path.join(root, 'deno-project/main.test.ts')),
			),
		).toBe(inRoot('deno-project'));
	});
});
