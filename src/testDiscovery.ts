import * as vscode from 'vscode';
import { relative } from 'node:path';
import { parseTestFile } from './parser';
import { TestRunnerConfig } from './testRunnerConfig';
import { testFileCache } from './testDetection/testFileCache';
import { logError } from './utils/Logger';
import { escapeRegExp, TestNode, updateTestNameIfUsingProperties } from './utils/TestNameUtils';

export async function discoverTests(
  workspaceFolder: vscode.WorkspaceFolder,
  testController: vscode.TestController,
  jestConfig: TestRunnerConfig,
): Promise<void> {
  const testFiles = await findTestFiles(workspaceFolder.uri.fsPath, jestConfig);

  for (const file of testFiles) {
    const fileUri = vscode.Uri.file(file);
    const relativePath = relative(workspaceFolder.uri.fsPath, file);

    const testItem = testController.createTestItem(file, relativePath, fileUri);
    testController.items.add(testItem);

    parseTestsInFile(file, testItem, testController);
  }
}

export function parseTestsInFile(
  filePath: string,
  parentItem: vscode.TestItem,
  testController: vscode.TestController,
): void {
  try {
    const testFile = parseTestFile(filePath);

    if (!testFile || !testFile.root || !testFile.root.children) {
      return;
    }

    processTestNodes(testFile.root.children, parentItem, filePath, testController);
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

    const testId = `${filePath}:${node.type}:${node.start?.line || 0}:${escapeRegExp(cleanFullName || fullName)}`;

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
  const pattern = new vscode.RelativePattern(
    folderPath,
    jestConfig.getAllPotentialSourceFiles(),
  );
  const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');

  return files
    .map((file) => file.fsPath)
    .filter((filePath) => testFileCache.isTestFile(filePath));
}
