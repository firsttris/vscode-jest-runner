import * as vscode from 'vscode';
import { JestResults, JestAssertionResult } from './testResultTypes';
import { TestFrameworkName } from './testDetection/frameworkDefinitions';
import { parseTapOutput } from './parsers/tapParser';
import { logWarning } from './utils/Logger';
import {
  parseJestOutput,
  parseVitestOutput,
} from './parsers/OutputParser';
import {
  findPotentialMatches,
  findBestMatch,
  hasTemplateVariable,
  IndexedResult,
} from './matchers/TestMatcher';
import { parseStructuredResults } from './reporting/structuredOutput';

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
    // Get file path from first test for TAP parsing
    const filePath = tests[0]?.uri?.fsPath || '';
    results = parseTapOutput(output, filePath);
  } else if (framework === 'vitest') {
    results = parseVitestOutput(output);
  } else {
    results = parseJestOutput(output);
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
      const message = new vscode.TestMessage(buildFailureMessage(failedResults));
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

export function processTestResultsFromParsed(
  results: JestResults,
  tests: vscode.TestItem[],
  run: vscode.TestRun,
): void {
  const assertionResults = results?.testResults?.flatMap(
    (r) => r.assertionResults,
  );

  if (!assertionResults) {
    logWarning('No assertion results found in test output');
    tests.forEach((test) => run.skipped(test));
    return;
  }

  tests.reduce((usedIndices, test) => {
    const matches = findPotentialMatches(assertionResults, test);

    if (matches.length === 0) {
      reportTestResult(run, test, undefined);
      return usedIndices;
    }

    const isTemplateWithMultiple =
      hasTemplateVariable(test.label) && matches.length > 1;

    if (isTemplateWithMultiple) {
      reportTemplateTestResult(run, test, matches);
      matches.forEach((m) => usedIndices.add(m.index));
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

  // Look for various failure indicators in output
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

  // Look for pass indicators
  const passIndicators = ['PASS', '✓', '√', 'passed'];
  const hasPassIndicator = passIndicators.some((indicator) =>
    output.includes(indicator),
  );

  // If we have clear pass indicators and no fail indicators, mark as passed
  if (hasPassIndicator && !hasFailIndicator) {
    tests.forEach((test) => run.passed(test));
    return;
  }

  // If we have failure indicators, try to match them to specific tests
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
        // Find relevant error message for this test
        const relevantLines = failLines
          .filter(
            (line) => line.includes(testName) || line.includes(shortName),
          )
          .join('\n');
        run.failed(
          test,
          new vscode.TestMessage(relevantLines || 'Test failed'),
        );
      } else {
        // Can't determine status - mark as errored to indicate parsing issue
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

  // No clear indicators either way - mark as errored, not passed
  // This prevents false positives when JSON parsing fails
  logWarning(
    `No pass/fail indicators found in output. Output preview: ${output.slice(0, 500)}`,
  );
  tests.forEach((test) =>
    run.errored(
      test,
      new vscode.TestMessage(
        'Could not parse test results. Run tests from terminal to see full output.',
      ),
    ),
  );
}
