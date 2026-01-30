import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { realpathSync, mkdirSync, existsSync } from 'node:fs';
import { escapeRegExp, updateTestNameIfUsingProperties, logInfo, logWarning } from './util';
import { TestRunnerConfig } from './testRunnerConfig';
import { stripAnsi } from './util';

/**
 * Generate a unique temporary file path for Jest JSON output.
 * Using a file avoids all stdout parsing issues with Nx/monorepo wrappers.
 */
export function generateOutputFilePath(workspaceFolder?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filename = `jest-runner-${timestamp}-${random}.json`;

  if (workspaceFolder) {
    try {
      const cacheDir = join(workspaceFolder, 'node_modules', '.cache', 'vscode-jest-runner');
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }
      return join(cacheDir, filename);
    } catch (e) {
      logWarning(`Failed to create cache directory in workspace: ${e}. Falling back to tmpdir.`);
    }
  }

  // Fallback to system temp dir if no workspace folder or creation failed
  // Use realpathSync to resolve symlinks (e.g. /var vs /private/var on MacOS)
  const tempDir = realpathSync(tmpdir());
  return join(tempDir, filename);
}

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
    let exitCode: number | null = null;

    jestProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    jestProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
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
      exitCode = code;

      if (token.isCancellationRequested) {
        run.skipped(test);
        resolve();
        return;
      }

      // Exit code 0 = passed, non-zero = failed
      if (exitCode === 0) {
        run.passed(test);
      } else {
        // Extract error message from output
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
  outputFilePath?: string,
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

    jestProcess.on('close', async () => {
      cancellationListener.dispose();

      if (token.isCancellationRequested) {
        tests.forEach((test) => run.skipped(test));
        if (outputFilePath) {
          unlink(outputFilePath).catch(() => { });
        }
        resolve(null);
        return;
      }

      // Try to read from output file first (most reliable for Jest)
      if (outputFilePath) {
        try {
          const fileContent = await readFile(outputFilePath, 'utf8');
          // Clean up temp file
          unlink(outputFilePath).catch(() => { });
          if (fileContent && fileContent.trim()) {
            resolve(fileContent);
            return;
          }
        } catch (err) {
          // File doesn't exist or can't be read - fall back to stdout parsing
          logWarning(`Could not read Jest output file: ${err}. Falling back to stdout parsing.`);
        }
      }

      // Fallback: parse from stdout/stderr (for Vitest or when --outputFile fails)
      const combinedOutput = stdout + (stderr ? '\n' + stderr : '');

      if (combinedOutput.trim()) {
        const hasJsonInStdout = stdout.includes('"testResults"');
        const hasJsonInStderr = stderr.includes('"testResults"');

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
  outputFilePath?: string,
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
      // Use --outputFile to avoid stdout parsing issues with Nx/monorepos
      ...(outputFilePath ? ['--outputFile', `"${outputFilePath}"`] : []),
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

  const args = isVitest
    ? [
      'run',
      ...allFiles,
      '--reporter=json',
      // Use --outputFile to avoid stdout parsing issues with Nx/monorepos
      ...(outputFilePath ? ['--outputFile', `"${outputFilePath}"`] : []),
    ]
    : [
      ...allFiles,
      '--json',
      // Use --outputFile to avoid stdout parsing issues with Nx/monorepos
      ...(outputFilePath ? ['--outputFile', `"${outputFilePath}"`] : []),
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
