'use strict';
import { join } from 'path';
import * as vscode from 'vscode';
import { parseTestName, platformWin32, quote } from './util';

export function activate(context: vscode.ExtensionContext) {
  let terminalStack: vscode.Terminal[] = [];

  function getLatestTerminal() {
    return terminalStack[terminalStack.length - 1];
  }

  function getJestCommand(): string {
    const jestCommand: string = vscode.workspace.getConfiguration().get('jestrunner.jestCommand');
    if (jestCommand) {
      return jestCommand;
    }
    const jestDirectoy = platformWin32() ? 'node node_modules/jest/bin/jest.js' : 'node node_modules/.bin/jest';
    return join(vscode.workspace.workspaceFolders[0].uri.fsPath, jestDirectoy);
  }

  function getConfigPath(): string {
    const configPath: string = vscode.workspace.getConfiguration().get('jestrunner.configPath');
    if (!configPath) {
      return;
    }
    return join(vscode.workspace.workspaceFolders[0].uri.fsPath, configPath);
  }

  vscode.window.onDidCloseTerminal(() => {
    terminalStack = [];
  });

  const runJest = vscode.commands.registerCommand('extension.runJest', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const configuration = getConfigPath();
    const testName = parseTestName(editor);
    const fileName = editor.document.fileName;
    const jestPath = getJestCommand();

    let command = `${jestPath} ${fileName}`;
    if (configuration) {
      command += ` -c ${quote(configuration)}`;
    }

    if (testName !== '') {
      command += ` -t ${quote(testName)}`;
    }

    await editor.document.save();

    if (terminalStack.length === 0) {
      terminalStack.push(vscode.window.createTerminal('jest'));
    }

    const terminal = getLatestTerminal();
    terminal.show();
    vscode.commands.executeCommand('workbench.action.terminal.clear');
    terminal.sendText(command);
  });

  const debugJest = vscode.commands.registerCommand('extension.debugJest', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const configuration = getConfigPath();
    const testName = parseTestName(editor);

    const config = {
      args: [],
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'Debug Jest Tests',
      program: getJestCommand(),
      request: 'launch',
      type: 'node'
    };

    config.args.push('-i');
    if (configuration) {
      config.args.push('-c');
      config.args.push(configuration);
    }
    config.args.push('-t');
    config.args.push(testName);

    await editor.document.save();

    vscode.debug.startDebugging(undefined, config);
  });

  context.subscriptions.push(runJest);
  context.subscriptions.push(debugJest);
}

export function deactivate() {
  // deactivate
}
