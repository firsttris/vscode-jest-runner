import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { cacheManager } from '../../cache/CacheManager';
import {
	detectFrameworkByPatternMatch,
	fileMatchesPatternsExplicit,
} from '../../testDetection/patternMatching';
import { matchesTestFilePattern } from '../../testDetection/testFileDetection';

jest.mock('vscode');

const DEFAULTS = [
	'**/*.{test,spec}.?(c|m)[jt]s?(x)',
	'**/__tests__/**/*.?(c|m)[jt]s?(x)',
];

let tmp: string;
const write = (rel: string, content: string): string => {
	const p = path.join(tmp, rel);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, content);
	return p;
};

beforeEach(() => {
	tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'detrev-')));
	cacheManager.invalidateAll();
	jest
		.spyOn(vscode.workspace, 'getWorkspaceFolder')
		.mockReturnValue({ uri: vscode.Uri.file(tmp) } as any);
});

afterEach(() => {
	jest.restoreAllMocks();
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe('detection review', () => {
	describe('Jest roots', () => {
		it('does not treat a sibling directory sharing the root name as prefix as inside the root', () => {
			// roots: ['<rootDir>/src'] must not include /project/src-legacy
			const result = fileMatchesPatternsExplicit(
				'/project/src-legacy/a.test.ts',
				'/project',
				DEFAULTS,
				false,
				undefined,
				undefined,
				undefined,
				['<rootDir>/src'],
			);
			expect(result).toBe(false);
		});
	});

	describe('Jest testMatch with <rootDir> and rootDir in dual-config mode', () => {
		it('fileMatchesPatternsExplicit matches a <rootDir> glob when rootDir is given', () => {
			const result = fileMatchesPatternsExplicit(
				'/project/app/unit/a.test.ts',
				'/project',
				['<rootDir>/unit/**/*.test.ts'],
				false,
				'/project/app',
			);
			expect(result).toBe(true);
		});

		it('detectFrameworkByPatternMatch picks Jest for a file matching Jest <rootDir>/... testMatch', () => {
			const jestConfig = write(
				'jest.config.js',
				"module.exports = { rootDir: 'app', testMatch: ['<rootDir>/unit/**/*.test.ts'] };",
			);
			const vitestConfig = write(
				'vitest.config.ts',
				"export default { test: { include: ['e2e/**/*.test.ts'] } };",
			);
			const file = write('app/unit/a.test.ts', '');
			expect(
				detectFrameworkByPatternMatch(tmp, file, jestConfig, vitestConfig),
			).toBe('jest');
		});
	});

	describe('config lookup for content-detected frameworks', () => {
		it('applies the test.exclude of a deno.json in a parent directory', () => {
			write('deno.json', JSON.stringify({ test: { exclude: ['out/**'] } }));
			const file = write('out/foo.test.ts', 'Deno.test("x", () => {});');
			expect(matchesTestFilePattern(file)).toBe(false);
		});
	});

	describe('Playwright testIgnore', () => {
		it('treats a string testIgnore as a glob and excludes matching files', () => {
			write(
				'playwright.config.ts',
				"export default { testIgnore: '**/*.skip.spec.ts' };",
			);
			const file = write(
				'a.skip.spec.ts',
				"import { test } from '@playwright/test';\ntest('x', async () => {});",
			);
			expect(matchesTestFilePattern(file)).toBe(false);
		});
	});
});
