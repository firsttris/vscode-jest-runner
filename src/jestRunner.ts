import { parse } from './parser';
import * as vscode from 'vscode';
import { JestRunnerConfig } from './jestRunnerConfig';
import {
  escapeRegExpForPath,
  escapeRegExp,
  escapeSingleQuotes,
  findFullTestName,
  normalizePath,
  pushMany,
  quote,
  unquote,
} from './util';

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

  public async runTestsOnPath(path: string): Promise<void> {
    const command = this.buildJestCommand(path);

    this.previousCommand = command;

    await this.goToCwd();
    await this.runTerminalCommand(command);
  }

  public async runCurrentTest(currentTestName?: string, options?: string[]): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const testName = currentTestName || this.findCurrentTestName(editor);
    const command = this.buildJestCommand(filePath, testName, options);

    this.previousCommand = command;

    await this.goToCwd();
    await this.runTerminalCommand(command);
  }

  public async runCurrentFile(options?: string[]): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const command = this.buildJestCommand(filePath, undefined, options);

    this.previousCommand = command;

    await this.goToCwd();
    await this.runTerminalCommand(command);
  }

  public async runPreviousTest(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    if (typeof this.previousCommand === 'string') {
      await this.goToCwd();
      await this.runTerminalCommand(this.previousCommand);
    } else {
      this.executeDebugCommand(this.previousCommand);
    }
  }

  public async debugTestsOnPath(path: string): Promise<void> {
    const debugConfig = this.getDebugConfig(path);

    await this.goToCwd();
    this.executeDebugCommand({
      config: debugConfig,
      documentUri: vscode.Uri.file(path),
    });
  }

  public async debugCurrentTest(currentTestName?: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const testName = currentTestName || this.findCurrentTestName(editor);
    const debugConfig = this.getDebugConfig(filePath, testName);

    await this.goToCwd();
    this.executeDebugCommand({
      config: debugConfig,
      documentUri: editor.document.uri,
    });
  }

  //
  // private methods
  //

  private executeDebugCommand(debugCommand: DebugCommand) {
    vscode.debug.startDebugging(undefined, debugCommand.config);

    this.previousCommand = debugCommand;
  }

  private getDebugConfig(filePath: string, currentTestName?: string): vscode.DebugConfiguration {
    const config: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'Debug Jest Tests',
      program: this.config.jestBinPath,
      request: 'launch',
      type: 'node',
      cwd: this.config.cwd,
      ...this.config.debugOptions,
    };

    config.args = config.args ? config.args.slice() : [];

    if (this.config.isYarnPnpSupportEnabled) {
      config.args = ['jest'];
      config.program = `.yarn/releases/${this.config.getYarnPnpCommand}`;
    }

    const standardArgs = this.buildJestArgs(filePath, currentTestName, false);
    pushMany(config.args, standardArgs);
    config.args.push('--runInBand');

    return config;
  }

  private findCurrentTestName(editor: vscode.TextEditor): string | undefined {
    // from selection
    const { selection, document } = editor;
    if (!selection.isEmpty) {
      return unquote(document.getText(selection));
    }

    const selectedLine = selection.active.line + 1;
    const filePath = editor.document.fileName;
    const testFile = parse(filePath);

    const fullTestName = findFullTestName(selectedLine, testFile.root.children);
    return fullTestName ? escapeRegExp(fullTestName) : undefined;
  }

  private buildJestCommand(filePath: string, testName?: string, options?: string[]): string {
    const args = this.buildJestArgs(filePath, testName, true, options);
    return `${this.config.jestCommand} ${args.join(' ')}`;
  }

  private buildJestArgs(filePath: string, testName: string, withQuotes: boolean, options: string[] = []): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str) => str;

    args.push(quoter(escapeRegExpForPath(normalizePath(filePath))));

    const jestConfigPath = this.config.getJestConfigPath(filePath);
    if (jestConfigPath) {
      args.push('-c');
      args.push(quoter(normalizePath(jestConfigPath)));
    }

    if (testName) {
      args.push('-t');
      args.push(quoter(escapeSingleQuotes(testName)));
    }

    const setOptions = new Set(options);

    if (this.config.runOptions) {
      this.config.runOptions.forEach((option) => setOptions.add(option));
    }

    args.push(...setOptions);

    return args;
  }

  private async goToCwd() {
    if (this.config.changeDirectoryToWorkspaceRoot) {
      await this.runTerminalCommand(`cd ${quote(this.config.cwd)}`);
    }
  }

  private async runTerminalCommand(command: string) {
    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal('jest');
    }
    this.terminal.show(this.config.preserveEditorFocus);
    await vscode.commands.executeCommand('workbench.action.terminal.clear');
    this.terminal.sendText(command);
  }

  private setup() {
    vscode.window.onDidCloseTerminal(() => {
      this.terminal = null;
    });
  }
}
