import * as vscode from 'vscode';
import * as path from 'path';
import { pushMany, isTestFile, logInfo, logError } from './util';
import { TestRunnerConfig } from './testRunnerConfig';
import { getTestFrameworkForFile } from './testDetection';
import {
  CoverageProvider,
  DetailedFileCoverage,
} from './coverageProvider';
import {
  discoverTests,
  parseTestsInFile,
} from './testDiscovery';
import { processTestResults } from './testResultProcessor';
import {
  executeTestCommand,
  collectTestsByFile,
  buildTestArgs,
  logTestExecution,
} from './testExecution';

export class JestTestController {
  private testController: vscode.TestController;
  private disposables: vscode.Disposable[] = [];
  private jestConfig: TestRunnerConfig;
  private coverageProvider: CoverageProvider;

  constructor(context: vscode.ExtensionContext) {
    this.jestConfig = new TestRunnerConfig();
    this.coverageProvider = new CoverageProvider();

    this.testController = vscode.tests.createTestController(
      'jestVitestTestController',
      'Jest/Vitest Tests',
    );
    context.subscriptions.push(this.testController);

    this.setupRunProfiles();
    this.discoverAllTests();
    this.setupFileWatcher();
    this.setupConfigurationWatcher();
  }

  private setupRunProfiles(): void {
    this.testController.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.runHandler(request, token),
      true,
    );

    this.testController.createRunProfile(
      'Debug',
      vscode.TestRunProfileKind.Debug,
      (request, token) => this.debugHandler(request, token),
      true,
    );

    const coverageProfile = this.testController.createRunProfile(
      'Coverage',
      vscode.TestRunProfileKind.Coverage,
      (request, token) => this.coverageHandler(request, token),
      true,
    );

    coverageProfile.loadDetailedCoverage = async (
      testRun,
      fileCoverage,
      token,
    ) => {
      if (fileCoverage instanceof DetailedFileCoverage) {
        return this.coverageProvider.loadDetailedCoverage(fileCoverage, token);
      }
      return [];
    };

    this.testController.createRunProfile(
      'Update Snapshots',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.runHandler(request, token, ['-u']),
      false,
    );
  }

  private discoverAllTests(): void {
    if (vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        discoverTests(workspaceFolder, this.testController, this.jestConfig);
      }
    }
  }

  private setupConfigurationWatcher(): void {
    const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('jestrunner') ||
        e.affectsConfiguration('vitest') ||
        e.affectsConfiguration('jest')
      ) {
        this.refreshAllTests();
      }
    });

    this.disposables.push(configWatcher);

    const configFilePatterns = [
      '**/jest.config.{js,ts,json,cjs,mjs}',
      '**/vitest.config.{js,ts,mjs,mts,cjs,cts}',
      '**/vite.config.{js,ts,mjs,mts,cjs,cts}',
    ];

    const handleConfigChange = () => this.refreshAllTests();

    for (const pattern of configFilePatterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(handleConfigChange);
      watcher.onDidCreate(handleConfigChange);
      watcher.onDidDelete(handleConfigChange);
      this.disposables.push(watcher);
    }
  }

  private async refreshAllTests(): Promise<void> {
    this.testController.items.replace([]);

    if (vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        await discoverTests(workspaceFolder, this.testController, this.jestConfig);
      }
    }
  }

  private async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    additionalArgs: string[] = [],
  ): Promise<void> {
    return this.executeTests(request, token, additionalArgs, false);
  }

  private async coverageHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    return this.executeTests(request, token, [], true);
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
      const allFiles = Array.from(testsByFile.keys());
      const allTests = Array.from(testsByFile.values()).flat();

      if (allFiles.length === 0) {
        run.end();
        return;
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
        run.end();
        return;
      }

      const framework = getTestFrameworkForFile(allFiles[0]) || 'jest';
      const isVitest = framework === 'vitest';

      const configPath = isVitest
        ? this.jestConfig.getVitestConfigPath(allFiles[0])
        : this.jestConfig.getJestConfigPath(allFiles[0]);

      const args = buildTestArgs(
        allFiles,
        testsByFile,
        isVitest,
        additionalArgs,
        collectCoverage,
        this.jestConfig,
        this.testController,
      );

      const testCommand = isVitest
        ? this.jestConfig.vitestCommand
        : this.jestConfig.jestCommand;
      const commandParts = testCommand.split(' ');
      const command = commandParts[0];
      const commandArgs = [...commandParts.slice(1), ...args];

      const esmEnv = isVitest ? undefined : this.jestConfig.getEnvironmentForRun(allFiles[0]);

      logTestExecution(
        framework,
        command,
        commandArgs,
        allTests.length,
        allFiles.length,
        !!esmEnv,
      );

      const output = await executeTestCommand(
        command,
        commandArgs,
        token,
        allTests,
        run,
        this.jestConfig.cwd,
        esmEnv,
      );

      if (output === null) {
        run.end();
        return;
      }

      processTestResults(output, allTests, run, framework);

      if (collectCoverage && workspaceFolder) {
        await this.processCoverageData(
          run,
          workspaceFolder,
          isVitest ? 'vitest' : 'jest',
          configPath,
        );
      }
    } catch (error) {
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

    run.end();
  }

  private async processCoverageData(
    run: vscode.TestRun,
    workspaceFolder: string,
    framework: 'jest' | 'vitest' = 'jest',
    configPath?: string,
  ): Promise<void> {
    try {
      const coverageMap = await this.coverageProvider.readCoverageFromFile(
        workspaceFolder,
        framework,
        configPath,
      );

      if (!coverageMap) {
        logInfo(`No coverage data found. Make sure coverageReporters includes "json" in your ${framework} config.`);
        return;
      }

      const fileCoverages = this.coverageProvider.convertToVSCodeCoverage(
        coverageMap,
        workspaceFolder,
      );

      logInfo(`Adding coverage for ${fileCoverages.length} files`);

      for (const fileCoverage of fileCoverages) {
        run.addCoverage(fileCoverage);
      }
    } catch (error) {
      logError('Failed to process coverage data', error);
    }
  }

  private async debugHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const queue: vscode.TestItem[] = [];

    if (request.include) {
      request.include.forEach((test) => queue.push(test));
    } else {
      this.testController.items.forEach((test) => queue.push(test));
    }

    for (const test of queue) {
      if (token.isCancellationRequested) {
        break;
      }

      if (request.exclude?.includes(test)) {
        continue;
      }

      if (test.children.size === 0) {
        await this.debugTest(test);
        break;
      } else {
        test.children.forEach((child) => {
          queue.push(child);
        });
      }
    }
  }

  private async debugTest(test: vscode.TestItem): Promise<boolean | undefined> {
    const filePath = test.uri!.fsPath;
    const testName = test.children.size === 0 ? test.label : undefined;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(test.uri!);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Could not determine workspace folder');
      return;
    }

    const debugConfig = this.jestConfig.getDebugConfiguration(filePath);
    const standardArgs = this.jestConfig.buildTestArgs(filePath, testName, false);
    pushMany(debugConfig.args, standardArgs);

    return vscode.debug.startDebugging(workspaceFolder, debugConfig);
  }

  private setupFileWatcher(): void {
    const pattern = this.jestConfig.getTestFilePattern();
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange((uri) => {
      const item = this.testController.items.get(uri.fsPath);
      if (item) {
        item.children.replace([]);
        parseTestsInFile(uri.fsPath, item, this.testController);
      }
    });

    watcher.onDidCreate((uri) => {
      if (vscode.workspace.workspaceFolders) {
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
          if (uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
            if (!isTestFile(uri.fsPath)) {
              return;
            }
            const relativePath = path.relative(
              workspaceFolder.uri.fsPath,
              uri.fsPath,
            );
            const testItem = this.testController.createTestItem(
              uri.fsPath,
              relativePath,
              uri,
            );
            this.testController.items.add(testItem);
            parseTestsInFile(uri.fsPath, testItem, this.testController);
          }
        }
      }
    });

    watcher.onDidDelete((uri) => {
      const item = this.testController.items.get(uri.fsPath);
      if (item) {
        this.testController.items.delete(uri.fsPath);
      }
    });

    this.disposables.push(watcher);
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.testController.dispose();
  }
}
