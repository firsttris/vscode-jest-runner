'use strict';
import * as vscode from 'vscode';
import { JestRunner } from './jestRunner';

export function activate(context: vscode.ExtensionContext) {
  const jestRunner = new JestRunner();

  const runJest = vscode.commands.registerCommand('extension.runJest', async () => jestRunner.runCurrentTest());
  const runJestFile = vscode.commands.registerCommand('extension.runJestFile', async () => jestRunner.runCurrentFile());
  const debugJest = vscode.commands.registerCommand('extension.debugJest', async () => jestRunner.debugCurrentTest());
  const runPrev = vscode.commands.registerCommand('extension.runPrevJest', async () => jestRunner.runPreviousTest());
  const runJestFileWithCoverage = vscode.commands.registerCommand('extension.runJestFileWithCoverage', async () =>
    jestRunner.runCurrentFileWithCoverage()
  );

  context.subscriptions.push(runJest);
  context.subscriptions.push(runJestFile);
  context.subscriptions.push(debugJest);
  context.subscriptions.push(runPrev);
  context.subscriptions.push(runJestFileWithCoverage);
}

export function deactivate() {
  // deactivate
}
