'use strict';
import * as vscode from 'vscode';
import { JestRunner } from './jestRunner';
import JestRunnerCodeLensProvider from './JestRunnerCodeLensProvider';

const docSelectors: vscode.DocumentFilter[] = [
  {
    language: 'javascript',
    scheme: 'file'
  },
  {
    language: 'javascript',
    scheme: 'untitled'
  },
  {
    language: 'typescript',
    scheme: 'file'
  },
  {
    language: 'typescript',
    scheme: 'untitled'
  }
];

export function activate(context: vscode.ExtensionContext) {
  const jestRunner = new JestRunner();
  const codeLensProvider = new JestRunnerCodeLensProvider();

  const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelectors, codeLensProvider);

  const runJest = vscode.commands.registerCommand('extension.runJest', async (argument: object | string) => {
    if (typeof argument === 'string') {
      jestRunner.runCurrentTest(argument);
    } else {
      jestRunner.runCurrentTest();
    }
  });
  const runJestFile = vscode.commands.registerCommand('extension.runJestFile', async () => jestRunner.runCurrentFile());
  const debugJest = vscode.commands.registerCommand('extension.debugJest', async () => jestRunner.debugCurrentTest());
  const runPrev = vscode.commands.registerCommand('extension.runPrevJest', async () => jestRunner.runPreviousTest());
  const runJestFileWithCoverage = vscode.commands.registerCommand('extension.runJestFileWithCoverage', async () =>
    jestRunner.runCurrentFile(['--coverage'])
  );

  context.subscriptions.push(codeLensProviderDisposable);
  context.subscriptions.push(runJest);
  context.subscriptions.push(runJestFile);
  context.subscriptions.push(debugJest);
  context.subscriptions.push(runPrev);
  context.subscriptions.push(runJestFileWithCoverage);
}

export function deactivate() {
  // deactivate
}
