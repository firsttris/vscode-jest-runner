import * as vscode from 'vscode';
import {
  JestResults,
  JestAssertionResult,
} from './testResultTypes';
import {
  logError,
  logWarning,
} from './util';
import { TestFrameworkName } from './testDetection/frameworkDefinitions';

/**
 * Validates that a parsed object looks like Jest test results
 */
function isJestResults(obj: unknown): obj is JestResults {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'testResults' in obj &&
    Array.isArray((obj as JestResults).testResults)
  );
}

/**
 * Extract JSON from mixed stdout output.
 * Nx/monorepo wrappers often prepend log messages before Jest's JSON output.
 * This function finds and extracts the JSON object from the output.
 */
function extractJsonFromOutput(output: string): string | undefined {
  // Try to find the start of Jest JSON output
  // Jest JSON always starts with {"numFailedTestSuites": or {"testResults":
  const jsonPatterns = [
    '{"numFailedTestSuites"',
    '{"testResults"',
    '{"numTotalTestSuites"',
  ];

  for (const pattern of jsonPatterns) {
    const startIndex = output.indexOf(pattern);
    if (startIndex !== -1) {
      // Find the matching closing brace by counting braces
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;

      for (let i = startIndex; i < output.length; i++) {
        const char = output[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\' && inString) {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') braceCount++;
          else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              return output.slice(startIndex, i + 1);
            }
          }
        }
      }
    }
  }

  return undefined;
}

/**
 * Parse Jest JSON output.
 * Handles both clean JSON and mixed output with prepended log messages.
 */
export function parseJestOutput(output: string): JestResults | undefined {
  // First try to parse the whole output as JSON (fast path)
  try {
    const trimmed = output.trim();
    const parsed = JSON.parse(trimmed);
    if (isJestResults(parsed)) {
      return parsed;
    }
  } catch {
    // Not valid JSON, try to extract it
  }

  // Try to extract JSON from mixed output (Nx/monorepo case)
  const extracted = extractJsonFromOutput(output);
  if (extracted) {
    try {
      const parsed = JSON.parse(extracted);
      if (isJestResults(parsed)) {
        return parsed;
      }
    } catch (e) {
      logError(`Failed to parse extracted Jest JSON: ${e}`);
    }
  }

  logWarning('Could not find valid Jest JSON in output');
  return undefined;
}

/**
 * Parse Vitest JSON output.
 * Handles both clean JSON and mixed output with prepended log messages.
 */
export function parseVitestOutput(output: string): JestResults | undefined {
  // First try to parse the whole output as JSON (fast path)
  try {
    const trimmed = output.trim();
    const parsed = JSON.parse(trimmed);
    return convertVitestToJestResults(parsed);
  } catch {
    // Not valid JSON, try to extract it
  }

  // Try to extract JSON from mixed output (Nx/monorepo case)
  const extracted = extractJsonFromOutput(output);
  if (extracted) {
    try {
      const parsed = JSON.parse(extracted);
      return convertVitestToJestResults(parsed);
    } catch (e) {
      logError(`Failed to parse extracted Vitest JSON: ${e}`);
    }
  }

  logWarning('Could not find valid Vitest JSON in output');
  return undefined;
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
    const pattern = escapeRegExpWithTemplateVars(testLabel);
    try {
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(resultTitle);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Escapes regex special characters in the test label while preserving
 * template variable patterns which get replaced with (.*?)
 */
function escapeRegExpWithTemplateVars(testLabel: string): string {
  const templateVarRegex = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/gi;
  const placeholder = '\x00TEMPLATE\x00';
  const templateVars: string[] = [];

  // Replace template vars with placeholders
  const withPlaceholders = testLabel.replace(templateVarRegex, (match) => {
    templateVars.push(match);
    return placeholder;
  });

  // Escape regex special characters in the non-template parts
  const escaped = withPlaceholders.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Replace placeholders back with (.*?)
  let result = escaped;
  for (let i = 0; i < templateVars.length; i++) {
    result = result.replace(placeholder, '(.*?)');
  }

  return result;
}

type IndexedResult = { result: JestAssertionResult; index: number };

const TEMPLATE_VAR_REGEX = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/i;

const hasTemplateVar = (label: string): boolean =>
  TEMPLATE_VAR_REGEX.test(label);

/**
 * Checks if the string is ONLY a template variable (e.g., "%d", "$foo")
 * which would result in a regex that matches everything.
 */
const isOnlyTemplateVar = (label: string): boolean => {
  const trimmed = label.trim();
  return /^(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])$/i.test(trimmed);
};

/**
 * Gets the ancestor titles (parent describe blocks) from a TestItem's hierarchy.
 */
const getAncestorTitles = (test: vscode.TestItem): string[] => {
  const titles: string[] = [];
  let parent = test.parent;
  while (parent) {
    // Skip file-level items (they have a URI that matches their id)
    if (parent.uri && parent.id !== parent.uri.fsPath) {
      titles.unshift(parent.label);
    }
    parent = parent.parent;
  }
  return titles;
};

/**
 * Checks if the result's ancestorTitles match the test's ancestor hierarchy.
 * Used for template-only labels where we can't match by test name.
 */
const matchesByAncestors = (r: JestAssertionResult, test: vscode.TestItem): boolean => {
  const testAncestors = getAncestorTitles(test);
  const resultAncestors = r.ancestorTitles ?? [];

  // If test has no ancestors, only match if result also has no ancestors
  // (single test at file level)
  if (testAncestors.length === 0) {
    return resultAncestors.length === 0;
  }

  // Check if result ancestors end with the test ancestors
  // This handles nested describes where result might have more ancestors
  if (resultAncestors.length < testAncestors.length) {
    return false;
  }

  // Compare from the end (most specific ancestor)
  const offset = resultAncestors.length - testAncestors.length;
  return testAncestors.every((title, i) => resultAncestors[offset + i] === title);
};

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

  // For template-only labels (e.g., "$description"), match by ancestor titles
  // instead of by regex which would match everything
  if (isOnlyTemplateVar(test.label)) {
    return matchesByAncestors(r, test);
  }

  // Skip testName matching if it's only a template variable (would match everything)
  const testNameMatches = !isOnlyTemplateVar(testName) && matchesTestLabel(r.title, testName);

  return (
    matchesTestLabel(r.title, test.label) ||
    testNameMatches ||
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
          .filter((line) => line.includes(testName) || line.includes(shortName))
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
