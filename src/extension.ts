"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { debug } from "util";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let terminalStack: vscode.Terminal[] = [];

  function getLatestTerminal() {
    return terminalStack[terminalStack.length - 1];
  }

  vscode.window.onDidCloseTerminal(() => {
    terminalStack = [];
  });
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "jest-runner" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  let runJest = vscode.commands.registerCommand("extension.runJest", () => {
    // The code you place here will be executed every time your command is executed

    var editor = vscode.window.activeTextEditor;
    if (!editor) {
      return; // No open text editor
    }
    
    var selection = editor.selection;
    var text = editor.document.getText(selection);

    if (terminalStack.length === 0) {
    terminalStack.push(vscode.window.createTerminal('jest'));
    }
    const terminal = getLatestTerminal();
    terminal.show();
    terminal.sendText(`yarn test -t '${text}'`);
  });

  let debugJest = vscode.commands.registerCommand("extension.debugJest", () => {
    // The code you place here will be executed every time your command is executed

    var editor = vscode.window.activeTextEditor;
    if (!editor) {
      return; // No open text editor
    }

    var selection = editor.selection;
    var text = editor.document.getText(selection);

    const config = {
      name: "Debug Jest Tests",
      type: "node",
      request: "launch",
      port: 9229,
      runtimeArgs: [
        "--inspect-brk",
        "${workspaceRoot}/node_modules/jest/bin/jest.js",
        "--runInBand"
      ],
      console: "integratedTerminal",
      internalConsoleOptions: "neverOpen"
    };
    config.runtimeArgs.push("-t " + text);
    vscode.debug.startDebugging(undefined, config);
  });
  context.subscriptions.push(runJest);
  context.subscriptions.push(debugJest);
}

// this method is called when your extension is deactivated
export function deactivate() {}
