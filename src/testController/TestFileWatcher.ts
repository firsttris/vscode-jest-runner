import * as vscode from 'vscode';
import { dirname } from 'node:path';
import { TestRunnerConfig } from '../testRunnerConfig';
import { testFileCache } from '../testDetection/testFileCache';
import { invalidateNodeTestCache } from '../testDetection/frameworkDetection';
import {
  findFolderTestItem,
  getOrCreateFileTestItem,
  parseTestsInFile,
} from '../testDiscovery';
import { cacheManager } from '../cache/CacheManager';

export class TestFileWatcher {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly testController: vscode.TestController,
    private readonly testRunnerConfig: TestRunnerConfig,
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
            const testItem = getOrCreateFileTestItem(
              this.testController,
              workspaceFolder,
              uri.fsPath,
            );
            parseTestsInFile(uri.fsPath, testItem, this.testController);
            return;
          }
        }
      }
    });

    watcher.onDidDelete((uri) => {
      cacheManager.invalidate(uri.fsPath);

      this.testController.items.delete(uri.fsPath);

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (!workspaceFolder) {
        return;
      }

      const parentItem = findFolderTestItem(
        this.testController,
        workspaceFolder,
        dirname(uri.fsPath),
      );

      if (parentItem) {
        parentItem.children.delete(uri.fsPath);
      }
    });

    this.disposables.push(watcher);
  }

  private setupDocumentOpenHandler(): void {
    const openHandler = vscode.workspace.onDidOpenTextDocument((document) => {
      const filePath = document.uri.fsPath;

      if (!testFileCache.isTestFile(filePath)) {
        return;
      }

      let testItem = this.testController.items.get(filePath);

      if (!testItem) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          document.uri,
        );
        if (workspaceFolder) {
          testItem = getOrCreateFileTestItem(
            this.testController,
            workspaceFolder,
            filePath,
          );
        }
      }

      if (testItem && testItem.children.size === 0) {
        parseTestsInFile(filePath, testItem, this.testController);
      }
    });

    this.disposables.push(openHandler);

    vscode.workspace.textDocuments.forEach((document) => {
      const filePath = document.uri.fsPath;
      if (testFileCache.isTestFile(filePath)) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          document.uri,
        );
        if (workspaceFolder) {
          const testItem = getOrCreateFileTestItem(
            this.testController,
            workspaceFolder,
            filePath,
          );
          parseTestsInFile(filePath, testItem, this.testController);
        }
      }
    });
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
