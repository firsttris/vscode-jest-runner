import { isAbsolute } from 'node:path';
import * as vscode from 'vscode';
import {
	findBestMatch,
	findPotentialMatchesIn,
	hasTemplateVariable,
	type IndexedResult,
} from './matchers/TestMatcher';
import { parseJUnitXML } from './parsers/junitParser';
import { parseJestOutput, parseVitestOutput } from './parsers/OutputParser';
import { parseTapOutput } from './parsers/tapParser';
import { parseStructuredResults } from './reporting/structuredOutput';
import type { TestFrameworkName } from './testDetection/frameworkDefinitions';
import type { JestAssertionResult, JestResults } from './testResultTypes';
import { logWarning } from './utils/Logger';
import { normalizePath } from './utils/PathUtils';

export function processTestResults(
	output: string,
	tests: vscode.TestItem[],
	run: vscode.TestRun,
	framework: TestFrameworkName,
	sessionId?: string,
): void {
	const structured = parseStructuredResults(output, sessionId);
	if (structured) {
		processTestResultsFromParsed(structured, tests, run);
		return;
	}

	let results: JestResults | undefined;

	if (framework === 'node-test') {
		const filePath = tests[0]?.uri?.fsPath || '';
		results = parseTapOutput(output, filePath);
	} else if (framework === 'vitest') {
		results = parseVitestOutput(output);
	} else {
		if (framework === 'bun' || framework === 'deno' || framework === 'rstest') {
			if (output.includes('<testsuites') || output.includes('<testsuite')) {
				results = parseJUnitXML(output);
			}
		}

		if (!results) {
			results = parseJestOutput(output);
		}
	}

	if (results) {
		processTestResultsFromParsed(results, tests, run);
	} else {
		processTestResultsFallback(output, tests, run);
	}
}

const aggregateStatus = (
	results: JestAssertionResult[],
): 'failed' | 'passed' | 'skipped' => {
	const hasFailed = results.some((r) => r.status === 'failed');
	const hasPassed = results.some((r) => r.status === 'passed');
	return hasFailed ? 'failed' : hasPassed ? 'passed' : 'skipped';
};

const buildFailureMessage = (failedResults: JestAssertionResult[]): string =>
	failedResults
		.flatMap((r, i) =>
			(r.failureMessages || ['Test failed']).map(
				(msg) => `[${r.title || i + 1}]: ${msg}`,
			),
		)
		.join('\n\n');

const reportTestResult = (
	run: vscode.TestRun,
	test: vscode.TestItem,
	result: JestAssertionResult | undefined,
): void => {
	if (!result) {
		run.skipped(test);
		return;
	}

	switch (result.status) {
		case 'passed':
			run.passed(test, result.duration);
			break;
		case 'failed': {
			const message = new vscode.TestMessage(
				result.failureMessages?.join('\n') || 'Test failed',
			);
			if (result.location && test.uri) {
				message.location = new vscode.Location(
					test.uri,
					new vscode.Position(result.location.line - 1, result.location.column),
				);
			}
			run.failed(test, message, result.duration);
			break;
		}
		default:
			run.skipped(test);
	}
};

const reportTemplateTestResult = (
	run: vscode.TestRun,
	test: vscode.TestItem,
	matches: IndexedResult[],
): void => {
	const results = matches.map((m) => m.result);
	const status = aggregateStatus(results);
	const totalDuration = results.reduce((sum, r) => sum + (r.duration ?? 0), 0);

	switch (status) {
		case 'failed': {
			const failedResults = results.filter((r) => r.status === 'failed');
			const message = new vscode.TestMessage(
				buildFailureMessage(failedResults),
			);
			const firstFailedWithLocation = failedResults.find((r) => r.location);
			if (firstFailedWithLocation?.location && test.uri) {
				message.location = new vscode.Location(
					test.uri,
					new vscode.Position(
						firstFailedWithLocation.location.line - 1,
						firstFailedWithLocation.location.column,
					),
				);
			}
			run.failed(test, message, totalDuration);
			break;
		}
		case 'passed':
			run.passed(test, totalDuration);
			break;
		default:
			run.skipped(test);
	}
};

type FileIndexedResult = IndexedResult & { file: string };

const toComparablePath = (path: string): string =>
	normalizePath(path).replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * Whether a result's file name refers to `testFile`. Runners report absolute
 * paths, but JUnit reports may use paths relative to the working directory.
 */
const isSameFile = (resultFile: string, testFile: string): boolean => {
	if (!resultFile) return false;
	const result = toComparablePath(resultFile);
	const test = toComparablePath(testFile);
	return (
		result === test || (!isAbsolute(resultFile) && test.endsWith(`/${result}`))
	);
};

/**
 * Tests with the same name in different files must not pick up each other's
 * results, so candidates are limited to the test's own file. Results that
 * cannot be attributed to that file (no or unknown file name, as with TAP or
 * some JUnit reports) fall back to the full result list.
 */
const createCandidateLookup = (
	indexedResults: FileIndexedResult[],
): ((test: vscode.TestItem) => IndexedResult[]) => {
	const byTestFile = new Map<string, IndexedResult[]>();

	return (test) => {
		const testFile = test.uri?.fsPath;
		if (!testFile) return indexedResults;

		let candidates = byTestFile.get(testFile);
		if (!candidates) {
			const ownResults = indexedResults.filter((r) =>
				isSameFile(r.file, testFile),
			);
			candidates = ownResults.length > 0 ? ownResults : indexedResults;
			byTestFile.set(testFile, candidates);
		}
		return candidates;
	};
};

export function processTestResultsFromParsed(
	results: JestResults,
	tests: vscode.TestItem[],
	run: vscode.TestRun,
): void {
	const indexedResults = results?.testResults?.flatMap((fileResult) =>
		(fileResult.assertionResults ?? []).map((result) => ({
			result,
			file: fileResult.name ?? '',
		})),
	);

	if (!indexedResults) {
		logWarning('No assertion results found in test output');
		tests.forEach((test) => void run.skipped(test));
		return;
	}

	const getCandidates = createCandidateLookup(
		indexedResults.map((entry, index) => ({ ...entry, index })),
	);

	tests.reduce((usedIndices, test) => {
		const matches = findPotentialMatchesIn(getCandidates(test), test);

		if (matches.length === 0) {
			reportTestResult(run, test, undefined);
			return usedIndices;
		}

		const isTemplateWithMultiple =
			hasTemplateVariable(test.label) && matches.length > 1;

		if (isTemplateWithMultiple) {
			reportTemplateTestResult(run, test, matches);
			matches.forEach((m) => void usedIndices.add(m.index));
			return usedIndices;
		}

		const bestMatch =
			matches.length === 1
				? matches[0]
				: findBestMatch(matches, test.range?.start.line, usedIndices);

		reportTestResult(run, test, bestMatch?.result);

		if (bestMatch) {
			usedIndices.add(bestMatch.index);
		}

		return usedIndices;
	}, new Set<number>());
}

function processTestResultsFallback(
	output: string,
	tests: vscode.TestItem[],
	run: vscode.TestRun,
): void {
	logWarning('Failed to parse JSON test results, falling back to text parsing');

	const failureIndicators = [
		'FAIL',
		'✗',
		'×',
		'●',
		'FAILED',
		'Error:',
		'AssertionError',
		'expect(',
		'Expected:',
		'Received:',
	];

	const hasFailIndicator = failureIndicators.some((indicator) =>
		output.includes(indicator),
	);

	const passIndicators = ['PASS', '✓', '√', 'passed'];
	const hasPassIndicator = passIndicators.some((indicator) =>
		output.includes(indicator),
	);
	if (hasPassIndicator && !hasFailIndicator) {
		tests.forEach((test) => void run.passed(test));
		return;
	}

	if (hasFailIndicator) {
		const failLines = output
			.split('\n')
			.filter((line) =>
				failureIndicators.some((indicator) => line.includes(indicator)),
			);

		tests.forEach((test) => {
			const testName = test.label;
			const shortName = testName.split(' ').pop() || testName;

			const testFailed = failLines.some(
				(line) => line.includes(testName) || line.includes(shortName),
			);

			if (testFailed) {
				const relevantLines = failLines
					.filter((line) => line.includes(testName) || line.includes(shortName))
					.join('\n');
				run.failed(
					test,
					new vscode.TestMessage(relevantLines || 'Test failed'),
				);
			} else {
				run.errored(
					test,
					new vscode.TestMessage(
						'Could not determine test result. Check Output panel for details.',
					),
				);
			}
		});
		return;
	}

	logWarning(
		`No pass/fail indicators found in output. Output preview: ${output.slice(0, 500)}`,
	);
	tests.forEach(
		(test) =>
			void run.errored(
				test,
				new vscode.TestMessage(
					'Could not parse test results. Run tests from terminal to see full output.',
				),
			),
	);
}
