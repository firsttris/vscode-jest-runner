import { statSync } from 'node:fs';
import { dirname } from 'node:path';
import * as vscode from 'vscode';
import { cacheManager } from '../cache/CacheManager';
import { invalidateNodeTestCache } from '../testDetection/frameworkDetection';
import { testFileCache } from '../testDetection/testFileCache';
import {
	findFileTestItem,
	findFolderTestItem,
	getOrCreateFileTestItem,
	parseTestsInFile,
} from '../testDiscovery';
import type { TestRunnerConfig } from '../testRunnerConfig';

export class TestFileWatcher {
	private disposables: vscode.Disposable[] = [];

	/**
	 * Modification time of the file content each file item was last parsed
	 * from. Saving in the editor fires both the save handler and the file
	 * system watcher; whichever comes second finds the file unchanged.
	 */
	private parsedMtimes = new Map<string, number>();

	constructor(
		private readonly testController: vscode.TestController,
		private readonly testRunnerConfig: TestRunnerConfig,
	) {
		this.setupFileWatcher();
		this.setupDocumentOpenHandler();
		this.setupDocumentSaveHandler();
	}

	private setupFileWatcher(): void {
		const pattern = this.testRunnerConfig.getAllPotentialSourceFiles();
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		watcher.onDidChange((uri) => {
			invalidateNodeTestCache(uri.fsPath);
			const item = findFileTestItem(
				this.testController,
				vscode.workspace.getWorkspaceFolder(uri),
				uri.fsPath,
			);
			if (item) {
				this.reparse(uri.fsPath, item);
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
			this.parsedMtimes.delete(uri.fsPath);

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

	private setupDocumentSaveHandler(): void {
		const saveHandler = vscode.workspace.onDidSaveTextDocument((document) => {
			const filePath = document.uri.fsPath;

			if (!testFileCache.isTestFile(filePath)) {
				return;
			}

			invalidateNodeTestCache(filePath);

			let testItem = this.testController.items.get(filePath);

			if (!testItem) {
				const workspaceFolder = vscode.workspace.getWorkspaceFolder(
					document.uri,
				);

				if (!workspaceFolder) {
					return;
				}

				testItem = getOrCreateFileTestItem(
					this.testController,
					workspaceFolder,
					filePath,
				);
			}

			this.reparse(filePath, testItem);
		});

		this.disposables.push(saveHandler);
	}

	private reparse(filePath: string, item: vscode.TestItem): void {
		const mtime = getMtime(filePath);
		if (mtime !== undefined && this.parsedMtimes.get(filePath) === mtime) {
			return;
		}

		if (mtime === undefined) {
			this.parsedMtimes.delete(filePath);
		} else {
			this.parsedMtimes.set(filePath, mtime);
		}
		item.children.replace([]);
		parseTestsInFile(filePath, item, this.testController);
	}

	public dispose(): void {
		this.disposables.forEach((d) => void d.dispose());
	}
}

function getMtime(filePath: string): number | undefined {
	try {
		return statSync(filePath).mtimeMs;
	} catch {
		return undefined;
	}
}
