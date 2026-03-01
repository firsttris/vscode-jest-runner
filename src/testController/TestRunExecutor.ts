import * as vscode from 'vscode';
import { relative, join } from 'node:path';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { TestRunnerConfig } from '../testRunnerConfig';
import { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import { CoverageProvider, DetailedFileCoverage } from '../coverageProvider';
import { collectTestsByFile } from '../execution/TestCollector';
import {
  buildTestArgs,
  buildTestArgsFast,
  canUseFastMode,
} from '../execution/TestArgumentBuilder';
import {
  executeTestCommand,
  executeTestCommandFast,
  logTestExecution,
} from '../execution/TestProcessRunner';
import { processTestResults } from '../testResultProcessor';
import { getTestFrameworkForFile } from '../testDetection/testFileDetection';
import { quote, toTestItemNamePattern } from '../utils/TestNameUtils';
import { logInfo, logError } from '../utils/Logger';
import { isWindows, normalizePath } from '../utils/PathUtils';
import { randomUUID } from 'node:crypto';

interface RunContext {
  allFiles: string[];
  allTests: vscode.TestItem[];
  framework: TestFrameworkName;
  workspaceFolder: string;
}

export class TestRunExecutor {
  private static readonly WINDOWS_SAFE_COMMAND_LENGTH = 30000;

  constructor(
    private readonly testController: vscode.TestController,
    private readonly testRunnerConfig: TestRunnerConfig,
    private readonly coverageProvider: CoverageProvider,
  ) {}

  public async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    additionalArgs: string[] = [],
  ): Promise<void> {
    return this.executeTests(request, token, additionalArgs, false);
  }

  public async coverageHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    return this.executeTests(request, token, [], true);
  }

  public async loadDetailedCoverage(
    testRun: vscode.TestRun,
    fileCoverage: vscode.FileCoverage,
    token: vscode.CancellationToken,
  ): Promise<vscode.FileCoverageDetail[]> {
    if (fileCoverage instanceof DetailedFileCoverage) {
      return this.coverageProvider.loadDetailedCoverage(fileCoverage, token);
    }
    return [];
  }

  private async executeTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    additionalArgs: string[] = [],
    collectCoverage: boolean = false,
  ): Promise<void> {
    const run = this.testController.createTestRun(request);
    const testsByFile = collectTestsByFile(request, this.testController);

    testsByFile.forEach((tests) => {
      tests.forEach((test) => run.started(test));
    });

    if (token.isCancellationRequested) {
      run.end();
      return;
    }

    try {
      const context = this.validateRunContext(testsByFile, run);
      if (!context) {
        run.end();
        return;
      }

      const { allFiles, allTests, framework, workspaceFolder } = context;

      this.cleanupBunCoverage(framework, collectCoverage);

      if (
        this.shouldRunFastMode(testsByFile, collectCoverage, additionalArgs)
      ) {
        await this.runFastMode(allFiles[0], allTests[0], framework, token, run);
      } else {
        await this.runStandardMode(
          context,
          testsByFile,
          additionalArgs,
          collectCoverage,
          token,
          run,
        );
      }
    } catch (error) {
      this.handleError(error, testsByFile, run);
    } finally {
      run.end();
    }
  }

  private validateRunContext(
    testsByFile: Map<string, vscode.TestItem[]>,
    run: vscode.TestRun,
  ): RunContext | null {
    const allFiles = Array.from(testsByFile.keys());
    const allTests = Array.from(testsByFile.values()).flat();

    if (allFiles.length === 0) {
      return null;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(allFiles[0]),
    )?.uri.fsPath;

    if (!workspaceFolder) {
      allTests.forEach((test) =>
        run.failed(
          test,
          new vscode.TestMessage('Could not determine workspace folder'),
        ),
      );
      return null;
    }

    const framework = getTestFrameworkForFile(allFiles[0]) || 'jest';
    return { allFiles, allTests, framework, workspaceFolder };
  }

  private cleanupBunCoverage(
    framework: TestFrameworkName,
    collectCoverage: boolean,
  ): void {
    if (framework !== 'bun' || !collectCoverage) {
      return;
    }

    try {
      const coveragePath = join(
        this.testRunnerConfig.cwd,
        'coverage',
        'lcov.info',
      );
      if (fs.existsSync(coveragePath)) {
        fs.unlinkSync(coveragePath);
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
  }

  private shouldRunFastMode(
    testsByFile: Map<string, vscode.TestItem[]>,
    collectCoverage: boolean,
    additionalArgs: string[],
  ): boolean {
    return (
      canUseFastMode(testsByFile, collectCoverage) &&
      additionalArgs.length === 0
    );
  }

  private async runFastMode(
    file: string,
    test: vscode.TestItem,
    framework: TestFrameworkName,
    token: vscode.CancellationToken,
    run: vscode.TestRun,
  ): Promise<void> {
    const testCommand = this.testRunnerConfig.getTestCommand(file);

    const testName = toTestItemNamePattern(test);
    const args = buildTestArgsFast(
      file,
      testName,
      framework,
      this.testRunnerConfig,
    );
    const commandArgs = args;
    const esmEnv = this.getEsmEnv(file, framework);

    logInfo(`Running fast mode: ${testCommand} ${commandArgs.join(' ')}`);

    await executeTestCommandFast(
      testCommand,
      commandArgs,
      token,
      test,
      run,
      this.testRunnerConfig.cwd,
      esmEnv,
    );
  }

  private async runStandardMode(
    context: RunContext,
    testsByFile: Map<string, vscode.TestItem[]>,
    additionalArgs: string[],
    collectCoverage: boolean,
    token: vscode.CancellationToken,
    run: vscode.TestRun,
  ): Promise<void> {
    const { allFiles, allTests, framework, workspaceFolder } = context;
    const sessionId = randomUUID();

    const testCommand = this.testRunnerConfig.getTestCommand(allFiles[0]);

    const args = buildTestArgs(
      allFiles,
      testsByFile,
      framework,
      additionalArgs,
      collectCoverage,
      this.testRunnerConfig,
      this.testController,
    );

    const commandArgs = this.adjustArgsForWindowsLengthLimit(
      testCommand,
      framework,
      allFiles,
      args,
    );
    const esmEnv = this.getEsmEnv(allFiles[0], framework);

    logTestExecution(
      framework,
      testCommand,
      commandArgs,
      allTests.length,
      allFiles.length,
      !!esmEnv,
    );

    const result = await executeTestCommand(
      testCommand,
      commandArgs,
      token,
      allTests,
      run,
      this.testRunnerConfig.cwd,
      { ...(esmEnv ?? {}), JSTR_SESSION_ID: sessionId },
      sessionId,
    );

    if (result === null) {
      return;
    }

    try {
      if (!result.structuredResultsProcessed) {
        this.handleBunReport(framework, result);
        this.handleDenoReport(framework, result);
        processTestResults(result.output, allTests, run, framework, sessionId);
      }
    } finally {
      // Always process coverage, even if test result processing fails
      if (framework === 'deno' && collectCoverage) {
        await this.handleDenoCoverage(workspaceFolder);
      }

      if (collectCoverage) {
        const configPath =
          framework === 'vitest'
            ? this.testRunnerConfig.getVitestConfigPath(allFiles[0])
            : this.testRunnerConfig.getJestConfigPath(allFiles[0]);

        await this.processCoverageData(
          run,
          workspaceFolder,
          framework,
          configPath,
          allFiles.length > 0 ? allFiles[0] : undefined,
        );
      }
    }
  }

  private adjustArgsForWindowsLengthLimit(
    testCommand: string,
    framework: TestFrameworkName,
    allFiles: string[],
    args: string[],
  ): string[] {
    if (!isWindows()) {
      return args;
    }

    const commandLength = `${testCommand} ${args.join(' ')}`.length;
    if (commandLength <= TestRunExecutor.WINDOWS_SAFE_COMMAND_LENGTH) {
      return args;
    }

    let fallbackArgs = args;

    if (framework === 'jest') {
      const fileSet = new Set(allFiles.map(normalizePath));
      fallbackArgs = args.filter((arg) => !fileSet.has(arg));
    }

    if (framework === 'vitest') {
      fallbackArgs = this.removeVitestExplicitFileArgs(args);
    }

    const fallbackLength = `${testCommand} ${fallbackArgs.join(' ')}`.length;

    if (fallbackArgs !== args && fallbackLength < commandLength) {
      logInfo(
        `Windows command length fallback activated for ${framework}: ${commandLength} -> ${fallbackLength}`,
      );
      return fallbackArgs;
    }

    return args;
  }

  private removeVitestExplicitFileArgs(args: string[]): string[] {
    if (args.length === 0 || args[0] !== 'run') {
      return args;
    }

    const nextOptionIndex = args.findIndex((arg, index) => {
      if (index <= 0) {
        return false;
      }
      return arg.startsWith('-');
    });

    if (nextOptionIndex <= 0) {
      return args;
    }

    return ['run', ...args.slice(nextOptionIndex)];
  }

  private getEsmEnv(
    file: string,
    framework: TestFrameworkName,
  ): NodeJS.ProcessEnv | undefined {
    const isVitest = framework === 'vitest';
    const isNodeTest = framework === 'node-test';
    return isVitest || isNodeTest
      ? undefined
      : this.testRunnerConfig.getEnvironmentForRun(file);
  }

  private handleBunReport(
    framework: TestFrameworkName,
    result: { output: string },
  ): void {
    if (framework !== 'bun') {
      return;
    }

    const bunReportPath = join(this.testRunnerConfig.cwd, '.bun-report.xml');
    try {
      if (fs.existsSync(bunReportPath)) {
        const reportContent = fs.readFileSync(bunReportPath, 'utf8');
        result.output += '\n' + reportContent;
        try {
          fs.unlinkSync(bunReportPath);
        } catch (e) {
          logError('Failed to delete Bun report file', e);
        }
      }
    } catch (e) {
      logError('Failed to read Bun report file', e);
    }
  }

  private handleDenoReport(
    framework: TestFrameworkName,
    result: { output: string },
  ): void {
    if (framework !== 'deno') {
      return;
    }

    const denoReportPath = join(this.testRunnerConfig.cwd, '.deno-report.xml');
    try {
      if (fs.existsSync(denoReportPath)) {
        const reportContent = fs.readFileSync(denoReportPath, 'utf8');
        result.output += '\n' + reportContent;
        try {
          fs.unlinkSync(denoReportPath);
        } catch (e) {
          logError('Failed to delete Deno report file', e);
        }
      }
    } catch (e) {
      logError('Failed to read Deno report file', e);
    }
  }

  private async handleDenoCoverage(workspaceFolder: string): Promise<void> {
    try {
      const coverageCommand = `deno coverage coverage --lcov > ${quote(join(workspaceFolder, 'lcov.info'))}`;
      await new Promise<void>((resolve, reject) => {
        const cp = spawn(coverageCommand, {
          shell: true,
          cwd: this.testRunnerConfig.cwd,
        });
        cp.on('close', (code) => {
          if (code === 0) resolve();
          else
            reject(
              new Error(`Deno coverage conversion failed with code ${code}`),
            );
        });
        cp.on('error', reject);
      });
    } catch (e) {
      logError('Failed to convert Deno coverage', e);
    }
  }

  private handleError(
    error: unknown,
    testsByFile: Map<string, vscode.TestItem[]>,
    run: vscode.TestRun,
  ): void {
    const errOutput =
      error instanceof Error
        ? error.message
        : error
          ? String(error)
          : 'Test execution failed';

    testsByFile.forEach((tests) => {
      tests.forEach((test) =>
        run.failed(test, new vscode.TestMessage(errOutput)),
      );
    });
  }

  private async processCoverageData(
    run: vscode.TestRun,
    workspaceFolder: string,
    framework: TestFrameworkName = 'jest',
    configPath?: string,
    testFilePath?: string,
  ): Promise<void> {
    try {
      const coverageMap = await this.coverageProvider.readCoverageFromFile(
        workspaceFolder,
        framework,
        configPath,
        testFilePath,
      );

      if (!coverageMap) {
        logInfo(
          `No coverage data found. Make sure coverageReporters includes "json" in your ${framework} config.`,
        );
        return;
      }

      const fileCoverages =
        this.coverageProvider.convertToVSCodeCoverage(coverageMap);

      logInfo(`Adding coverage for ${fileCoverages.length} files`);

      for (const fileCoverage of fileCoverages) {
        run.addCoverage(fileCoverage);
      }
    } catch (error) {
      logError('Failed to process coverage data', error);
    }
  }
}
