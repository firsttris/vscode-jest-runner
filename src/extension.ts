'use strict';
import * as vscode from 'vscode';
import { JestRunner } from './jestRunner';
import { JestRunnerCodeLensProvider } from './JestRunnerCodeLensProvider';
import { JestRunnerConfig } from './jestRunnerConfig';

export function activate(context: vscode.ExtensionContext): void {
  const jestRunner = new JestRunner();
  const codeLensProvider = new JestRunnerCodeLensProvider();
  const config = new JestRunnerConfig();

  const runJest = vscode.commands.registerCommand(
    'extension.runJest',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        jestRunner.runCurrentTest(argument);
      } else {
        jestRunner.runCurrentTest();
      }
    }
  );
  const runJestPath = vscode.commands.registerCommand('extension.runJestPath', async (argument: vscode.Uri) =>
    jestRunner.runTestsOnPath(argument.path)
  );
  const runJestAndUpdateSnapshots = vscode.commands.registerCommand('extension.runJestAndUpdateSnapshots', async () => {
    jestRunner.runCurrentTest('', ['-u']);
  });
  const runJestFile = vscode.commands.registerCommand('extension.runJestFile', async () => jestRunner.runCurrentFile());
  const debugJest = vscode.commands.registerCommand(
    'extension.debugJest',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        jestRunner.debugCurrentTest(argument);
      } else {
        jestRunner.debugCurrentTest();
      }
    }
  );
  const debugJestPath = vscode.commands.registerCommand('extension.debugJestPath', async (argument: vscode.Uri) =>
    jestRunner.debugTestsOnPath(argument.path)
  );
  const runPrev = vscode.commands.registerCommand('extension.runPrevJest', async () => jestRunner.runPreviousTest());
  const runJestFileWithCoverage = vscode.commands.registerCommand('extension.runJestFileWithCoverage', async () =>
    jestRunner.runCurrentFile(['--coverage'])
  );

  const runJestFileWithWatchMode = vscode.commands.registerCommand('extension.runJestFileWithWatchMode', async () =>
    jestRunner.runCurrentFile(['--watch'])
  );

  const watchJest = vscode.commands.registerCommand(
    'extension.watchJest',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        jestRunner.runCurrentTest(argument, ['--watch']);
      } else {
        jestRunner.runCurrentTest(undefined, ['--watch']);
      }
    }
  );

  if (!config.isCodeLensDisabled) {
    const docSelectors: vscode.DocumentFilter[] = [
      { pattern: vscode.workspace.getConfiguration().get('jestrunner.codeLensSelector') },
    ];
    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelectors, codeLensProvider);
    context.subscriptions.push(codeLensProviderDisposable);
  }
  context.subscriptions.push(runJest);
  context.subscriptions.push(runJestAndUpdateSnapshots);
  context.subscriptions.push(runJestFile);
  context.subscriptions.push(runJestPath);
  context.subscriptions.push(debugJest);
  context.subscriptions.push(debugJestPath);
  context.subscriptions.push(runPrev);
  context.subscriptions.push(runJestFileWithCoverage);
  context.subscriptions.push(runJestFileWithWatchMode);
  context.subscriptions.push(watchJest);
}

export function deactivate(): void {
  // deactivate
}
