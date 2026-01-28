'use strict';
import * as vscode from 'vscode';
import { TestRunner } from './testRunner';
import { TestRunnerCodeLensProvider } from './TestRunnerCodeLensProvider';
import { TestRunnerConfig } from './testRunnerConfig';
import { JestTestController } from './TestController';
import { logError } from './util';
import { testFileCache } from './testDetection/testFileCache';

function wrapCommandHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<void> | void,
  commandName: string,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Jest Runner (${commandName}): ${errorMessage}`,
      );
      logError(`Error in ${commandName}`, error);
    }
  };
}

function registerCommand(
  context: vscode.ExtensionContext,
  commandId: string,
  handler: (...args: unknown[]) => Promise<void> | void,
): void {
  const disposable = vscode.commands.registerCommand(
    commandId,
    wrapCommandHandler(handler, commandId.replace('extension.', '')),
  );
  context.subscriptions.push(disposable);
}

export function activate(context: vscode.ExtensionContext): void {
  const config = new TestRunnerConfig();
  const jestRunner = new TestRunner(config);
  const codeLensProvider = new TestRunnerCodeLensProvider(
    config.codeLensOptions,
  );

  const updateJestFileContext = (uri?: vscode.Uri) => {
    let filePath: string | undefined;

    if (uri) {
      // When called with a specific URI (e.g., from explorer selection)
      filePath = uri.fsPath;
    } else {
      // When called without URI, use active editor
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        filePath = editor.document.uri.fsPath;
      }
    }

    if (filePath) {
      const shouldInclude = testFileCache.isTestFile(filePath);
      vscode.commands.executeCommand(
        'setContext',
        'jestrunner.isTestFile',
        shouldInclude,
      );
    } else {
      // No file selected, disable context
      vscode.commands.executeCommand(
        'setContext',
        'jestrunner.isTestFile',
        false,
      );
    }
  };

  // Update context when active editor changes
  // This handles both opening files from explorer and switching between open editors
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => updateJestFileContext()),
  );

  updateJestFileContext();

  const enableTestExplorer = vscode.workspace
    .getConfiguration('jestrunner')
    .get('enableTestExplorer', false);

  if (enableTestExplorer) {
    if (
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      try {
        const jestTestController = new JestTestController(context);
        context.subscriptions.push({
          dispose: () => jestTestController.dispose(),
        });
      } catch (error) {
        logError('Failed to initialize Test Explorer', error);
        vscode.window.showWarningMessage(
          'Jest Runner: Failed to initialize Test Explorer. Check the output for details.',
        );
      }
    } else {
      logError(
        'Test Explorer is enabled but no workspace folders are available',
        new Error('No workspace folders'),
      );
    }
  }

  registerCommand(
    context,
    'extension.runJest',
    async (argument: Record<string, unknown> | string) =>
      jestRunner.runCurrentTest(argument),
  );

  registerCommand(
    context,
    'extension.runJestCoverage',
    async (argument: Record<string, unknown> | string) =>
      jestRunner.runCurrentTest(argument, ['--coverage']),
  );

  registerCommand(
    context,
    'extension.runJestCurrentTestCoverage',
    async (argument: Record<string, unknown> | string) =>
      jestRunner.runCurrentTest(argument, ['--coverage'], true),
  );

  registerCommand(
    context,
    'extension.runJestPath',
    async (argument: vscode.Uri) => jestRunner.runTestsOnPath(argument.fsPath),
  );

  registerCommand(
    context,
    'extension.runJestAndUpdateSnapshots',
    async () => jestRunner.runCurrentTest('', ['-u']),
  );

  registerCommand(
    context,
    'extension.runJestFile',
    async () => jestRunner.runCurrentFile(),
  );

  registerCommand(
    context,
    'extension.debugJest',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        return jestRunner.debugCurrentTest(argument);
      }
      return jestRunner.debugCurrentTest();
    },
  );

  registerCommand(
    context,
    'extension.debugJestPath',
    async (argument: vscode.Uri) =>
      jestRunner.debugTestsOnPath(argument.fsPath),
  );

  registerCommand(
    context,
    'extension.runPrevJest',
    async () => jestRunner.runPreviousTest(),
  );

  registerCommand(
    context,
    'extension.runJestFileWithCoverage',
    async () => jestRunner.runCurrentFile(['--coverage']),
  );

  registerCommand(
    context,
    'extension.runJestFileWithWatchMode',
    async () => jestRunner.runCurrentFile(['--watch']),
  );

  registerCommand(
    context,
    'extension.watchJest',
    async (argument: Record<string, unknown> | string) =>
      jestRunner.runCurrentTest(argument, ['--watch']),
  );

  if (config.isCodeLensEnabled) {
    const docSelectors: vscode.DocumentFilter[] = [
      { pattern: config.getAllPotentialSourceFiles() },
    ];
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(docSelectors, codeLensProvider),
    );
  }

  context.subscriptions.push({ dispose: () => jestRunner.dispose() });
}

export function deactivate(): void { }
