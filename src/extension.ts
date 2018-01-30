'use strict';
import { debug } from 'util';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  let terminalStack: vscode.Terminal[] = [];

  function getLatestTerminal() {
    return terminalStack[terminalStack.length - 1];
  }

  function getConfig() {
    return vscode.workspace.getConfiguration().get('jestrunner.configPath');
  }

  vscode.window.onDidCloseTerminal(() => {
    terminalStack = [];
  });

  const runJest = vscode.commands.registerCommand('extension.runJest', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const configuration = getConfig();
    const selection = editor.selection;
    const text = editor.document.getText(selection);

    const jestPath = process.platform.includes('win32') ? 'node_modules/jest/bin/jest.js' : 'node_modules/.bin/jest';

    if (terminalStack.length === 0) {
      terminalStack.push(vscode.window.createTerminal('jest'));
    }

    let command = `node ${jestPath} -t '${text}'`;
    if (configuration) {
      command += ` -c '${configuration}'`;
    }
    const terminal = getLatestTerminal();
    terminal.show();
    terminal.sendText(command);
  });

  const debugJest = vscode.commands.registerCommand('extension.debugJest', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const configuration = getConfig();
    const selection = editor.selection;
    const text = editor.document.getText(selection);

    const config = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'Debug Jest Tests',
      port: 9229,
      request: 'launch',
      runtimeArgs: [],
      type: 'node'
    };
    const jestPath = process.platform.includes('win32')
      ? '${workspaceRoot}/node_modules/jest/bin/jest.js'
      : '${workspaceRoot}/node_modules/.bin/jest';
    config.runtimeArgs.push('--inspect-brk');
    config.runtimeArgs.push(jestPath);
    config.runtimeArgs.push('-i');
    if (configuration) {
      config.runtimeArgs.push(`-c ${configuration}`);
    }
    config.runtimeArgs.push(`-t ${text}`);
    vscode.debug.startDebugging(undefined, config);
  });

  context.subscriptions.push(runJest);
  context.subscriptions.push(debugJest);
}

export function deactivate() {
  // deactivate
}
