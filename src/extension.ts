'use strict';
import * as vscode from 'vscode';
import { TestRunner } from './testRunner';
import { TestRunnerCodeLensProvider } from './TestRunnerCodeLensProvider';
import { TestRunnerConfig } from './testRunnerConfig';
import { JestTestController } from './TestController';
import { shouldIncludeFile, logError } from './util';

function wrapCommandHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<void> | void,
  commandName: string
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Jest Runner (${commandName}): ${errorMessage}`);
      logError(`Error in ${commandName}`, error);
    }
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const config = new TestRunnerConfig();
  const jestRunner = new TestRunner(config);
  const codeLensProvider = new TestRunnerCodeLensProvider(config.codeLensOptions);

  const updateJestFileContext = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const filePath = editor.document.uri.fsPath;
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;
      const shouldInclude = workspaceFolder ? shouldIncludeFile(filePath, workspaceFolder) : false;
      vscode.commands.executeCommand('setContext', 'jestrunner.isJestFile', shouldInclude);
    }
  };

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => updateJestFileContext()));

  updateJestFileContext();

  const enableTestExplorer = vscode.workspace.getConfiguration('jestrunner').get('enableTestExplorer', false);

  if (enableTestExplorer) {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      try {
        const jestTestController = new JestTestController(context);
        context.subscriptions.push({ dispose: () => jestTestController.dispose() });
      } catch (error) {
        logError('Failed to initialize Test Explorer', error);
        vscode.window.showWarningMessage('Jest Runner: Failed to initialize Test Explorer. Check the output for details.');
      }
    } else {
      logError('Test Explorer is enabled but no workspace folders are available', new Error('No workspace folders'));
    }
  }

  const runJest = vscode.commands.registerCommand(
    'extension.runJest',
    wrapCommandHandler(
      async (argument: Record<string, unknown> | string) => {
        return jestRunner.runCurrentTest(argument);
      },
      'runJest'
    ),
  );

  const runJestCoverage = vscode.commands.registerCommand(
    'extension.runJestCoverage',
    wrapCommandHandler(
      async (argument: Record<string, unknown> | string) => {
        return jestRunner.runCurrentTest(argument, ['--coverage']);
      },
      'runJestCoverage'
    ),
  );

  const runJestCurrentTestCoverage = vscode.commands.registerCommand(
    'extension.runJestCurrentTestCoverage',
    wrapCommandHandler(
      async (argument: Record<string, unknown> | string) => {
        return jestRunner.runCurrentTest(argument, ['--coverage'], true);
      },
      'runJestCurrentTestCoverage'
    ),
  );

  const runJestPath = vscode.commands.registerCommand(
    'extension.runJestPath',
    wrapCommandHandler(
      async (argument: vscode.Uri) => jestRunner.runTestsOnPath(argument.fsPath),
      'runJestPath'
    ),
  );
  const runJestAndUpdateSnapshots = vscode.commands.registerCommand(
    'extension.runJestAndUpdateSnapshots',
    wrapCommandHandler(
      async () => {
        jestRunner.runCurrentTest('', ['-u']);
      },
      'runJestAndUpdateSnapshots'
    ),
  );
  const runJestFile = vscode.commands.registerCommand(
    'extension.runJestFile',
    wrapCommandHandler(
      async () => jestRunner.runCurrentFile(),
      'runJestFile'
    ),
  );
  const debugJest = vscode.commands.registerCommand(
    'extension.debugJest',
    wrapCommandHandler(
      async (argument: Record<string, unknown> | string) => {
        if (typeof argument === 'string') {
          return jestRunner.debugCurrentTest(argument);
        } else {
          return jestRunner.debugCurrentTest();
        }
      },
      'debugJest'
    ),
  );
  const debugJestPath = vscode.commands.registerCommand(
    'extension.debugJestPath',
    wrapCommandHandler(
      async (argument: vscode.Uri) => jestRunner.debugTestsOnPath(argument.fsPath),
      'debugJestPath'
    ),
  );
  const runPrev = vscode.commands.registerCommand(
    'extension.runPrevJest',
    wrapCommandHandler(
      async () => jestRunner.runPreviousTest(),
      'runPrevJest'
    ),
  );
  const runJestFileWithCoverage = vscode.commands.registerCommand(
    'extension.runJestFileWithCoverage',
    wrapCommandHandler(
      async () => jestRunner.runCurrentFile(['--coverage']),
      'runJestFileWithCoverage'
    ),
  );

  const runJestFileWithWatchMode = vscode.commands.registerCommand(
    'extension.runJestFileWithWatchMode',
    wrapCommandHandler(
      async () => jestRunner.runCurrentFile(['--watch']),
      'runJestFileWithWatchMode'
    ),
  );

  const watchJest = vscode.commands.registerCommand(
    'extension.watchJest',
    wrapCommandHandler(
      async (argument: Record<string, unknown> | string) => {
        return jestRunner.runCurrentTest(argument, ['--watch']);
      },
      'watchJest'
    ),
  );

  if (config.isCodeLensEnabled) {
    const docSelectors: vscode.DocumentFilter[] = [
      {
        pattern: config.getTestFilePattern(),
      },
    ];
    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelectors, codeLensProvider);
    context.subscriptions.push(codeLensProviderDisposable);
  }
  context.subscriptions.push(runJest);
  context.subscriptions.push(runJestCoverage);
  context.subscriptions.push(runJestCurrentTestCoverage);
  context.subscriptions.push(runJestAndUpdateSnapshots);
  context.subscriptions.push(runJestFile);
  context.subscriptions.push(runJestPath);
  context.subscriptions.push(debugJest);
  context.subscriptions.push(debugJestPath);
  context.subscriptions.push(runPrev);
  context.subscriptions.push(runJestFileWithCoverage);
  context.subscriptions.push(runJestFileWithWatchMode);
  context.subscriptions.push(watchJest);
  
  context.subscriptions.push({ dispose: () => jestRunner.dispose() });
}

export function deactivate(): void {}
