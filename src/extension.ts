'use strict';
import * as vscode from 'vscode';
import { JestRunner } from './jestRunner';
import { JestRunnerCodeLensProvider } from './JestRunnerCodeLensProvider';
import { JestRunnerConfig } from './jestRunnerConfig';

export function activate(context: vscode.ExtensionContext) {
  const jestRunner = new JestRunner();
  const codeLensProvider = new JestRunnerCodeLensProvider();
  const config = new JestRunnerConfig();

  const runJest = vscode.commands.registerCommand('extension.runJest', async (argument: object | string) => {
    if (typeof argument === 'string') {
      jestRunner.runCurrentTest(argument);
    } else {
      jestRunner.runCurrentTest();
    }
  });
  const runJestFile = vscode.commands.registerCommand('extension.runJestFile', async () => jestRunner.runCurrentFile());
  const debugJest = vscode.commands.registerCommand('extension.debugJest', async (argument: object | string) => {
    if (typeof argument === 'string') {
      jestRunner.debugCurrentTest(argument)
    } else {
      jestRunner.debugCurrentTest()
    }
  });
  const runPrev = vscode.commands.registerCommand('extension.runPrevJest', async () => jestRunner.runPreviousTest());
  const runJestFileWithCoverage = vscode.commands.registerCommand('extension.runJestFileWithCoverage', async () =>
    jestRunner.runCurrentFile(['--coverage'])
  );

  if (!config.isCodeLensDisabled) {
    const docSelectors: vscode.DocumentFilter[] = [
      { pattern: vscode.workspace.getConfiguration().get('jestrunner.codeLensSelector') },
    ];
    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelectors, codeLensProvider);
    context.subscriptions.push(codeLensProviderDisposable);
  }
  context.subscriptions.push(runJest);
  context.subscriptions.push(runJestFile);
  context.subscriptions.push(debugJest);
  context.subscriptions.push(runPrev);
  context.subscriptions.push(runJestFileWithCoverage);
}

export function deactivate() {
  // deactivate
}
