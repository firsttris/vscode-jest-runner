const START = '@@JTR_START::';
const END = '@@JTR_END::';
const sessionId = process.env.JSTR_SESSION_ID || 'unknown';

function emit(type, payload) {
  try {
    const json = JSON.stringify(payload);
    const len = Buffer.byteLength(json, 'utf8');
    const message = START + sessionId + '::' + type + '::' + len + '::' + json + END + sessionId + '::' + type;
    process.stdout.write(message);
  } catch (err) {}
}

function extractErrorMessage(details) {
  if (!details) return undefined;
  
  const error = details.error;
  if (!error) return undefined;
  
  // Build a comprehensive error message
  const parts = [];
  
  // Extract cause information (assertion details)
  const cause = error.cause;
  if (cause) {
    // For assertion errors, show expected/received first
    if (cause.code === 'ERR_ASSERTION') {
      const actual = cause.actual !== undefined ? JSON.stringify(cause.actual) : undefined;
      const expected = cause.expected !== undefined ? JSON.stringify(cause.expected) : undefined;
      const operator = cause.operator;
      if (actual !== undefined && expected !== undefined) {
        parts.push(`Expected: ${expected}`);
        parts.push(`Received: ${actual}`);
        if (operator) {
          parts.push(`Operator: ${operator}`);
        }
        parts.push(''); // blank line before stack
      }
    }
    // Include stack trace (which includes the message)
    if (cause.stack) {
      parts.push(cause.stack);
    } else if (cause.message) {
      parts.push(cause.message);
    }
  } else if (error.stack) {
    // Fallback to error stack if no cause
    parts.push(error.stack);
  } else if (error.message) {
    parts.push(error.message);
  } else if (error.failureType) {
    parts.push(`Failure type: ${error.failureType}`);
  }
  
  return parts.length > 0 ? parts.join('\n') : undefined;
}

export default async function*(source) {
  const assertions = [];
  const files = new Map();

  const record = (test, status, failureMessage, durationMs) => {
    const file = test?.file || 'unknown';
    const ancestors = Array.isArray(test?.nesting) ? test.nesting : [];
    const title = test?.name || 'unknown';
    const duration = durationMs ?? (typeof test?.duration === 'number' ? test.duration : undefined);
    const failureMessages = failureMessage ? [failureMessage] : undefined;
    // Location from test data (line/column at top level)
    const location = test?.line && typeof test.line === 'number'
      ? { line: test.line, column: test.column || 0 }
      : undefined;

    const assertion = {
      ancestorTitles: ancestors,
      title,
      fullName: [...ancestors, title].join(' '),
      status,
      duration,
      failureMessages,
      location,
    };

    assertions.push(assertion);

    if (!files.has(file)) {
      files.set(file, []);
    }
    files.get(file).push(assertion);
  };

  for await (const event of source) {
    try {
      switch (event?.type) {
        case 'test:pass': {
          const data = event.data || {};
          const duration = data.details?.duration_ms;
          record(data, 'passed', undefined, duration);
          break;
        }
        case 'test:fail': {
          const data = event.data || {};
          const errorMsg = extractErrorMessage(data.details);
          const duration = data.details?.duration_ms;
          record(data, 'failed', errorMsg, duration);
          break;
        }
        case 'test:skip':
        case 'test:todo':
          record(event.data, 'skipped');
          break;
        default:
          break;
      }
    } catch (err) {}
  }

  // Stream has ended - emit final results
  const testResults = Array.from(files.entries()).map(([file, fileAssertions]) => {
    const failed = fileAssertions.filter((a) => a.status === 'failed').length;
    const pending = fileAssertions.filter((a) => a.status === 'skipped').length;
    return {
      assertionResults: fileAssertions,
      name: file,
      status: failed > 0 ? 'failed' : 'passed',
      message: '',
      startTime: 0,
      endTime: 0,
      numFailingTests: failed,
      numPendingTests: pending,
      numPassingTests: fileAssertions.filter((a) => a.status === 'passed').length,
    };
  });

  const flat = assertions;
  const payload = {
    numFailedTestSuites: testResults.filter((t) => t.status === 'failed').length,
    numFailedTests: flat.filter((a) => a.status === 'failed').length,
    numPassedTestSuites: testResults.filter((t) => t.status === 'passed').length,
    numPassedTests: flat.filter((a) => a.status === 'passed').length,
    numPendingTestSuites: testResults.filter((t) => t.status !== 'passed' && t.status !== 'failed').length,
    numPendingTests: flat.filter((a) => a.status === 'skipped').length,
    numTotalTestSuites: testResults.length,
    numTotalTests: flat.length,
    success: flat.every((a) => a.status === 'passed'),
    testResults,
  };

  emit('results', payload);
}
