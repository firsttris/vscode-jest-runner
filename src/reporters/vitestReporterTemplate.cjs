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

function collectTests(task, ancestors, out) {
  if (!task) return;
  const nextAncestors = task.name ? [...ancestors, task.name] : ancestors;
  if (task.type === 'test') {
    const res = task.result || {};
    const state = res.state || 'skipped';
    const status = state === 'pass' ? 'passed' : state === 'fail' ? 'failed' : 'skipped';
    out.push({
      ancestorTitles: ancestors,
      title: task.name,
      fullName: nextAncestors.join(' '),
      status,
      duration: res.duration,
      failureMessages: res.errors ? res.errors.map((e) => e?.message || String(e)) : undefined,
      location: task.location ? { line: task.location.line, column: task.location.column || 0 } : undefined,
    });
    return;
  }

  if (task.tasks && Array.isArray(task.tasks)) {
    for (const child of task.tasks) {
      collectTests(child, nextAncestors, out);
    }
  }
}

class VitestStructuredReporter {
  onFinished(files = []) {
    const testResults = files.map((file) => {
      const assertions = [];
      collectTests(file, [], assertions);
      const failed = assertions.filter((a) => a.status === 'failed').length;
      const pending = assertions.filter((a) => a.status === 'skipped').length;
      const passed = assertions.filter((a) => a.status === 'passed').length;
      return {
        assertionResults: assertions,
        name: file.filepath || file.name || '',
        status: failed > 0 ? 'failed' : 'passed',
        message: '',
        startTime: file.result?.startTime || 0,
        endTime: file.result?.endTime || 0,
        numFailingTests: failed,
        numPassingTests: passed,
        numPendingTests: pending,
      };
    });

    const flatAssertions = testResults.flatMap((tr) => tr.assertionResults);
    const payload = {
      numFailedTestSuites: testResults.filter((t) => t.status === 'failed').length,
      numFailedTests: flatAssertions.filter((a) => a.status === 'failed').length,
      numPassedTestSuites: testResults.filter((t) => t.status === 'passed').length,
      numPassedTests: flatAssertions.filter((a) => a.status === 'passed').length,
      numPendingTestSuites: testResults.filter((t) => t.status !== 'passed' && t.status !== 'failed').length,
      numPendingTests: flatAssertions.filter((a) => a.status === 'skipped').length,
      numTotalTestSuites: testResults.length,
      numTotalTests: flatAssertions.length,
      success: flatAssertions.every((a) => a.status === 'passed'),
      testResults,
    };

    emit('results', payload);
  }
}

module.exports = VitestStructuredReporter;
