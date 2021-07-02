'use strict';
import * as vscode from 'vscode';
import { MultiRunner } from './multiRunner';
import { PlaywrightRunnerCodeLensProvider } from './codeLensProvider';
import { RunnerConfig as config } from './runnerConfig';

export function activate(context: vscode.ExtensionContext): void {
  const multiRunner = new MultiRunner();
  const codeLensProvider = new PlaywrightRunnerCodeLensProvider();

  const runTest = vscode.commands.registerCommand(
    'playwright.runTest',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        multiRunner.runCurrentTest(argument);
      } else {
        multiRunner.runCurrentTest();
      }
    }
  );
  const runTestPath = vscode.commands.registerCommand('playwright.runTestPath', async (argument: vscode.Uri) =>
    multiRunner.runTestsOnPath(argument)
  );
  const runTestAndUpdateSnapshots = vscode.commands.registerCommand(
    'playwright.runTestAndUpdateSnapshots',
    async () => {
      multiRunner.runTestAndUpdateSnapshots('');
    }
  );
  const runTestFile = vscode.commands.registerCommand('playwright.runTestFile', async () =>
    multiRunner.runCurrentFile()
  );
  const debugTest = vscode.commands.registerCommand(
    'playwright.debugTest',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        multiRunner.debugCurrentTest(argument);
      } else {
        multiRunner.debugCurrentTest();
      }
    }
  );
  const debugTestPath = vscode.commands.registerCommand('playwright.debugTestPath', async (argument: vscode.Uri) =>
    multiRunner.debugTestsOnPath(argument)
  );
  const inspectorTest = vscode.commands.registerCommand(
    'playwright.inspectorTest',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        multiRunner.inspectCurrentTest(argument);
      } else {
        multiRunner.inspectCurrentTest();
      }
    }
  );
  const runPrevTest = vscode.commands.registerCommand('playwright.runPrevTest', async () =>
    multiRunner.runPreviousTest()
  );
  const runTestFileWithCoverage = vscode.commands.registerCommand('playwright.runTestFileWithCoverage', async () =>
    multiRunner.runCurrentFile(['--coverage'])
  );

  if (!config.isCodeLensDisabled) {
    const docSelectors: vscode.DocumentFilter[] = [
      { pattern: vscode.workspace.getConfiguration().get('playwrightrunner.codeLensSelector') },
    ];
    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelectors, codeLensProvider);
    context.subscriptions.push(codeLensProviderDisposable);
  }
  context.subscriptions.push(runTest);
  context.subscriptions.push(runTestAndUpdateSnapshots);
  context.subscriptions.push(runTestFile);
  context.subscriptions.push(runTestPath);
  context.subscriptions.push(debugTest);
  context.subscriptions.push(debugTestPath);
  context.subscriptions.push(inspectorTest);
  context.subscriptions.push(runPrevTest);
  context.subscriptions.push(runTestFileWithCoverage);
}

export function deactivate(): void {
  // deactivate
}
