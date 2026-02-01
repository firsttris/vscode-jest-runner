import * as vscode from 'vscode';
import { isAbsolute, resolve } from 'node:path';
import { testFrameworks } from '../testDetection/frameworkDefinitions';
import * as Settings from '../config/Settings';

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
            if (
                e.affectsConfiguration('jestrunner') ||
                e.affectsConfiguration('vitest') ||
                e.affectsConfiguration('jest')
            ) {
                this.refreshCustomConfigWatchers();
                this._onDidChange.fire();
            }
        });

        this.disposables.push(configWatcher);

        const configFilePatterns = [
            ...testFrameworks.flatMap(f => f.configFiles.map(c => `**/${c}`)),
        ];

        const handleConfigChange = () => this._onDidChange.fire();

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

        const jestConfigPath = Settings.getJestConfigPath();
        const vitestConfigPath = Settings.getVitestConfigPath();

        const addPaths = (config: string | Record<string, string> | undefined) => {
            if (typeof config === 'string') {
                customPaths.add(config);
            } else if (config && typeof config === 'object') {
                Object.values(config).forEach(path => customPaths.add(path));
            }
        };

        addPaths(jestConfigPath);
        addPaths(vitestConfigPath);

        const handleConfigChange = () => this._onDidChange.fire();

        for (const configPath of customPaths) {
            if (configPath) {
                const resolvedPath = isAbsolute(configPath)
                    ? configPath
                    : resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', configPath);
                const watcher = vscode.workspace.createFileSystemWatcher(resolvedPath);
                watcher.onDidChange(handleConfigChange);
                watcher.onDidCreate(handleConfigChange);
                watcher.onDidDelete(handleConfigChange);
                this.customConfigWatchers.push(watcher);
            }
        }
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
        this.customConfigWatchers.forEach((w) => w.dispose());
        this._onDidChange.dispose();
    }
}
