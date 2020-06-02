'use strict';
import * as vscode from 'vscode';
import { JestRunner } from './jestRunner';
import JestRunnerCodeLensProvider from './JestRunnerCodeLensProvider';
import { JestRunnerConfig } from './jestRunnerConfig';

const docSelectors: vscode.DocumentFilter[] = [
  {
    pattern: '**/*.test.tsx' 
  },
  {
    pattern: '**/*.test.ts' 
  },
  {
    pattern: '**/*.test.js' 
  },
  {
    pattern: '**/*.test.jsx' 
  }
];

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
  const debugJest = vscode.commands.registerCommand('extension.debugJest', async () => jestRunner.debugCurrentTest());
  const runPrev = vscode.commands.registerCommand('extension.runPrevJest', async () => jestRunner.runPreviousTest());
  const runJestFileWithCoverage = vscode.commands.registerCommand('extension.runJestFileWithCoverage', async () =>
    jestRunner.runCurrentFile(['--coverage'])
  );

  if(!config.isCodeLensDisabled) {
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
