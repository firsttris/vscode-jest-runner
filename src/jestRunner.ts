import { parse } from 'jest-editor-support';
import * as vscode from 'vscode';
import { JestRunnerConfig } from './jestRunnerConfig';
import { escapeRegExp, exactRegexMatch, normalizePath, pushMany, quote, unquote } from './util';

export class JestRunner {

  private previousCommand: string;

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

    await this.runTerminalCommand(command);
  }

  public async runCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const command = this.buildJestCommand(filePath);

    this.previousCommand = command;

    await this.runTerminalCommand(command);
  }

  public async runPreviousTest() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    await this.runTerminalCommand(this.previousCommand);
  }

  public async debugCurrentTest() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

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

    vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(editor.document.uri), config);
  }

  //
  // private methods
  //

  private findFullTestName(selectedLine: number, children: any[]): string {
    if (!children) {
      return;
    }
    for (const element of children) {
      if (element.start.line === selectedLine) {
        return element.name;
      }
    }
    for (const element of children) {
      const result = this.findFullTestName(selectedLine, element.children);
      if (result) {
        return element.name + ' ' + result;
      }
    }
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

    return exactRegexMatch(escapeRegExp(this.findFullTestName(selectedLine, testFile.root.children)));
  }

  private buildJestCommand(filePath: string, testName?: string): string {
    const args = this.buildJestArgs(filePath, testName, true);
    return `cd ${quote(this.config.currentWorkspaceFolderPath)}; ${this.config.jestCommand} ${args.join(' ')}`;
  }

  private buildJestArgs(filePath: string, testName: string, withQuotes: boolean): string[] {
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

    if (this.config.runOptions) {
      args.push(...this.config.runOptions);
    }

    return args;
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
