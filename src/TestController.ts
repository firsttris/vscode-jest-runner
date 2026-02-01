import * as vscode from 'vscode';
import { TestRunnerConfig } from './testRunnerConfig';
import { CoverageProvider } from './coverageProvider';
import { discoverTests } from './testDiscovery';
import { cacheManager } from './cache/CacheManager';
import { testFileCache } from './testDetection/testFileCache';
import { TestRunExecutor } from './testController/TestRunExecutor';
import { DebugHandler } from './testController/DebugHandler';
import { TestConfigWatcher } from './testController/TestConfigWatcher';
import { TestFileWatcher } from './testController/TestFileWatcher';

export class JestTestController {
  private testController: vscode.TestController;
  private disposables: vscode.Disposable[] = [];
  private jestConfig: TestRunnerConfig;
  private coverageProvider: CoverageProvider;

  private testRunExecutor: TestRunExecutor;
  private debugHandler: DebugHandler;
  private configWatcher: TestConfigWatcher;
  private fileWatcher: TestFileWatcher;

  constructor(context: vscode.ExtensionContext) {
    this.jestConfig = new TestRunnerConfig();
    this.coverageProvider = new CoverageProvider();

    this.testController = vscode.tests.createTestController(
      'jestVitestTestController',
      'Jest/Vitest Tests',
    );
    context.subscriptions.push(this.testController);

    this.testRunExecutor = new TestRunExecutor(
      this.testController,
      this.jestConfig,
      this.coverageProvider
    );
    this.debugHandler = new DebugHandler(
      this.testController,
      this.jestConfig
    );
    this.fileWatcher = new TestFileWatcher(
      this.testController,
      this.jestConfig
    );
    this.configWatcher = new TestConfigWatcher();

    this.testController.resolveHandler = async () => {
      await this.ensureTestsDiscovered();
    };

    this.setupRunProfiles();
    this.setupEventListeners();
  }

  private setupRunProfiles(): void {
    this.testController.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      async (request, token) => {
        await this.ensureTestsDiscovered();
        return this.testRunExecutor.runHandler(request, token);
      },
      true,
    );

    this.testController.createRunProfile(
      'Debug',
      vscode.TestRunProfileKind.Debug,
      async (request, token) => {
        await this.ensureTestsDiscovered();
        return this.debugHandler.debugHandler(request, token);
      },
      true,
    );

    const coverageProfile = this.testController.createRunProfile(
      'Coverage',
      vscode.TestRunProfileKind.Coverage,
      async (request, token) => {
        await this.ensureTestsDiscovered();
        return this.testRunExecutor.coverageHandler(request, token);
      },
      true,
    );

    coverageProfile.loadDetailedCoverage = (testRun, fileCoverage, token) =>
      this.testRunExecutor.loadDetailedCoverage(testRun, fileCoverage, token);

    this.testController.createRunProfile(
      'Update Snapshots',
      vscode.TestRunProfileKind.Run,
      async (request, token) => {
        await this.ensureTestsDiscovered();
        return this.testRunExecutor.runHandler(request, token, ['-u']);
      },
      false,
    );
  }

  private setupEventListeners(): void {
    this.configWatcher.onDidChange(() => this.refreshAllTests());
    this.disposables.push(this.configWatcher);
    this.disposables.push(this.fileWatcher);
  }

  private async refreshAllTests(): Promise<void> {
    cacheManager.invalidateAll();
    testFileCache.invalidate();

    this.testController.items.replace([]);

    if (vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        await discoverTests(workspaceFolder, this.testController, this.jestConfig);
      }
    }
  }

  private async ensureTestsDiscovered(): Promise<void> {
    let hasTests = false;
    this.testController.items.forEach(() => {
      hasTests = true;
    });

    if (hasTests) {
      return;
    }

    await this.refreshAllTests();
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.testController.dispose();
  }
}
