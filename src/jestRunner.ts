import * as vscode from 'vscode';
import * as fs from 'fs';
import { JestRunnerConfig } from './jestRunnerConfig';
import { parse } from './parser';
import {
  escapeRegExp,
  findFullTestName,
  getFileName,
  getDirName,
  pushMany,
  quote,
  unquote,
  updateTestNameIfUsingProperties,
} from './util';

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

  constructor(private readonly config: JestRunnerConfig) {
    this.setup();
    this.openNativeTerminal = config.isRunInExternalNativeTerminal;
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

  public async runCurrentTest(
    argument?: Record<string, unknown> | string,
    options?: string[],
    collectCoverageFromCurrentFile?: boolean,
  ): Promise<void> {
    const currentTestName = typeof argument === 'string' ? argument : undefined;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;

    const finalOptions = options;
    if (collectCoverageFromCurrentFile) {
      const targetFileDir = getDirName(filePath);
      const targetFileName = getFileName(filePath).replace(/\.(test|spec)\./, '.');

      // if a file does not exist with the same name as the test file but without the test/spec part
      // use test file's directory for coverage target
      const coverageTarget = fs.existsSync(`${targetFileDir}/${targetFileName}`)
        ? `**/${targetFileName}`
        : `**/${getFileName(targetFileDir)}/**`;

      finalOptions.push('--collectCoverageFrom');
      finalOptions.push(quote(coverageTarget));
    }

    const testName = currentTestName || this.findCurrentTestName(editor);
    const resolvedTestName = updateTestNameIfUsingProperties(testName);
    const command = this.buildJestCommand(filePath, resolvedTestName, finalOptions);

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
      await this.executeDebugCommand(this.previousCommand);
    }
  }

  public async debugTestsOnPath(filePath: string): Promise<void> {
    const debugConfig = this.config.getDebugConfiguration();
    const standardArgs = this.config.buildJestArgs(filePath, undefined, false);
    pushMany(debugConfig.args, standardArgs);

    await this.goToCwd();
    await this.executeDebugCommand({
      config: debugConfig,
      documentUri: vscode.Uri.file(filePath),
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
    const resolvedTestName = updateTestNameIfUsingProperties(testName);
    const debugConfig = this.config.getDebugConfiguration();
    const standardArgs = this.config.buildJestArgs(filePath, resolvedTestName, false);
    pushMany(debugConfig.args, standardArgs);

    await this.goToCwd();
    await this.executeDebugCommand({
      config: debugConfig,
      documentUri: editor.document.uri,
    });
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

  private findCurrentTestName(editor: vscode.TextEditor): string | undefined {
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
    const args = this.config.buildJestArgs(filePath, testName, true, options);
    return `${this.config.jestCommand} ${args.join(' ')}`;
  }

  private async goToCwd() {
    const command = `cd ${quote(this.config.cwd)}`;
    if (this.config.changeDirectoryToWorkspaceRoot) {
      await this.runTerminalCommand(command);
    }
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
