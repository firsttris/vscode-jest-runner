'use strict';
import * as vscode from 'vscode';
import { MultiRunner } from './multiRunner';
import { PlaywrightRunnerCodeLensProvider } from './codeLensProvider';
import { RunnerConfig as config } from './runnerConfig';
import { TestReporter } from './testReporter';

export function activate(context: vscode.ExtensionContext): void {
  const multiRunner = new MultiRunner();
  const codeLensProvider = new PlaywrightRunnerCodeLensProvider();
  const testReporter = new TestReporter(context);

  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTest',
    (testname: Record<string, unknown> | string) => {
      multiRunner.runCurrentTest(typeof testname === 'string' ? testname : undefined);
    }
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTestPath',
    (file: vscode.Uri) =>
    multiRunner.runTestsOnPath(file)
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTestAndUpdateSnapshots',
    () => {
      multiRunner.runTestAndUpdateSnapshots('');
    }
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTestFile',
    () =>
    multiRunner.runCurrentFile()
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.debugTest',
    (testname: Record<string, unknown> | string) => {
      multiRunner.debugCurrentTest(typeof testname === 'string' ? testname : undefined);
    }
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.debugTestPath',
    (file: vscode.Uri) =>
    multiRunner.debugTestsOnPath(file)
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.inspectTest',
    (testname: Record<string, unknown> | string) => {
      multiRunner.inspectCurrentTest(typeof testname === 'string' ? testname : undefined);
    }
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runPrevTest',
    () =>
    multiRunner.runPreviousTest()
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTestFileWithCoverage',
    () =>
    multiRunner.runCurrentFile(['--coverage'])
  ));

  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.showTestReport',
    (uri:vscode.Uri) => {
      testReporter.update(uri);
  }));

  if (!config.isCodeLensDisabled) {
    const docSelectors: vscode.DocumentFilter[] = [
      { pattern: vscode.workspace.getConfiguration().get('playwrightrunner.codeLensSelector') },
    ];
    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelectors, codeLensProvider);
    context.subscriptions.push(codeLensProviderDisposable);
  }
}

export function deactivate(): void {
  // deactivate
}
