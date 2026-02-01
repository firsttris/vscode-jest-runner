import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface ReporterPaths {
  jest: string;
  vitest: string;
  node: string;
}

let cachedPaths: ReporterPaths | null = null;

const jestReporterSource = String.raw`const START = '@@JTR_START::';
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
`;

const vitestReporterSource = String.raw`const START = '@@JTR_START::';
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

const reporter = {
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
  },
};

module.exports = reporter;
`;

const nodeReporterSource = String.raw`import { TestReporter } from 'node:test/reporters';

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

class StructuredNodeReporter extends TestReporter {
  #assertions = [];
  #files = new Map();

  onTestFinish(test) {
    const file = test.file || 'unknown';
    const ancestors = test.nesting || [];
    const title = test.name || 'unknown';
    const status = test.passed === true ? 'passed' : test.skipped ? 'skipped' : 'failed';
    const failureMessages = test.errors ? test.errors.map((e) => e?.message || String(e)) : undefined;
    const duration = typeof test.duration === 'number' ? test.duration : undefined;

    this.#assertions.push({
      ancestorTitles: ancestors,
      title,
      fullName: [...ancestors, title].join(' '),
      status,
      duration,
      failureMessages,
      location: test.location ? { line: test.location.line, column: test.location.column || 0 } : undefined,
    });

    if (!this.#files.has(file)) {
      this.#files.set(file, []);
    }
    this.#files.get(file).push(this.#assertions[this.#assertions.length - 1]);
  }

  onFinished() {
    const testResults = Array.from(this.#files.entries()).map(([file, assertions]) => {
      const failed = assertions.filter((a) => a.status === 'failed').length;
      const pending = assertions.filter((a) => a.status === 'skipped').length;
      return {
        assertionResults: assertions,
        name: file,
        status: failed > 0 ? 'failed' : 'passed',
        message: '',
        startTime: 0,
        endTime: 0,
        numFailingTests: failed,
        numPendingTests: pending,
        numPassingTests: assertions.filter((a) => a.status === 'passed').length,
      };
    });

    const flat = this.#assertions;
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
}

export default StructuredNodeReporter;
`;

function writeReporterFile(path: string, content: string): void {
  writeFileSync(path, content, 'utf8');
}

export function getReporterPaths(): ReporterPaths {
  if (cachedPaths) return cachedPaths;

  const dir = join(tmpdir(), 'vscode-jest-runner-reporters');
  mkdirSync(dir, { recursive: true });

  const jestPath = join(dir, 'jest-reporter.cjs');
  const vitestPath = join(dir, 'vitest-reporter.cjs');
  const nodePath = join(dir, 'node-reporter.mjs');

  writeReporterFile(jestPath, jestReporterSource);
  writeReporterFile(vitestPath, vitestReporterSource);
  writeReporterFile(nodePath, nodeReporterSource);

  cachedPaths = { jest: jestPath, vitest: vitestPath, node: nodePath };
  return cachedPaths;
}
