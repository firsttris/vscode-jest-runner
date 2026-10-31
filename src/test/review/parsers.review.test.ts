import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../parser';
import { processTestResultsFromParsed } from '../../testResultProcessor';
import { parseStructuredResults } from '../../reporting/structuredOutput';
import { TestItem, TestRun, Uri } from '../__mocks__/vscode';

jest.mock('vscode');

const names = (code: string): string[] =>
	(parse('review.test.ts', code).root.children ?? []).map(
		(c: any) => c.name as string,
	);

describe('review: it.each title expansion matches Jest', () => {
	it('replaces $# with the row index in object tables', () => {
		// Jest docs: "$# to inject the index of the test case"
		expect(
			names(`it.each([{ a: 1 }, { a: 2 }])('case $# has $a', ({ a }) => {});`),
		).toEqual(['case 0 has 1', 'case 1 has 2']);
	});

	it('resolves $key.path into nested object values', () => {
		// Jest docs: "$variable.path.to.value" injects nested values
		expect(
			names(`it.each([{ user: { name: 'ann' } }])('greets $user.name', () => {});`),
		).toEqual(['greets ann']);
	});

	it('pretty-formats strings for %p (quoted, like Jest)', () => {
		expect(names(`it.each(['a', 'b'])('value %p', (v) => {});`)).toEqual([
			'value "a"',
			'value "b"',
		]);
	});

	it('formats %d like util.format (no truncation of decimals)', () => {
		expect(names(`it.each([1.5])('value %d', (v) => {});`)).toEqual([
			'value 1.5',
		]);
	});

	it('turns %% into a single percent sign', () => {
		expect(names(`it.each([50])('%i%% done', (v) => {});`)).toEqual([
			'50% done',
		]);
	});
});

describe('review: astToValue with spread elements in each tables', () => {
	it('spreads a resolvable array binding into the table', () => {
		expect(
			names("const base = [1, 2];\nit.each([...base, 3])('n %i', (v) => {});"),
		).toEqual(['n 1', 'n 2', 'n 3']);
	});

	it('does not invent a bogus row for an unresolvable spread', () => {
		// Same as an unresolvable table (it.each(getCases())): keep the template.
		expect(names("it.each(getCases())('n %s', (v) => {});")).toEqual(['n %s']);
		expect(names("it.each([...getCases()])('n %s', (v) => {});")).toEqual([
			'n %s',
		]);
	});
});

describe('review: result matching for unresolved template-literal names', () => {
	it('matches results of a forEach test named with ${obj.prop}', () => {
		const file = '/proj/cases.test.ts';
		// The parser keeps the unresolved template source as the label.
		const [label] = names(
			'getCases().forEach((c) => {\n  it(`handles ${c.title}`, () => {});\n});',
		);
		expect(label).toBe('handles ${c.title}');
		const test = new TestItem(`${file}:it:2:${label}`, label, Uri.file(file));
		const run = new TestRun();
		processTestResultsFromParsed(
			{
				numFailedTestSuites: 1,
				numFailedTests: 1,
				numPassedTestSuites: 0,
				numPassedTests: 1,
				numPendingTestSuites: 0,
				numPendingTests: 0,
				numTotalTestSuites: 1,
				numTotalTests: 2,
				success: false,
				testResults: [
					{
						name: file,
						status: 'failed',
						message: '',
						startTime: 0,
						endTime: 0,
						assertionResults: [
							{ title: 'handles a', ancestorTitles: [], status: 'passed' },
							{
								title: 'handles b',
								ancestorTitles: [],
								status: 'failed',
								failureMessages: ['boom'],
							},
						],
					},
				],
			},
			[test] as any,
			run as any,
		);
		expect(run.skipped).not.toHaveBeenCalled();
		expect(run.failed).toHaveBeenCalledWith(
			test,
			expect.anything(),
			expect.anything(),
		);
	});
});

describe('review: node:test structured reporter', () => {
	it('reports describe names as ancestorTitles and does not count suites as tests', () => {
		const dir = mkdtempSync(join(tmpdir(), 'jtr-node-review-'));
		try {
			copyFileSync(
				join(__dirname, '../../reporters/nodeReporterTemplate.js'),
				join(dir, 'rep.mjs'),
			);
			writeFileSync(
				join(dir, 'a.test.mjs'),
				[
					"import { describe, it } from 'node:test';",
					"describe('A', () => { it('works', () => {}); });",
				].join('\n'),
			);
			const res = spawnSync(
				process.execPath,
				[
					'--test',
					'--test-reporter=./rep.mjs',
					'--test-reporter-destination=stdout',
					'a.test.mjs',
				],
				{ cwd: dir, encoding: 'utf8', env: { ...process.env, JSTR_SESSION_ID: 's1' } },
			);
			const results = parseStructuredResults(res.stdout, 's1');
			const assertions = results?.testResults.flatMap((f) => f.assertionResults);
			expect(assertions?.map((a) => [a.ancestorTitles, a.title])).toEqual([
				[['A'], 'works'],
			]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
