const START = '@@JTR_START::';
const END = '@@JTR_END::';

const sessionId = process.env.JSTR_SESSION_ID || 'unknown';

function emit(type, payload) {
  try {
    const json = JSON.stringify(payload);
    const len = Buffer.byteLength(json, 'utf8');
    const message = START + sessionId + '::' + type + '::' + len + '::' + json + END + sessionId + '::' + type;
    process.stdout.write(message);
  } catch (err) {
  }
}

class JestStructuredReporter {
  onRunComplete(_contexts, results) {
    const mapped = {
      numFailedTestSuites: results.numFailedTestSuites || 0,
      numFailedTests: results.numFailedTests || 0,
      numPassedTestSuites: results.numPassedTestSuites || 0,
      numPassedTests: results.numPassedTests || 0,
      numPendingTestSuites: results.numPendingTestSuites || 0,
      numPendingTests: results.numPendingTests || 0,
      numTotalTestSuites: results.numTotalTestSuites || 0,
      numTotalTests: results.numTotalTests || 0,
      success: results.success ?? results.numFailedTests === 0,
      testResults: (results.testResults || []).map((fileResult) => ({
        assertionResults: (fileResult.testResults || []).map((assertion) => ({
          ancestorTitles: assertion.ancestorTitles || [],
          title: assertion.title,
          fullName: assertion.fullName || [...(assertion.ancestorTitles || []), assertion.title].join(' '),
          status: assertion.status,
          duration: assertion.duration,
          failureMessages: assertion.failureMessages,
          location: assertion.location || (assertion.line ? { line: assertion.line, column: assertion.column || 0 } : undefined),
        })),
        name: fileResult.name,
        status: fileResult.numFailingTests > 0 ? 'failed' : 'passed',
        message: fileResult.failureMessage || '',
        startTime: fileResult.perfStats?.start || fileResult.perfStats?.startTime || 0,
        endTime: fileResult.perfStats?.end || fileResult.perfStats?.endTime || 0,
      })),
    };

    emit('results', mapped);
  }
}

module.exports = JestStructuredReporter;
