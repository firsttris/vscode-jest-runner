import * as vscode from 'vscode';
import { relative } from 'node:path';
import { TestRunnerConfig } from '../testRunnerConfig';
import { testFileCache } from '../testDetection/testFileCache';
import { invalidateNodeTestCache } from '../testDetection/frameworkDetection';
import { parseTestsInFile } from '../testDiscovery';
import { cacheManager } from '../cache/CacheManager';

export class TestFileWatcher {
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly testController: vscode.TestController,
        private readonly testRunnerConfig: TestRunnerConfig
    ) {
        this.setupFileWatcher();
        this.setupDocumentOpenHandler();
    }

    private setupFileWatcher(): void {
        const pattern = this.testRunnerConfig.getAllPotentialSourceFiles();
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidChange((uri) => {
            invalidateNodeTestCache(uri.fsPath);
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
                        const relativePath = relative(
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
            cacheManager.invalidate(uri.fsPath);
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
                    const relativePath = relative(workspaceFolder.uri.fsPath, filePath);
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
                    const relativePath = relative(workspaceFolder.uri.fsPath, filePath);
                    const testItem = this.testController.createTestItem(filePath, relativePath, document.uri);
                    this.testController.items.add(testItem);
                    parseTestsInFile(filePath, testItem, this.testController);
                }
            }
        });
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}
