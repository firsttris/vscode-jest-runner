'use strict';
import { join } from 'path';
import * as vscode from 'vscode';
import { parseTestName, platformWin32, quote, slash } from './util';

let previousCommand;

export function activate(context: vscode.ExtensionContext) {
  let terminal: vscode.Terminal | null;

  function getJestCommand(): string {
    return vscode.workspace.getConfiguration().get('jestrunner.jestCommand');
  }

  function getJestPath(): string {
    const jestPath: string = vscode.workspace.getConfiguration().get('jestrunner.jestPath');
    if (jestPath) {
      return jestPath;
    }
    const editor = vscode.window.activeTextEditor;
    const editorFolderPath = vscode.workspace.getWorkspaceFolder(editor.document.uri).uri.fsPath;
    const jestDirectoy = platformWin32() ? 'node_modules/jest/bin/jest.js' : 'node_modules/.bin/jest';
    return join(editorFolderPath, jestDirectoy);
  }

  function getConfigPath(): string {
    const configPath: string = vscode.workspace.getConfiguration().get('jestrunner.configPath');
    if (!configPath) {
      return '';
    }
    return join(vscode.workspace.workspaceFolders[0].uri.fsPath, configPath);
  }

  vscode.window.onDidCloseTerminal(() => {
    terminal = null;
  });

  const execRunJest = async ({ useTestName, runPrev } = { useTestName: true, runPrev: false }) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    let command = previousCommand;

    if (!runPrev) {
      const configuration = slash(getConfigPath());
      const testName = useTestName ? parseTestName(editor) : '';
      const fileName = slash(editor.document.fileName);
      const jestPath = slash(getJestPath());
      const jestCommand = getJestCommand() || `node ${quote(jestPath)}`;

      command = `${jestCommand} ${quote(fileName)}`;

      if (configuration) {
        command += ` -c ${quote(configuration)}`;
      }

      if (testName !== '') {
        command += ` -t ${quote(testName)}`;
      }
    }

    previousCommand = command;

    await editor.document.save();
    if (!terminal) {
      terminal = vscode.window.createTerminal('jest');
    }
    terminal.show();
    await vscode.commands.executeCommand('workbench.action.terminal.clear');
    terminal.sendText(command);
  };

  const runJestFile = vscode.commands.registerCommand('extension.runJestFile', async () =>
    execRunJest({ useTestName: false, runPrev: false })
  );

  const runJest = vscode.commands.registerCommand('extension.runJest', async () => execRunJest());

  const runPrev = vscode.commands.registerCommand('extension.runPrevJest', async () =>
    execRunJest({ useTestName: false, runPrev: true })
  );

  const debugJest = vscode.commands.registerCommand('extension.debugJest', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const configuration = slash(getConfigPath());
    const testName = parseTestName(editor);
    const {
      args: runArgs,
      ...restRunOptions
    } = vscode.workspace.getConfiguration().get('jestrunner.runOptions');

    const config: any = {
      args: runArgs ? [...runArgs] : [],
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'Debug Jest Tests',
      program: getJestPath(),
      request: 'launch',
      type: 'node',
      ...restRunOptions
    };

    config.args.push('-i');
    config.args.push(quote(slash(editor.document.fileName)));
    if (configuration) {
      config.args.push('-c');
      config.args.push(quote(configuration));
    }

    if (testName !== '') {
      config.args.push('-t');
      config.args.push(testName.includes(' ') ? testName : quote(testName));
    }

    await editor.document.save();

    vscode.debug.startDebugging(undefined, config);
  });

  context.subscriptions.push(runJest);
  context.subscriptions.push(runJestFile);
  context.subscriptions.push(debugJest);
  context.subscriptions.push(runPrev);
}

export function deactivate() {
  // deactivate
}
