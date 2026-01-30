import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { escapeRegExp, updateTestNameIfUsingProperties, logInfo, logDebug, normalizePath } from './util';
import { TestRunnerConfig } from './testRunnerConfig';
import { stripAnsi } from './util';

/**
 * Fast test execution for single tests - uses exit code instead of JSON parsing.
 * This is significantly faster as it skips JSON serialization/parsing overhead.
 */
export function executeTestCommandFast(
  command: string,
  args: string[],
  token: vscode.CancellationToken,
  test: vscode.TestItem,
  run: vscode.TestRun,
  cwd: string,
  additionalEnv?: Record<string, string>,
): Promise<void> {
  return new Promise((resolve) => {
    const jestProcess = spawn(command, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: 'true', ...additionalEnv },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    jestProcess.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      // Stream output with colors to the test output panel
      run.appendOutput(chunk.replace(/\n/g, '\r\n'));
    });

    jestProcess.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      run.appendOutput(chunk.replace(/\n/g, '\r\n'));
    });

    jestProcess.on('error', (error) => {
      run.failed(
        test,
        new vscode.TestMessage(`Failed to execute test runner: ${error.message}`),
      );
      resolve();
    });

    jestProcess.on('close', (code) => {
      cancellationListener.dispose();

      if (token.isCancellationRequested) {
        run.skipped(test);
        resolve();
        return;
      }

      // Exit code 0 = passed, non-zero = failed
      if (code === 0) {
        run.passed(test);
      } else {
        const errorOutput = stderr || stdout || 'Test failed';
        const cleanError = stripAnsi(errorOutput);
        run.failed(test, new vscode.TestMessage(cleanError));
      }
      resolve();
    });

    const cancellationListener = token.onCancellationRequested(() => {
      jestProcess.kill();
      run.skipped(test);
      resolve();
    });
  });
}

export function executeTestCommand(
  command: string,
  args: string[],
  token: vscode.CancellationToken,
  tests: vscode.TestItem[],
  run: vscode.TestRun,
  cwd: string,
  additionalEnv?: Record<string, string>,
): Promise<string | null> {
  return new Promise((resolve) => {
    const maxBufferSize =
      vscode.workspace
        .getConfiguration('jestrunner')
        .get<number>('maxBufferSize', 50) *
      1024 *
      1024;

    const jestProcess = spawn(command, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: 'true', ...additionalEnv },
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const checkBufferSize = (
      buffer: string,
      chunk: string,
      errorMsg: string,
    ): boolean => {
      if (buffer.length + chunk.length > maxBufferSize) {
        killed = true;
        jestProcess.kill();
        tests.forEach((test) => run.failed(test, new vscode.TestMessage(errorMsg)));
        resolve(null);
        return true;
      }
      return false;
    };

    jestProcess.stdout?.on('data', (data) => {
      if (killed) return;
      const chunk = data.toString();
      if (!checkBufferSize(stdout, chunk, 'Test output exceeded maximum buffer size')) {
        stdout += chunk;
      }
    });

    jestProcess.stderr?.on('data', (data) => {
      if (killed) return;
      const chunk = data.toString();
      if (!checkBufferSize(stderr, chunk, 'Error output exceeded maximum buffer size')) {
        stderr += chunk;
      }
    });

    jestProcess.on('error', (error) => {
      tests.forEach((test) =>
        run.failed(
          test,
          new vscode.TestMessage(`Failed to execute test runner: ${error.message}`),
        ),
      );
      resolve(null);
    });

    jestProcess.on('close', () => {
      cancellationListener.dispose();

      if (token.isCancellationRequested) {
        tests.forEach((test) => run.skipped(test));
        resolve(null);
        return;
      }

      // Parse from stdout/stderr - JSON extraction handles Nx/monorepo prefixed output
      const combinedOutput = stdout + (stderr ? '\n' + stderr : '');

      if (combinedOutput.trim()) {
        const hasJsonInStdout = stdout.includes('"testResults"') || stdout.includes('"numFailedTestSuites"');
        const hasJsonInStderr = stderr.includes('"testResults"') || stderr.includes('"numFailedTestSuites"');

        if (hasJsonInStdout || hasJsonInStderr) {
          resolve(combinedOutput);
        } else if (stdout) {
          resolve(combinedOutput);
        } else {
          tests.forEach((test) =>
            run.failed(test, new vscode.TestMessage(stderr)),
          );
          resolve(null);
        }
      } else {
        tests.forEach((test) =>
          run.failed(test, new vscode.TestMessage('No output from test runner')),
        );
        resolve(null);
      }
    });

    const cancellationListener = token.onCancellationRequested(() => {
      jestProcess.kill();
      tests.forEach((test) => run.skipped(test));
      resolve(null);
    });
  });
}

export function collectTestsByFile(
  request: vscode.TestRunRequest,
  testController: vscode.TestController,
): Map<string, vscode.TestItem[]> {
  const testsByFile = new Map<string, vscode.TestItem[]>();

  const collectTests = (test: vscode.TestItem) => {
    if (request.exclude?.includes(test)) {
      return;
    }

    if (test.children.size > 0) {
      test.children.forEach((child) => collectTests(child));
    } else if (test.uri) {
      const filePath = test.uri.fsPath;
      if (!testsByFile.has(filePath)) {
        testsByFile.set(filePath, []);
      }
      testsByFile.get(filePath)!.push(test);
    }
  };

  if (request.include) {
    request.include.forEach((test) => collectTests(test));
  } else {
    testController.items.forEach((test) => collectTests(test));
  }

  return testsByFile;
}

export function buildTestArgs(
  allFiles: string[],
  testsByFile: Map<string, vscode.TestItem[]>,
  isVitest: boolean,
  additionalArgs: string[],
  collectCoverage: boolean,
  jestConfig: TestRunnerConfig,
  testController: vscode.TestController,
): string[] {
  const fileItem =
    allFiles.length === 1
      ? testController.items.get(allFiles[0])
      : undefined;
  const totalTestsInFile = fileItem?.children.size ?? 0;
  const isPartialRun =
    allFiles.length === 1 &&
    testsByFile.get(allFiles[0])!.length < totalTestsInFile;

  if (isPartialRun) {
    const tests = testsByFile.get(allFiles[0])!;
    const testNamePattern =
      tests.length > 1
        ? `(${tests.map((test) => escapeRegExp(updateTestNameIfUsingProperties(test.label))).join('|')})`
        : escapeRegExp(updateTestNameIfUsingProperties(tests[0].label));

    const extraArgs = [
      ...additionalArgs,
      isVitest ? '--reporter=json' : '--json',
    ];

    if (collectCoverage) {
      extraArgs.push(
        '--coverage',
        isVitest ? '--coverage.reporter' : '--coverageReporters=json',
        ...(isVitest ? ['json'] : []),
      );
    }

    return isVitest
      ? jestConfig.buildVitestArgs(allFiles[0], testNamePattern, true, extraArgs)
      : jestConfig.buildJestArgs(allFiles[0], testNamePattern, true, extraArgs);
  }

  // Full file run
  const configPath = isVitest
    ? jestConfig.getVitestConfigPath(allFiles[0])
    : jestConfig.getJestConfigPath(allFiles[0]);

  // Normalize paths for Windows compatibility (backslashes -> forward slashes)
  const normalizedFiles = allFiles.map(normalizePath);

  const args = isVitest
    ? [
      'run',
      ...normalizedFiles,
      '--reporter=json',
    ]
    : [
      ...normalizedFiles,
      '--json',
    ];

  if (configPath) {
    args.push(isVitest ? '--config' : '-c', configPath);
  }

  args.push(...additionalArgs);

  if (collectCoverage) {
    if (isVitest) {
      args.push('--coverage', '--coverage.reporter', 'json');
    } else {
      args.push('--coverage', '--coverageReporters=json');
    }
  }

  return args;
}

export function logTestExecution(
  framework: string,
  command: string,
  args: string[],
  testCount: number,
  fileCount: number,
  isEsm: boolean,
): void {
  logInfo(
    `Running batched ${framework} command: ${command} ${args.join(' ')} (${testCount} tests across ${fileCount} files)${isEsm ? ' [ESM mode]' : ''}`,
  );
}

/**
 * Build test args for fast single-test execution (no JSON output).
 * This is used when running a single test to avoid JSON serialization overhead.
 */
export function buildTestArgsFast(
  filePath: string,
  testName: string,
  isVitest: boolean,
  jestConfig: TestRunnerConfig,
): string[] {
  return isVitest
    ? jestConfig.buildVitestArgs(filePath, testName, true, [])
    : jestConfig.buildJestArgs(filePath, testName, true, []);
}

/**
 * Check if a test run qualifies for fast mode (single test, no coverage).
 */
export function canUseFastMode(
  testsByFile: Map<string, vscode.TestItem[]>,
  collectCoverage: boolean,
): boolean {
  if (collectCoverage) return false;

  const files = Array.from(testsByFile.keys());
  if (files.length !== 1) return false;

  const tests = testsByFile.get(files[0])!;
  return tests.length === 1;
}
