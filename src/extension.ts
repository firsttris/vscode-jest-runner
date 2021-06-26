'use strict';
import * as vscode from 'vscode';
import { MultiRunner } from './multiRunner';
import { PlaywrightRunner } from './playwrightRunner';
import { JestRunnerCodeLensProvider } from './JestRunnerCodeLensProvider';
import { JestRunnerConfig } from './jestRunnerConfig';

export function activate(context: vscode.ExtensionContext): void {
  const multiRunner = new MultiRunner();
  const codeLensProvider = new JestRunnerCodeLensProvider();
  const config = new JestRunnerConfig();

  const runJest = vscode.commands.registerCommand(
    'extension.runJest',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        multiRunner.runCurrentTest(argument);
      } else {
        multiRunner.runCurrentTest();
      }
    }
  );
  const runJestPath = vscode.commands.registerCommand('extension.runJestPath', async (argument: vscode.Uri) =>
    multiRunner.runTestsOnPath(argument.path)
  );
  const runJestAndUpdateSnapshots = vscode.commands.registerCommand('extension.runJestAndUpdateSnapshots', async () => {
    multiRunner.runCurrentTest('', ['-u']);
  });
  const runJestFile = vscode.commands.registerCommand('extension.runJestFile', async () =>
    multiRunner.runCurrentFile()
  );
  const debugJest = vscode.commands.registerCommand(
    'extension.debugJest',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        multiRunner.debugCurrentTest(argument);
      } else {
        multiRunner.debugCurrentTest();
      }
    }
  );
  const debugJestPath = vscode.commands.registerCommand('extension.debugJestPath', async (argument: vscode.Uri) =>
    multiRunner.debugTestsOnPath(argument.path)
  );
  const runPrev = vscode.commands.registerCommand('extension.runPrevJest', async () => multiRunner.runPreviousTest());
  const runJestFileWithCoverage = vscode.commands.registerCommand('extension.runJestFileWithCoverage', async () =>
    multiRunner.runCurrentFile(['--coverage'])
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

  // playwright
  const playwrightRunner = new PlaywrightRunner();

  const runPlaywright = vscode.commands.registerCommand(
    'extension.runPlaywright',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        playwrightRunner.runCurrentTest(argument);
      } else {
        playwrightRunner.runCurrentTest();
      }
    }
  );
  const runPlaywrightPath = vscode.commands.registerCommand(
    'extension.runPlaywrightPath',
    async (argument: vscode.Uri) => playwrightRunner.runTestsOnPath(argument.path)
  );
  const runPlaywrightAndUpdateSnapshots = vscode.commands.registerCommand(
    'extension.runPlaywrightAndUpdateSnapshots',
    async () => {
      playwrightRunner.runCurrentTest('', ['--update-snapshots']);
    }
  );
  const runPlaywrightFile = vscode.commands.registerCommand('extension.runPlaywrightFile', async () =>
    playwrightRunner.runCurrentFile()
  );
  const debugPlaywright = vscode.commands.registerCommand(
    'extension.debugPlaywright',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        playwrightRunner.debugCurrentTest(argument);
      } else {
        playwrightRunner.debugCurrentTest();
      }
    }
  );
  const inspectorPlaywright = vscode.commands.registerCommand(
    'extension.inspectorPlaywright',
    async (argument: Record<string, unknown> | string) => {
      if (typeof argument === 'string') {
        playwrightRunner.inspectorCurrentTest(argument);
      } else {
        playwrightRunner.inspectorCurrentTest();
      }
    }
  );
  const debugPlaywrightPath = vscode.commands.registerCommand(
    'extension.debugPlaywrightPath',
    async (argument: vscode.Uri) => playwrightRunner.debugTestsOnPath(argument.path)
  );
  const runPrevPlaywright = vscode.commands.registerCommand('extension.runPrevPlaywright', async () =>
    playwrightRunner.runPreviousTest()
  );
  /*const runPlaywrightFileWithCoverage = vscode.commands.registerCommand(
    'extension.runPlaywrightFileWithCoverage',
    async () => playwrightRunner.runCurrentFile(['--coverage'])
  );*/

  context.subscriptions.push(runPlaywright);
  context.subscriptions.push(runPlaywrightAndUpdateSnapshots);
  context.subscriptions.push(runPlaywrightFile);
  context.subscriptions.push(runPlaywrightPath);
  context.subscriptions.push(debugPlaywright);
  context.subscriptions.push(inspectorPlaywright);
  context.subscriptions.push(debugPlaywrightPath);
  context.subscriptions.push(runPrevPlaywright);
  //context.subscriptions.push(runPlaywrightFileWithCoverage);
}

export function deactivate(): void {
  // deactivate
}
