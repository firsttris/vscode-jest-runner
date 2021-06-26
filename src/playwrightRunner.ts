import { parse } from './playwright-editor-support';
import * as path from 'path';
import * as vscode from 'vscode';
import { PlaywrightRunnerConfig } from './playwrightRunnerConfig';
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

export class PlaywrightRunner {
  private previousCommand: string | DebugCommand;

  private terminal: vscode.Terminal;

  private readonly config = new PlaywrightRunnerConfig();

  constructor() {
    this.setup();
  }

  //
  // public methods
  //

  public async runTestsOnPath(path: string): Promise<void> {
    const command = this.buildPlaywrightCommand(path);

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
    const command = this.buildPlaywrightCommand(filePath, testName, options);

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
    const command = this.buildPlaywrightCommand(filePath, undefined, options);

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

    this.executeDebugCommand({
      config: debugConfig,
      documentUri: editor.document.uri,
    });
  }

  public async inspectorCurrentTest(currentTestName?: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const testName = currentTestName || this.findCurrentTestName(editor);
    const debugConfig = this.getDebugConfig(filePath, testName);

    // add PWDEBUG:1
    if (!debugConfig.env) debugConfig.env = {};
    debugConfig.env.PWDEBUG = 1;

    this.executeDebugCommand({
      config: debugConfig,
      documentUri: editor.document.uri,
    });
  }

  //
  // private methods
  //

  private executeDebugCommand(debugCommand: DebugCommand) {
    vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(debugCommand.documentUri), debugCommand.config);

    this.previousCommand = debugCommand;
  }

  private getDebugConfig(filePath: string, currentTestName?: string): vscode.DebugConfiguration {
    const config: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'Debug Playwright Tests',
      program: this.config.playwrightBinPath,
      request: 'launch',
      type: 'node',
      cwd: this.config.cwd,
      ...this.config.debugOptions,
    };

    config.args = config.args ? config.args.slice() : [];

    if (this.config.isYarnPnpSupportEnabled) {
      config.args = ['playwright'];
      config.program = '.yarn/releases/yarn-*.cjs';
    }

    const standardArgs = this.buildPlaywrightArgs(filePath, currentTestName, false);
    pushMany(config.args, standardArgs);

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
    const text = editor.document.getText();
    const tests = parse(filePath, text);

    const fullTestName = findFullTestName(selectedLine, tests);
    return fullTestName ? escapeRegExp(fullTestName) : undefined;
  }

  private buildPlaywrightCommand(filePath: string, testName?: string, options?: string[]): string {
    const args = this.buildPlaywrightArgs(filePath, testName, true, options);
    return `${this.config.playwrightCommand} ${args.join(' ')}`;
  }

  private buildPlaywrightArgs(
    filePath: string,
    testName: string,
    withQuotes: boolean,
    options: string[] = []
  ): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str) => str;

    args.push('test');

    const cwd = vscode.Uri.file(this.config.cwd);
    const testfile = path.relative(cwd.fsPath + '/tests', filePath).replace(/\\/g, '/');

    args.push(quoter(escapeRegExpForPath(normalizePath(testfile))));

    const playwrightConfigPath = this.config.getPlaywrightConfigPath(filePath);
    if (playwrightConfigPath) {
      args.push('--config=' + quoter(normalizePath(playwrightConfigPath)));
    }

    if (testName) {
      args.push('-g');
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
      this.terminal = vscode.window.createTerminal('playwright');
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
