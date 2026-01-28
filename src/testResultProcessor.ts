import * as vscode from 'vscode';
import {
  JestResults,
  JestAssertionResult,
} from './testResultTypes';
import {
  logError,
  logWarning,
  resolveTestNameStringInterpolation,
} from './util';
import { TestFrameworkName } from './testDetection/frameworkDefinitions';

export function parseJestOutput(output: string): JestResults | undefined {
  try {
    const trimmed = output.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && 'testResults' in parsed) {
          return parsed;
        }
      } catch (e) {
        logError(`Failed to parse complete output as JSON: ${e}`);
      }
    }

    const jsonRegex = /({"numFailedTestSuites":.*?"wasInterrupted":.*?})/s;
    const jsonMatch = output.match(jsonRegex);

    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }

    const fallbackMatch = output.match(/(\{.*"testResults".*\})/s);
    if (fallbackMatch && fallbackMatch[1]) {
      return JSON.parse(fallbackMatch[1]);
    }

    return undefined;
  } catch (e) {
    logError(`Failed to parse Jest JSON output: ${e}`);
    return undefined;
  }
}

export function parseVitestOutput(output: string): JestResults | undefined {
  try {
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.includes('"testResults"')) {
        try {
          const parsed = JSON.parse(trimmed);
          return convertVitestToJestResults(parsed);
        } catch { }
      }
    }

    const jsonMatch = output.match(/(\{[\s\S]*"testResults"[\s\S]*\})/m);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      return convertVitestToJestResults(parsed);
    }

    return undefined;
  } catch (e) {
    logError(`Failed to parse Vitest JSON output: ${e}`);
    return undefined;
  }
}

export function convertVitestToJestResults(vitestOutput: any): JestResults {
  if (vitestOutput.numFailedTestSuites !== undefined) {
    return vitestOutput as JestResults;
  }

  const results: JestResults = {
    numFailedTestSuites: vitestOutput.numFailedTestSuites || 0,
    numFailedTests: vitestOutput.numFailedTests || 0,
    numPassedTestSuites: vitestOutput.numPassedTestSuites || 0,
    numPassedTests: vitestOutput.numPassedTests || 0,
    numPendingTestSuites: vitestOutput.numPendingTestSuites || 0,
    numPendingTests: vitestOutput.numPendingTests || 0,
    numTotalTestSuites: vitestOutput.numTotalTestSuites || 0,
    numTotalTests: vitestOutput.numTotalTests || 0,
    success: vitestOutput.success ?? vitestOutput.numFailedTests === 0,
    testResults: vitestOutput.testResults || [],
  };

  return results;
}

export function processTestResults(
  output: string,
  tests: vscode.TestItem[],
  run: vscode.TestRun,
  framework: TestFrameworkName,
): void {
  const results =
    framework === 'vitest'
      ? parseVitestOutput(output)
      : parseJestOutput(output);

  if (results) {
    processTestResultsFromParsed(results, tests, run);
  } else {
    processTestResultsFallback(output, tests, run);
  }
}

function matchesTestLabel(resultTitle: string, testLabel: string): boolean {
  if (resultTitle === testLabel) {
    return true;
  }

  const hasTemplateVar = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/i.test(
    testLabel,
  );
  if (hasTemplateVar) {
    const pattern = resolveTestNameStringInterpolation(testLabel);
    try {
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(resultTitle);
    } catch {
      return false;
    }
  }

  return false;
}

type IndexedResult = { result: JestAssertionResult; index: number };

const TEMPLATE_VAR_REGEX = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/i;

const hasTemplateVar = (label: string): boolean =>
  TEMPLATE_VAR_REGEX.test(label);

const getTestName = (test: vscode.TestItem): string =>
  test.label.split(' ').pop() || test.label;

const matchesTest = (r: JestAssertionResult, test: vscode.TestItem): boolean => {
  const testName = getTestName(test);
  const fullPath = r.ancestorTitles?.concat(r.title).join(' ') ?? '';

  const matchesWithSuffix = (actual: string, expected: string) => {
    if (!actual.startsWith(expected)) {
      return false;
    }
    const suffix = actual.slice(expected.length);
    return /^ \(\d+\)$/.test(suffix);
  };

  return (
    matchesTestLabel(r.title, test.label) ||
    matchesTestLabel(r.title, testName) ||
    matchesWithSuffix(r.title, test.label) ||
    matchesWithSuffix(fullPath, test.label) ||
    r.fullName === test.label ||
    matchesTestLabel(fullPath, test.label)
  );
};

const findPotentialMatches = (
  testResults: JestAssertionResult[],
  test: vscode.TestItem,
): IndexedResult[] =>
  testResults
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => matchesTest(result, test));

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

const findBestMatch = (
  matches: IndexedResult[],
  testLine: number | undefined,
  usedIndices: Set<number>,
): IndexedResult | undefined => {
  const isUnused = (m: IndexedResult) => !usedIndices.has(m.index);
  const matchesLine = (m: IndexedResult) =>
    m.result.location?.line === (testLine ?? -1) + 1;

  return (
    matches.find((m) => isUnused(m) && matchesLine(m)) ||
    matches.find(isUnused)
  );
};

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
      run.passed(test);
      break;
    case 'failed':
      run.failed(
        test,
        new vscode.TestMessage(
          result.failureMessages?.join('\n') || 'Test failed',
        ),
      );
      break;
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

  switch (status) {
    case 'failed':
      run.failed(
        test,
        new vscode.TestMessage(
          buildFailureMessage(results.filter((r) => r.status === 'failed')),
        ),
      );
      break;
    case 'passed':
      run.passed(test);
      break;
    default:
      run.skipped(test);
  }
};

function processTestResultsFromParsed(
  results: JestResults,
  tests: vscode.TestItem[],
  run: vscode.TestRun,
): void {
  const assertionResults = results?.testResults?.flatMap((r) => r.assertionResults);

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
      hasTemplateVar(test.label) && matches.length > 1;

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
  logWarning('Failed to parse test results, falling back to simple parsing');

  const hasFail =
    output.includes('FAIL') || output.includes('✗') || output.includes('×');

  if (hasFail) {
    const failLines = output
      .split('\n')
      .filter(
        (line) =>
          line.includes('●') ||
          line.includes('✗') ||
          line.includes('×') ||
          line.includes('AssertionError'),
      );

    tests.forEach((test) => {
      const testFailed = failLines.some(
        (line) =>
          line.includes(test.label) ||
          (test.label.includes(' ') &&
            line.includes(test.label.split(' ').pop() || '')),
      );

      if (testFailed) {
        run.failed(test, new vscode.TestMessage('Test failed'));
      } else {
        run.passed(test);
      }
    });
  } else {
    tests.forEach((test) => run.passed(test));
  }
}
