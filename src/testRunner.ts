import * as vscode from 'vscode';
import { TestRunnerConfig } from './testRunnerConfig';
import { parse } from './parser';
import {
  escapeRegExp,
  findFullTestName,
  getFileName,
  getDirName,
  quote,
  unquote,
  updateTestNameIfUsingProperties,
} from './util';
import { existsSync } from 'node:fs';
import { TerminalManager } from './TerminalManager';

interface DebugCommand {
  documentUri: vscode.Uri;
  config: vscode.DebugConfiguration;
}

export class TestRunner {
  private previousCommand: string | DebugCommand;

  private previousFramework: string | undefined;

  private terminalManager = new TerminalManager();

  private commands: string[] = [];

  private isExecuting: boolean = false;

  constructor(private readonly config: TestRunnerConfig) { }

  public async runTestsOnPath(path: string): Promise<void> {
    const command = this.buildCommand(path);
    await this.executeCommand(command, path);
  }

  public async runCurrentTest(
    argument?: Record<string, unknown> | string,
    options?: string[],
    collectCoverageFromCurrentFile?: boolean,
  ): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const currentTestName = typeof argument === 'string' ? argument : undefined;
    const testName = currentTestName || this.findCurrentTestName(editor);
    const resolvedTestName = updateTestNameIfUsingProperties(testName);

    const finalOptions = this.getCoverageOptions(filePath, collectCoverageFromCurrentFile, options);
    const command = this.buildCommand(filePath, resolvedTestName, finalOptions);
    await this.executeCommand(command, filePath);
  }

  public async runCurrentFile(options?: string[]): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const command = this.buildCommand(filePath, undefined, options);
    await this.executeCommand(command, filePath);
  }

  public async runPreviousTest(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    if (typeof this.previousCommand === 'string') {
      const cwd = this.config.changeDirectoryToWorkspaceRoot
        ? this.config.cwd
        : undefined;
      await this.runTerminalCommand(
        this.previousCommand,
        this.previousFramework,
        cwd,
      );
    } else {
      await this.executeDebugCommand(this.previousCommand);
    }
  }

  public async debugTestsOnPath(filePath: string): Promise<void> {
    const debugConfig = this.config.getDebugConfiguration(filePath);

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
    const debugConfig = this.config.getDebugConfiguration(filePath, resolvedTestName);

    await this.executeDebugCommand({
      config: debugConfig,
      documentUri: editor.document.uri,
    });
  }

  private async executeDebugCommand(debugCommand: DebugCommand) {
    if (this.isExecuting) {
      vscode.window.showWarningMessage(
        'Another debug session is already starting. Please wait.',
      );
      return;
    }

    this.isExecuting = true;
    try {
      for (const command of this.commands) {
        await this.runTerminalCommand(command);
      }
      this.commands = [];

      await vscode.debug.startDebugging(undefined, debugCommand.config);

      this.previousCommand = debugCommand;
    } finally {
      this.isExecuting = false;
    }
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

  private buildCommand(
    filePath: string,
    testName?: string,
    options?: string[],
  ): string {
    const command = this.config.getTestCommand(filePath);
    const args = this.config.buildTestArgs(filePath, testName, true, options);
    return `${command} ${args.join(' ')}`;
  }

  private getCoverageOptions(
    filePath: string,
    collectCoverageFromCurrentFile: boolean,
    options?: string[],
  ): string[] {
    if (!collectCoverageFromCurrentFile) {
      return options || [];
    }

    const finalOptions = [...(options || [])];
    const targetFileDir = getDirName(filePath);
    const targetFileName = getFileName(filePath).replace(/\.(test|spec)\./, '.');

    const coverageTarget = existsSync(`${targetFileDir}/${targetFileName}`)
      ? `**/${targetFileName}`
      : `**/${getFileName(targetFileDir)}/**`;

    finalOptions.push('--collectCoverageFrom', quote(coverageTarget));
    return finalOptions;
  }

  private async executeCommand(command: string, filePath: string): Promise<void> {
    const framework = this.config.getTestFramework(filePath);
    const env = this.config.getEnvironmentForRun(filePath);
    this.previousCommand = command;
    this.previousFramework = framework;

    const cwd = this.config.changeDirectoryToWorkspaceRoot
      ? this.config.cwd
      : undefined;

    await this.runTerminalCommand(command, framework, cwd, env);
  }

  private async runTerminalCommand(
    command: string,
    framework?: string,
    cwd?: string,
    env?: Record<string, string>,
  ) {
    await this.terminalManager.runCommand(command, {
      framework,
      cwd,
      env,
      preserveEditorFocus: this.config.preserveEditorFocus,
    });
  }

  public dispose() {
    this.terminalManager.dispose();
  }
}
