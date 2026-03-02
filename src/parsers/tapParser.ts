import type {
  JestAssertionResult,
  JestFileResult,
  JestResults,
} from '../testResultTypes';

interface TapStackItem {
  name: string;
  indent: number;
  hasChildren: boolean;
}

interface TapTestResult {
  ok: boolean;
  name: string;
  ancestorTitles: string[];
  directive?: 'skip' | 'todo';
  directiveReason?: string;
  diagnostic?: Record<string, string>;
}

export function parseTapOutput(output: string, filePath: string): JestResults {
  const lines = output.split('\n');
  const results: TapTestResult[] = [];
  const stack: TapStackItem[] = [];

  let currentDiagnostic: string[] = [];
  let inDiagnostic = false;
  let lastResultIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const trimmedLine = line.trim();

    if (trimmedLine === '---') {
      inDiagnostic = true;
      continue;
    }
    if (trimmedLine === '...') {
      if (inDiagnostic && lastResultIndex >= 0) {
        results[lastResultIndex].diagnostic = parseYamlDiagnostic(
          currentDiagnostic.join('\n'),
        );
        currentDiagnostic = [];
      }
      inDiagnostic = false;
      continue;
    }
    if (inDiagnostic) {
      if (lastResultIndex >= 0) {
        currentDiagnostic.push(trimmedLine);
      }
      continue;
    }

    const subtestMatch = trimmedLine.match(/^# Subtest: (.+)$/);
    if (subtestMatch) {
      const name = subtestMatch[1].trim();
      stack.push({ name, indent, hasChildren: false });
      continue;
    }

    const resultMatch = trimmedLine.match(
      /^(not )?ok\s+(?:\d+)\s*(?:-\s*(.+?))?(?:\s+#\s*(SKIP|TODO)(?:\s+(.*))?)?$/i,
    );
    if (resultMatch) {
      const [, notOk, rawName, directive, directiveReason] = resultMatch;
      const ok = !notOk;
      const name = rawName?.trim() || 'unknown';
      let matchedStackItem = false;
      if (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (name === top.name) {
          const item = stack.pop()!;
          matchedStackItem = true;

          if (!item.hasChildren) {
            results.push({
              ok,
              name: item.name,
              ancestorTitles: stack.map((s) => s.name),
              directive: directive?.toLowerCase() as
                | 'skip'
                | 'todo'
                | undefined,
              directiveReason: directiveReason?.trim(),
            });
            lastResultIndex = results.length - 1;
          } else {
            lastResultIndex = -1;
          }

          if (stack.length > 0) {
            stack[stack.length - 1].hasChildren = true;
          }
        }
      }

      if (!matchedStackItem) {
        results.push({
          ok,
          name,
          ancestorTitles: stack.map((s) => s.name),
          directive: directive?.toLowerCase() as 'skip' | 'todo' | undefined,
          directiveReason: directiveReason?.trim(),
        });
        lastResultIndex = results.length - 1;

        if (stack.length > 0) {
          stack[stack.length - 1].hasChildren = true;
        }
      }
    }
  }

  return convertTapToJestResults(results, filePath);
}

function parseYamlDiagnostic(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentValue: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*(\w+):\s*(.*)$/);
    if (match) {
      if (currentKey !== null) {
        result[currentKey] = currentValue.join('\n').trim();
      }
      const [, key, value] = match;
      currentKey = key;
      if (value === '|-' || value === '|') {
        currentValue = [];
      } else {
        currentValue = [value.replace(/^['"]|['"]$/g, '')];
      }
      continue;
    }
    if (currentKey !== null) {
      currentValue.push(line);
    }
  }
  if (currentKey !== null) {
    result[currentKey] = currentValue.join('\n').trim();
  }
  return result;
}

function convertTapToJestResults(
  tapResults: TapTestResult[],
  filePath: string,
): JestResults {
  const assertionResults: JestAssertionResult[] = tapResults.map((tap) => {
    let status: JestAssertionResult['status'];
    if (tap.directive === 'skip') status = 'skipped';
    else if (tap.directive === 'todo') status = 'todo';
    else if (tap.ok) status = 'passed';
    else status = 'failed';

    const failureMessages: string[] = [];
    if (!tap.ok && tap.diagnostic) {
      if (tap.diagnostic.error) failureMessages.push(tap.diagnostic.error);
      if (tap.diagnostic.message) failureMessages.push(tap.diagnostic.message);
      if (tap.diagnostic.stack) failureMessages.push(tap.diagnostic.stack);
      if (failureMessages.length === 0) {
        const rawDiag = Object.entries(tap.diagnostic)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
        if (rawDiag) failureMessages.push(rawDiag);
      }
    }

    return {
      ancestorTitles: tap.ancestorTitles,
      title: tap.name,
      fullName: [...tap.ancestorTitles, tap.name].join(' '),
      status,
      duration: tap.diagnostic?.duration_ms
        ? Number.parseFloat(tap.diagnostic.duration_ms)
        : undefined,
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
  const skipped = assertionResults.filter(
    (r) => r.status === 'skipped' || r.status === 'todo',
  ).length;

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
    testResults: [
      {
        assertionResults,
        name: filePath,
        status: failed > 0 ? 'failed' : 'passed',
        message: '',
        startTime: Date.now(),
        endTime: Date.now(),
      },
    ],
  };
}
