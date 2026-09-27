import * as vscode from 'vscode';
import { cacheManager } from './cache/CacheManager';
import { CoverageProvider } from './coverageProvider';
import { DebugHandler } from './testController/DebugHandler';
import { TestConfigWatcher } from './testController/TestConfigWatcher';
import { TestFileWatcher } from './testController/TestFileWatcher';
import { TestRunExecutor } from './testController/TestRunExecutor';
import { testFileCache } from './testDetection/testFileCache';
import { discoverTests } from './testDiscovery';
import { TestRunnerConfig } from './testRunnerConfig';

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
			this.coverageProvider,
		);
		this.debugHandler = new DebugHandler(this.testController, this.jestConfig);
		this.fileWatcher = new TestFileWatcher(
			this.testController,
			this.jestConfig,
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

	private didFullDiscovery = false;

	private runningRefresh: Promise<void> | undefined;

	private queuedRefresh: Promise<void> | undefined;

	/**
	 * Refreshes run one after another: two interleaved discoveries would
	 * clear each other's items while the other is still adding them.
	 * At most one refresh waits behind the running one, so a burst of
	 * config changes (npm install, git checkout) costs two discoveries,
	 * not one per event.
	 */
	private refreshAllTests(): Promise<void> {
		if (this.queuedRefresh) {
			return this.queuedRefresh;
		}
		if (!this.runningRefresh) {
			return this.startRefresh();
		}

		const queued = this.runningRefresh
			.catch(() => {})
			.then(() => {
				this.queuedRefresh = undefined;
				return this.startRefresh();
			});
		this.queuedRefresh = queued;
		return queued;
	}

	private startRefresh(): Promise<void> {
		const refresh = this.discoverAllTests();
		this.runningRefresh = refresh;
		const clearRunning = () => {
			if (this.runningRefresh === refresh) {
				this.runningRefresh = undefined;
			}
		};
		refresh.then(clearRunning, clearRunning);
		return refresh;
	}

	private async discoverAllTests(): Promise<void> {
		cacheManager.invalidateAll();
		testFileCache.invalidate();

		this.testController.items.replace([]);

		if (vscode.workspace.workspaceFolders) {
			for (const workspaceFolder of vscode.workspace.workspaceFolders) {
				await discoverTests(
					workspaceFolder,
					this.testController,
					this.jestConfig,
				);
			}
		}
		this.didFullDiscovery = true;
	}

	/**
	 * A refresh clears the tree before rebuilding it, so a run must wait for
	 * it even after the first full discovery; otherwise it would only see
	 * the files re-added so far.
	 */
	private async ensureTestsDiscovered(): Promise<void> {
		const pending = this.queuedRefresh ?? this.runningRefresh;
		if (pending) {
			await pending;
			return;
		}

		if (!this.didFullDiscovery) {
			await this.refreshAllTests();
		}
	}

	public dispose(): void {
		this.disposables.forEach((d) => void d.dispose());
		this.testController.dispose();
	}
}
