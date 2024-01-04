import * as vscode from 'vscode';

import { JestRunnerConfig } from './jestRunnerConfig';
import { parse } from './parser';
import { pushMany, quote, unquote } from './util';
import { CommandBuilder } from './commandBuilder';
import { findFullTestName } from './codeLensUtil';

interface DebugCommand {
  documentUri: vscode.Uri;
  config: vscode.DebugConfiguration;
}

export class JestRunner {
  private previousCommand: string | DebugCommand;

  private terminal: vscode.Terminal;

  // support for running in a native external terminal
  // force runTerminalCommand to push to a queue and run in a native external
  // terminal after all commands been pushed
  private openNativeTerminal: boolean;
  private commands: string[] = [];
  private readonly commandBuilder: CommandBuilder;

  constructor(private readonly config: JestRunnerConfig) {
    this.setup();
    this.commandBuilder = new CommandBuilder(this.config);
    this.openNativeTerminal = config.isRunInExternalNativeTerminal;
  }

  //
  // public methods
  //

  public async runTestsOnPath(path: string): Promise<void> {
    const command = this.commandBuilder.buildJestCommand(path);

    this.previousCommand = command;

    await this.goToCwd();
    await this.runTerminalCommand(command);

    await this.runExternalNativeTerminalCommand(this.commands);
  }

  public async runCurrentTest(argument?: Record<string, unknown> | string, options?: string[]): Promise<void> {
    const currentTestName = typeof argument === 'string' ? argument : undefined;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const testName = currentTestName || this.findCurrentTestName(editor);
    const command = this.commandBuilder.buildJestCommand(filePath, testName, options);

    this.previousCommand = command;

    await this.goToCwd();
    await this.runTerminalCommand(command);

    await this.runExternalNativeTerminalCommand(this.commands);
  }

  public async runCurrentFile(options?: string[]): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const command = this.commandBuilder.buildJestCommand(filePath, undefined, options);

    this.previousCommand = command;

    await this.goToCwd();
    await this.runTerminalCommand(command);

    await this.runExternalNativeTerminalCommand(this.commands);
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
      await this.executeDebugCommand(this.previousCommand);
    }

    await this.runExternalNativeTerminalCommand(this.commands);
  }

  public async debugTestsOnPath(path: string): Promise<void> {
    const debugConfig = this.getDebugConfig(path);

    await this.goToCwd();
    await this.executeDebugCommand({
      config: debugConfig,
      documentUri: vscode.Uri.file(path),
    });

    await this.runExternalNativeTerminalCommand(this.commands);
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
    await this.executeDebugCommand({
      config: debugConfig,
      documentUri: editor.document.uri,
    });

    await this.runExternalNativeTerminalCommand(this.commands);
  }

  //
  // private methods
  //

  private async executeDebugCommand(debugCommand: DebugCommand) {
    // prevent open of external terminal when debug command is executed
    this.openNativeTerminal = false;

    for (const command of this.commands) {
      await this.runTerminalCommand(command);
    }
    this.commands = [];

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

    const standardArgs = this.commandBuilder.buildJestArgs(filePath, currentTestName);
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
    return fullTestName;
  }

  private async goToCwd() {
    const command = `cd ${quote(this.config.cwd)}`;
    if (this.config.changeDirectoryToWorkspaceRoot) {
      await this.runTerminalCommand(command);
    }
  }

  private buildNativeTerminalCommand(toRun: string): string {
    const command = `ttab -t 'jest-runner' "${toRun}"`;
    return command;
  }

  private async runExternalNativeTerminalCommand(commands: string[]): Promise<void> {
    if (!this.openNativeTerminal) {
      this.commands = [];
      return;
    }

    const command: string = commands.join('; ');
    const externalCommand: string = this.buildNativeTerminalCommand(command);
    this.commands = [];

    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal('jest');
    }

    this.terminal.show(this.config.preserveEditorFocus);
    await vscode.commands.executeCommand('workbench.action.terminal.clear');
    this.terminal.sendText(externalCommand);
  }

  private async runTerminalCommand(command: string) {
    if (this.openNativeTerminal) {
      this.commands.push(command);
      return;
    }

    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal('jest');
    }
    this.terminal.show(this.config.preserveEditorFocus);
    await vscode.commands.executeCommand('workbench.action.terminal.clear');
    this.terminal.sendText(command);
  }

  private setup() {
    vscode.window.onDidCloseTerminal((closedTerminal: vscode.Terminal) => {
      if (this.terminal === closedTerminal) {
        this.terminal = null;
      }
    });
  }
}
