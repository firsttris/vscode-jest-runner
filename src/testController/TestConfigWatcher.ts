import { isAbsolute, resolve } from 'node:path';
import * as vscode from 'vscode';
import * as Settings from '../config/Settings';
import { testFrameworks } from '../testDetection/frameworkDefinitions';

export class TestConfigWatcher {
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	public readonly onDidChange = this._onDidChange.event;

	private disposables: vscode.Disposable[] = [];
	private customConfigWatchers: vscode.FileSystemWatcher[] = [];

	constructor() {
		this.setupConfigurationWatcher();
	}

	private setupConfigurationWatcher(): void {
		const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('jestrunner')) {
				this.refreshCustomConfigWatchers();
				this._onDidChange.fire();
			}
		});

		this.disposables.push(configWatcher);

		const configFiles = new Set(testFrameworks.flatMap((f) => f.configFiles));
		const watcher = vscode.workspace.createFileSystemWatcher(
			`**/{${[...configFiles].join(',')}}`,
		);
		const handleConfigChange = () => this._onDidChange.fire();
		watcher.onDidChange(handleConfigChange);
		watcher.onDidCreate(handleConfigChange);
		watcher.onDidDelete(handleConfigChange);
		this.disposables.push(watcher);

		this.refreshCustomConfigWatchers();
	}

	private refreshCustomConfigWatchers(): void {
		this.customConfigWatchers.forEach((w) => void w.dispose());
		this.customConfigWatchers = [];

		const customPaths = new Set<string>();

		const jestConfigPath = Settings.getJestConfigPath();
		const vitestConfigPath = Settings.getVitestConfigPath();

		const addPaths = (config: string | Record<string, string> | undefined) => {
			if (typeof config === 'string') {
				customPaths.add(config);
			} else if (config && typeof config === 'object') {
				Object.values(config).forEach((path) => void customPaths.add(path));
			}
		};

		addPaths(jestConfigPath);
		addPaths(vitestConfigPath);

		const handleConfigChange = () => this._onDidChange.fire();

		// Resolve like ConfigResolver: relative to projectPath inside each
		// workspace folder.
		const projectPath = Settings.getProjectPath() || '';
		const folderPaths = vscode.workspace.workspaceFolders?.map(
			(f) => f.uri.fsPath,
		) ?? [''];
		const resolvedPaths = new Set<string>();
		for (const configPath of customPaths) {
			if (!configPath) continue;
			if (isAbsolute(configPath)) {
				resolvedPaths.add(configPath);
				continue;
			}
			for (const folderPath of folderPaths) {
				resolvedPaths.add(resolve(folderPath, projectPath, configPath));
			}
		}

		for (const resolvedPath of resolvedPaths) {
			const watcher = vscode.workspace.createFileSystemWatcher(resolvedPath);
			watcher.onDidChange(handleConfigChange);
			watcher.onDidCreate(handleConfigChange);
			watcher.onDidDelete(handleConfigChange);
			this.customConfigWatchers.push(watcher);
		}
	}

	public dispose(): void {
		this.disposables.forEach((d) => void d.dispose());
		this.customConfigWatchers.forEach((w) => void w.dispose());
		this._onDidChange.dispose();
	}
}
