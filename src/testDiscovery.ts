import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import * as vscode from 'vscode';
import { getProjectPath } from './config/Settings';
import { parseTestFile } from './parser';
import { testFileCache } from './testDetection/testFileCache';
import type { TestRunnerConfig } from './testRunnerConfig';
import { logDebug, logError } from './utils/Logger';
import {
	type TestNode,
	updateTestNameIfUsingProperties,
} from './utils/TestNameUtils';

export async function discoverTests(
	workspaceFolder: vscode.WorkspaceFolder,
	testController: vscode.TestController,
	jestConfig: TestRunnerConfig,
): Promise<void> {
	const testFiles = await findTestFiles(workspaceFolder.uri.fsPath, jestConfig);

	for (const [index, file] of testFiles.entries()) {
		// Parsing is synchronous; yield now and then so a large workspace does
		// not block the extension host for the whole discovery.
		if (index > 0 && index % FILES_PER_BATCH === 0) {
			await yieldToEventLoop();
		}

		const testItem = getOrCreateFileTestItem(
			testController,
			workspaceFolder,
			file,
		);

		parseTestsInFile(file, testItem, testController);
	}
}

const FILES_PER_BATCH = 50;

const yieldToEventLoop = (): Promise<void> =>
	new Promise((resolve) => setImmediate(resolve));

export function getOrCreateFolderTestItem(
	testController: vscode.TestController,
	workspaceFolder: vscode.WorkspaceFolder,
	dirPath: string,
): vscode.TestItem | undefined {
	const relativeDir = relative(workspaceFolder.uri.fsPath, dirPath);
	if (!relativeDir || relativeDir === '' || relativeDir.startsWith('..')) {
		return undefined;
	}

	const parts = relativeDir.split(sep);
	let currentCollection = testController.items;
	let currentItem: vscode.TestItem | undefined;
	let currentPath = workspaceFolder.uri.fsPath;

	for (const part of parts) {
		currentPath = join(currentPath, part);
		const id = currentPath;
		let item = currentCollection.get(id);
		if (!item) {
			item = testController.createTestItem(
				id,
				part,
				vscode.Uri.file(currentPath),
			);
			item.canResolveChildren = false;
			currentCollection.add(item);
		}
		currentCollection = item.children;
		currentItem = item;
	}
	return currentItem;
}

export function findFolderTestItem(
	testController: vscode.TestController,
	workspaceFolder: vscode.WorkspaceFolder,
	dirPath: string,
): vscode.TestItem | undefined {
	const relativeDir = relative(workspaceFolder.uri.fsPath, dirPath);
	if (!relativeDir || relativeDir === '' || relativeDir.startsWith('..')) {
		return undefined;
	}

	const parts = relativeDir.split(sep);
	let currentCollection = testController.items;
	let currentItem: vscode.TestItem | undefined;
	let currentPath = workspaceFolder.uri.fsPath;

	for (const part of parts) {
		currentPath = join(currentPath, part);
		const item = currentCollection.get(currentPath);
		if (!item) {
			return undefined;
		}
		currentCollection = item.children;
		currentItem = item;
	}

	return currentItem;
}

/** Finds the item of an already discovered test file, nested or not. */
export function findFileTestItem(
	testController: vscode.TestController,
	workspaceFolder: vscode.WorkspaceFolder | undefined,
	filePath: string,
): vscode.TestItem | undefined {
	const rootItem = testController.items.get(filePath);
	if (rootItem || !workspaceFolder) {
		return rootItem;
	}

	return findFolderTestItem(
		testController,
		workspaceFolder,
		dirname(filePath),
	)?.children.get(filePath);
}

export function getOrCreateFileTestItem(
	testController: vscode.TestController,
	workspaceFolder: vscode.WorkspaceFolder,
	filePath: string,
): vscode.TestItem {
	const fileUri = vscode.Uri.file(filePath);
	const label = basename(filePath);
	const dirPath = dirname(filePath);

	const parentItem = getOrCreateFolderTestItem(
		testController,
		workspaceFolder,
		dirPath,
	);

	const existingItem = parentItem
		? parentItem.children.get(filePath)
		: testController.items.get(filePath);

	if (existingItem) {
		return existingItem;
	}

	const testItem = testController.createTestItem(filePath, label, fileUri);
	if (parentItem) {
		parentItem.children.add(testItem);
	} else {
		testController.items.add(testItem);
	}

	return testItem;
}

export function parseTestsInFile(
	filePath: string,
	parentItem: vscode.TestItem,
	testController: vscode.TestController,
): void {
	try {
		const testFile = parseTestFile(filePath);

		if (!testFile?.root?.children) {
			return;
		}

		processTestNodes(
			testFile.root.children,
			parentItem,
			filePath,
			testController,
		);
	} catch (error) {
		logError(`Error parsing tests in ${filePath}`, error);
	}
}

export function processTestNodes(
	nodes: TestNode[],
	parentItem: vscode.TestItem,
	filePath: string,
	testController: vscode.TestController,
	namePrefix: string = '',
): void {
	for (const node of nodes) {
		if (!node.name) {
			continue;
		}

		const fullName = namePrefix ? `${namePrefix} ${node.name}` : node.name;

		const cleanTestName = updateTestNameIfUsingProperties(node.name);
		const cleanFullName = updateTestNameIfUsingProperties(fullName);

		const testId = `${filePath}:${node.type}:${node.start?.line || 0}:${cleanFullName || fullName}`;

		const testItem = testController.createTestItem(
			testId,
			cleanTestName || node.name,
			parentItem.uri,
		);

		testItem.tags =
			node.type === 'describe'
				? [new vscode.TestTag('suite')]
				: [new vscode.TestTag('test')];

		if (node.start && node.start.line > 0) {
			try {
				testItem.range = new vscode.Range(
					new vscode.Position(node.start.line - 1, node.start.column || 0),
					new vscode.Position(
						(node.end?.line || node.start.line) - 1,
						node.end?.column || 100,
					),
				);
			} catch (error) {
				logError(`Error setting range for ${node.name}`, error);
			}
		}

		parentItem.children.add(testItem);

		if (node.children && node.children.length > 0) {
			processTestNodes(
				node.children,
				testItem,
				filePath,
				testController,
				cleanFullName || fullName,
			);
		}
	}
}

export async function findTestFiles(
	folderPath: string,
	jestConfig: TestRunnerConfig,
): Promise<string[]> {
	const configuredProjectPath = getProjectPath();
	const discoveryRootPath = configuredProjectPath
		? resolve(folderPath, configuredProjectPath)
		: folderPath;

	if (configuredProjectPath) {
		logDebug(
			`Using jestrunner.projectPath for discovery root: ${discoveryRootPath}`,
		);
	}

	const pattern = new vscode.RelativePattern(
		discoveryRootPath,
		jestConfig.getAllPotentialSourceFiles(),
	);
	const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');

	const testFiles: string[] = [];
	for (const [index, file] of files.entries()) {
		if (index > 0 && index % FILES_PER_BATCH === 0) {
			await yieldToEventLoop();
		}
		if (testFileCache.isTestFile(file.fsPath)) {
			testFiles.push(file.fsPath);
		}
	}
	return testFiles;
}
