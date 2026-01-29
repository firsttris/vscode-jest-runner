import * as vscode from 'vscode';
import * as path from 'path';
import { pushMany, logInfo, logError, escapeRegExp, updateTestNameIfUsingProperties, parseShellCommand } from './util';
import { TestRunnerConfig } from './testRunnerConfig';
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
  executeTestCommandFast,
  collectTestsByFile,
  buildTestArgs,
  buildTestArgsFast,
  canUseFastMode,
  logTestExecution,
  generateOutputFilePath,
} from './testExecution';
import { testFrameworks } from './testDetection/frameworkDefinitions';
import { clearTestDetectionCache, clearVitestDetectionCache } from './testDetection/cache';
import { testFileCache } from './testDetection/testFileCache';
import { getTestFrameworkForFile } from './testDetection/testFileDetection';

export class JestTestController {
  private testController: vscode.TestController;
  private disposables: vscode.Disposable[] = [];
  private jestConfig: TestRunnerConfig;
  private coverageProvider: CoverageProvider;
  private customConfigWatchers: vscode.FileSystemWatcher[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.jestConfig = new TestRunnerConfig();
    this.coverageProvider = new CoverageProvider();

    this.testController = vscode.tests.createTestController(
      'jestVitestTestController',
      'Jest/Vitest Tests',
    );
    context.subscriptions.push(this.testController);

    this.setupRunProfiles();
    this.setupFileWatcher();
    this.setupConfigurationWatcher();
    this.setupDocumentOpenHandler();
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
        this.refreshCustomConfigWatchers();
        this.refreshAllTests();
      }
    });

    this.disposables.push(configWatcher);

    const configFilePatterns = [
      ...testFrameworks.flatMap(f => f.configFiles.map(c => `**/${c}`)),
    ];

    const handleConfigChange = () => this.refreshAllTests();

    for (const pattern of configFilePatterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(handleConfigChange);
      watcher.onDidCreate(handleConfigChange);
      watcher.onDidDelete(handleConfigChange);
      this.disposables.push(watcher);
    }

    // Initial setup of custom config watchers
    this.refreshCustomConfigWatchers();
  }

  private refreshCustomConfigWatchers(): void {
    // Dispose existing custom watchers
    this.customConfigWatchers.forEach(w => w.dispose());
    this.customConfigWatchers = [];

    const customPaths = new Set<string>();

    const jestConfigPath = vscode.workspace.getConfiguration().get('jestrunner.configPath') as string | Record<string, string> | undefined;
    const vitestConfigPath = vscode.workspace.getConfiguration().get('jestrunner.vitestConfigPath') as string | Record<string, string> | undefined;

    const addPaths = (config: string | Record<string, string> | undefined) => {
      if (typeof config === 'string') {
        customPaths.add(config);
      } else if (config && typeof config === 'object') {
        Object.values(config).forEach(path => customPaths.add(path));
      }
    };

    addPaths(jestConfigPath);
    addPaths(vitestConfigPath);

    const handleConfigChange = () => this.refreshAllTests();

    for (const configPath of customPaths) {
      if (configPath) {
        const resolvedPath = path.isAbsolute(configPath)
          ? configPath
          : path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', configPath);
        const watcher = vscode.workspace.createFileSystemWatcher(resolvedPath);
        watcher.onDidChange(handleConfigChange);
        watcher.onDidCreate(handleConfigChange);
        watcher.onDidDelete(handleConfigChange);
        this.customConfigWatchers.push(watcher);
      }
    }
  }

  private async refreshAllTests(): Promise<void> {
    // Clear detection caches to ensure fresh framework detection
    clearTestDetectionCache();
    clearVitestDetectionCache();

    // Invalidate test file cache to force re-evaluation
    testFileCache.invalidate();

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

      const testCommand = isVitest
        ? this.jestConfig.vitestCommand
        : this.jestConfig.jestCommand;
      const commandParts = parseShellCommand(testCommand);
      const command = commandParts[0];

      const esmEnv = isVitest ? undefined : this.jestConfig.getEnvironmentForRun(allFiles[0]);

      // Fast mode: single test without coverage - skip JSON parsing
      if (canUseFastMode(testsByFile, collectCoverage) && additionalArgs.length === 0) {
        const test = allTests[0];
        const testName = escapeRegExp(updateTestNameIfUsingProperties(test.label));
        const args = buildTestArgsFast(allFiles[0], testName, isVitest, this.jestConfig);
        const commandArgs = [...commandParts.slice(1), ...args];

        logInfo(`Running fast mode: ${command} ${commandArgs.join(' ')}`);

        await executeTestCommandFast(
          command,
          commandArgs,
          token,
          test,
          run,
          this.jestConfig.cwd,
          esmEnv,
        );

        run.end();
        return;
      }

      // Standard mode: use JSON output for multiple tests or coverage
      const outputFilePath = generateOutputFilePath();

      const args = buildTestArgs(
        allFiles,
        testsByFile,
        isVitest,
        additionalArgs,
        collectCoverage,
        this.jestConfig,
        this.testController,
        outputFilePath,
      );

      const commandArgs = [...commandParts.slice(1), ...args];

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
        outputFilePath,
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
    const testName = test.children.size === 0 ? escapeRegExp(updateTestNameIfUsingProperties(test.label)) : undefined;

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
    const pattern = this.jestConfig.getAllPotentialSourceFiles();
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
            if (!testFileCache.isTestFile(uri.fsPath)) {
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

  private setupDocumentOpenHandler(): void {
    // Only discover test files when they are opened - no scanning at startup
    const openHandler = vscode.workspace.onDidOpenTextDocument((document) => {
      const filePath = document.uri.fsPath;

      // Check if this is a test file (pattern matching happens here, not at startup)
      if (!testFileCache.isTestFile(filePath)) {
        return;
      }

      // Check if we already have this test item
      let testItem = this.testController.items.get(filePath);

      if (!testItem) {
        // Create the test item for this file
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
          const relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
          testItem = this.testController.createTestItem(filePath, relativePath, document.uri);
          this.testController.items.add(testItem);
        }
      }

      // Parse tests in the file
      if (testItem && testItem.children.size === 0) {
        parseTestsInFile(filePath, testItem, this.testController);
      }
    });

    this.disposables.push(openHandler);

    // Process already opened test files (if any are open when extension starts)
    vscode.workspace.textDocuments.forEach((document) => {
      const filePath = document.uri.fsPath;
      if (testFileCache.isTestFile(filePath)) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
          const relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
          const testItem = this.testController.createTestItem(filePath, relativePath, document.uri);
          this.testController.items.add(testItem);
          parseTestsInFile(filePath, testItem, this.testController);
        }
      }
    });
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.customConfigWatchers.forEach((w) => w.dispose());
    this.testController.dispose();
  }
}
