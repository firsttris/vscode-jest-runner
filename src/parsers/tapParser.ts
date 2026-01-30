import type { JestAssertionResult, JestFileResult, JestResults } from '../testResultTypes';

interface TapTestResult {
  ok: boolean;
  id: number;
  name: string;
  directive?: 'skip' | 'todo';
  directiveReason?: string;
  diagnostic?: Record<string, string>;
}

/**
 * Parse TAP (Test Anything Protocol) output from Node.js test runner
 * and convert it to JestResults format for consistent result processing
 */
export function parseTapOutput(output: string, filePath: string): JestResults {
  const lines = output.split('\n');
  const results: TapTestResult[] = [];
  let currentDiagnostic: string[] = [];
  let inDiagnostic = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // TAP test line: "ok 1 - test name" or "not ok 2 - test name"
    // With optional directive: "ok 1 - test name # SKIP reason" or "# TODO"
    const testMatch = line.match(
      /^(not )?ok\s+(\d+)\s*(?:-\s*(.+?))?(?:\s+#\s*(SKIP|TODO)(?:\s+(.*))?)?$/i,
    );

    if (testMatch) {
      // Save diagnostic for previous test if any
      if (inDiagnostic && results.length > 0) {
        results[results.length - 1].diagnostic = parseYamlDiagnostic(currentDiagnostic.join('\n'));
        currentDiagnostic = [];
        inDiagnostic = false;
      }

      const [, notOk, id, name, directive, directiveReason] = testMatch;
      results.push({
        ok: !notOk,
        id: Number.parseInt(id, 10),
        name: name?.trim() || `Test ${id}`,
        directive: directive?.toLowerCase() as 'skip' | 'todo' | undefined,
        directiveReason: directiveReason?.trim(),
      });
      continue;
    }

    // YAML diagnostic block start
    if (line.trim() === '---') {
      inDiagnostic = true;
      continue;
    }

    // YAML diagnostic block end
    if (line.trim() === '...') {
      if (inDiagnostic && results.length > 0) {
        results[results.length - 1].diagnostic = parseYamlDiagnostic(currentDiagnostic.join('\n'));
        currentDiagnostic = [];
      }
      inDiagnostic = false;
      continue;
    }

    // Collect diagnostic lines
    if (inDiagnostic) {
      currentDiagnostic.push(line);
    }
  }

  // Handle any remaining diagnostic
  if (inDiagnostic && results.length > 0 && currentDiagnostic.length > 0) {
    results[results.length - 1].diagnostic = parseYamlDiagnostic(currentDiagnostic.join('\n'));
  }

  return convertTapToJestResults(results, filePath);
}

/**
 * Simple YAML parsing for TAP diagnostics
 * Handles basic key-value pairs in diagnostic blocks
 */
function parseYamlDiagnostic(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentValue: string[] = [];

  for (const line of lines) {
    // Simple key-value: "key: value"
    const match = line.match(/^\s{2}(\w+):\s*(.*)$/);
    if (match) {
      // Save previous key-value if any
      if (currentKey !== null) {
        result[currentKey] = currentValue.join('\n').trim();
      }

      const [, key, value] = match;
      currentKey = key;

      // Check for multi-line value starting with |
      if (value === '|-' || value === '|') {
        currentValue = [];
      } else {
        currentValue = [value.replace(/^['"]|['"]$/g, '')];
      }
      continue;
    }

    // Multi-line value continuation
    if (currentKey !== null && line.startsWith('    ')) {
      currentValue.push(line.substring(4));
    }
  }

  // Save last key-value
  if (currentKey !== null) {
    result[currentKey] = currentValue.join('\n').trim();
  }

  return result;
}

/**
 * Convert TAP results to Jest-compatible format
 */
function convertTapToJestResults(tapResults: TapTestResult[], filePath: string): JestResults {
  const assertionResults: JestAssertionResult[] = tapResults.map((tap) => {
    let status: JestAssertionResult['status'];

    if (tap.directive === 'skip') {
      status = 'skipped';
    } else if (tap.directive === 'todo') {
      status = 'todo';
    } else if (tap.ok) {
      status = 'passed';
    } else {
      status = 'failed';
    }

    const failureMessages: string[] = [];
    if (!tap.ok && tap.diagnostic) {
      if (tap.diagnostic.error) failureMessages.push(tap.diagnostic.error);
      if (tap.diagnostic.message) failureMessages.push(tap.diagnostic.message);
      if (tap.diagnostic.stack) failureMessages.push(tap.diagnostic.stack);
      // If no specific error info, use the raw diagnostic
      if (failureMessages.length === 0) {
        const rawDiag = Object.entries(tap.diagnostic)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
        if (rawDiag) failureMessages.push(rawDiag);
      }
    }

    // Parse test name to extract ancestor titles
    // Node.js test runner format with describe blocks: "describe name > test name"
    const nameParts = tap.name.split(' > ');
    const title = nameParts.pop() || tap.name;
    const ancestorTitles = nameParts;

    return {
      ancestorTitles,
      title,
      fullName: tap.name,
      status,
      duration: tap.diagnostic?.duration_ms ? Number.parseFloat(tap.diagnostic.duration_ms) : undefined,
      failureMessages: failureMessages.length > 0 ? failureMessages : undefined,
      location: tap.diagnostic?.line
        ? {
            line: Number.parseInt(tap.diagnostic.line, 10),
            column: Number.parseInt(tap.diagnostic.column || '0', 10),
          }
        : undefined,
    };
  });

  const passed = assertionResults.filter((r) => r.status === 'passed').length;
  const failed = assertionResults.filter((r) => r.status === 'failed').length;
  const skipped = assertionResults.filter((r) => r.status === 'skipped' || r.status === 'todo').length;

  const testResult: JestFileResult = {
    assertionResults,
    name: filePath,
    status: failed > 0 ? 'failed' : 'passed',
    message: '',
    startTime: Date.now(),
    endTime: Date.now(),
  };

  return {
    numFailedTestSuites: failed > 0 ? 1 : 0,
    numFailedTests: failed,
    numPassedTestSuites: failed === 0 ? 1 : 0,
    numPassedTests: passed,
    numPendingTestSuites: 0,
    numPendingTests: skipped,
    numTotalTestSuites: 1,
    numTotalTests: assertionResults.length,
    success: failed === 0,
    testResults: [testResult],
  };
}
