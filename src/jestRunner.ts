import { parse } from 'jest-editor-support';
import * as vscode from 'vscode';
import { JestRunnerConfig } from './jestRunnerConfig';
import { escapeRegExp, findFullTestName, normalizePath, pushMany, quote, unquote } from './util';

interface DebugCommand {
  documentUri: vscode.Uri;
  config: vscode.DebugConfiguration;
}

export class JestRunner {
  private previousCommand: string | DebugCommand;

  private terminal: vscode.Terminal;

  private readonly config = new JestRunnerConfig();

  constructor() {
    this.setup();
  }

  //
  // public methods
  //

  public async runCurrentTest() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const testName = this.findCurrentTestName(editor);
    const command = this.buildJestCommand(filePath, testName);

    this.previousCommand = command;

    await this.goToWorkspaceDirectory();
    await this.runTerminalCommand(command);
  }

  public async runCurrentFile(options?: string[]) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    let command: string;

    if (options) {
      const testName = undefined;
      command = this.buildJestCommand(filePath, testName, options);
    } else {
      command = this.buildJestCommand(filePath);
    }

    this.previousCommand = command;

    await this.goToWorkspaceDirectory();
    await this.runTerminalCommand(command);
  }

  public async runPreviousTest() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    if (typeof this.previousCommand === 'string') {
      await this.goToWorkspaceDirectory();
      await this.runTerminalCommand(this.previousCommand);
    } else {
      await this.executeDebugCommand(this.previousCommand);
    }
  }

  public async debugCurrentTest() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const debugCommand = this.getDebugCommand(editor);

    this.executeDebugCommand(debugCommand);
  }

  //
  // private methods
  //

  private executeDebugCommand(debugCommand: DebugCommand) {
    vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(debugCommand.documentUri), debugCommand.config);

    this.previousCommand = debugCommand;
  }

  private getDebugCommand(editor: vscode.TextEditor): DebugCommand {
    const config: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'Debug Jest Tests',
      program: this.config.jestBinPath,
      request: 'launch',
      type: 'node',
      ...this.config.debugOptions
    };
    config.args = config.args ? config.args.slice() : [];

    const filePath = editor.document.fileName;
    const testName = this.findCurrentTestName(editor);

    const standardArgs = this.buildJestArgs(filePath, testName, false);
    pushMany(config.args, standardArgs);

    config.args.push('--runInBand');

    return {
      config,
      documentUri: editor.document.uri
    };
  }

  private findCurrentTestName(editor: vscode.TextEditor): string {
    // from selection
    const { selection, document } = editor;
    if (!selection.isEmpty) {
      return unquote(document.getText(selection));
    }

    const selectedLine = selection.active.line + 1;
    const filePath = editor.document.fileName;
    const testFile = parse(filePath);

    return escapeRegExp(findFullTestName(selectedLine, testFile.root.children));
  }

  private buildJestCommand(filePath: string, testName?: string, options?: string[]): string {
    const args = this.buildJestArgs(filePath, testName, true, options);
    return `${this.config.jestCommand} ${args.join(' ')}`;
  }

  private buildJestArgs(filePath: string, testName: string, withQuotes: boolean, options: string[] = []): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : str => str;

    args.push(quoter(normalizePath(filePath)));

    if (this.config.jestConfigPath) {
      args.push('-c');
      args.push(quoter(normalizePath(this.config.jestConfigPath)));
    }

    if (testName) {
      args.push('-t');
      args.push(quoter(testName));
    }

    const setOptions = new Set(options);

    if (this.config.runOptions) {
      this.config.runOptions.forEach(option => setOptions.add(option));
    }

    args.push(...setOptions);

    return args;
  }

  private async goToWorkspaceDirectory() {
    await this.runTerminalCommand(`cd ${quote(this.config.currentWorkspaceFolderPath)}`);
  }

  private async runTerminalCommand(command: string) {
    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal('jest');
    }
    this.terminal.show();
    await vscode.commands.executeCommand('workbench.action.terminal.clear');
    this.terminal.sendText(command);
  }

  private setup() {
    vscode.window.onDidCloseTerminal(() => {
      this.terminal = null;
    });
  }
}
