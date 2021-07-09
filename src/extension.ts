'use strict';
import * as vscode from 'vscode';
import { MultiRunner } from './multiRunner';
import { TestCase } from './testCase';
import { PlaywrightRunnerCodeLensProvider } from './codeLensProvider';
import { RunnerConfig as config } from './runnerConfig';
import { TestReporter } from './testReporter';

export function activate(context: vscode.ExtensionContext): void {
  const multiRunner = new MultiRunner();
  const codeLensProvider = new PlaywrightRunnerCodeLensProvider();
  const testReporter = new TestReporter(context);

  //現在の編集中のテストを関数単位で実行する
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTest',
    (testname: Record<string, unknown> | string | undefined) => {
      testname = typeof testname === 'string' ? testname : undefined;
      TestCase.toEditor(testname).then( testcase => {
        multiRunner.runTest(testcase);
      });
    }
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.debugTest',
    (testname: Record<string, unknown> | string | undefined) => {
      testname = typeof testname === 'string' ? testname : undefined;
      TestCase.toEditor(testname).then( testcase => {
        multiRunner.debugTest(testcase);
      });
    }
  ));
  //インスペクションを実行する
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.inspectTest',
    (testname: Record<string, unknown> | string | undefined) => {
      testname = typeof testname === 'string' ? testname : undefined;
      TestCase.toEditor(testname).then( testcase => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        multiRunner.debugTest(testcase, { env: { PWDEBUG: 1 } });
      });
    }
  ));

  //現在の編集中のテストをファイル単位で実行する
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTestFile',
    () => {
      TestCase.toEditor('-').then( testcase => {
        testcase.testName = undefined;
        multiRunner.runTest(testcase);
      });
    }
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.debugTestFile',
    () => {
      TestCase.toEditor('-').then( testcase => {
        testcase.testName = undefined;
        multiRunner.debugTest(testcase);
      });
    }
  ));

  //指定したファイルをテスト実行する
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTestPath',
    (file: vscode.Uri) => {
      const testcase = TestCase.toFile(file);
      multiRunner.runTest(testcase);
    }
  ));
  //
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.debugTestPath',
    (file: vscode.Uri) => {
      const testcase = TestCase.toFile(file);
      multiRunner.debugTest(testcase);
    }
  ));

  //スナップショットを更新する
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTestAndUpdateSnapshots',
    () => {
      TestCase.toEditor('-').then( testcase => {
        testcase.testName = undefined;
        multiRunner.runTest(testcase, ['-u']);
      });
    }
  ));

  //テストを再実行する
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runPrevTest',
    () => {
      multiRunner.runPreviousTest();
    }
  ));
  //カバレッジをとる
  context.subscriptions.push(vscode.commands.registerCommand(
    'playwright.runTestFileWithCoverage',
    () => {
      TestCase.toEditor('-').then( testcase => {
        testcase.testName = undefined;
        multiRunner.runTest(testcase, ['--coverage']);
      });
    }
  ));
  //テスト結果をレポートする
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
