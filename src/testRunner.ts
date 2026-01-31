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

interface DebugCommand {
  documentUri: vscode.Uri;
  config: vscode.DebugConfiguration;
}

export class TestRunner {
  private previousCommand: string | DebugCommand;

  private previousFramework: string | undefined;

  private terminal: vscode.Terminal;

  private currentTerminalName: string | undefined;

  private commands: string[] = [];

  private disposables: vscode.Disposable[] = [];

  private isExecuting: boolean = false;

  constructor(private readonly config: TestRunnerConfig) {
    this.setup();
  }

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

  private currentTerminalEnv: Record<string, string> | undefined;
  private currentTerminalCwd: string | undefined;

  private async runTerminalCommand(
    command: string,
    framework?: string,
    cwd?: string,
    env?: Record<string, string>,
  ) {
    const terminalName = framework === 'vitest' ? 'vitest' : 'jest';
    const envChanged =
      JSON.stringify(env) !== JSON.stringify(this.currentTerminalEnv);
    const cwdChanged = cwd !== this.currentTerminalCwd;

    if (
      !this.terminal ||
      (this.currentTerminalName && this.currentTerminalName !== terminalName) ||
      envChanged ||
      cwdChanged
    ) {
      if (this.terminal) {
        this.terminal.dispose();
      }
      this.terminal = vscode.window.createTerminal({
        name: terminalName,
        cwd,
        env,
      });
      this.currentTerminalName = terminalName;
      this.currentTerminalEnv = env;
      this.currentTerminalCwd = cwd;
      // Wait for the terminal to initialize
      await this.terminal.processId;
    }

    this.terminal.show(this.config.preserveEditorFocus);
    this.terminal.sendText(command);
  }

  private setup() {
    const terminalCloseHandler = vscode.window.onDidCloseTerminal(
      (closedTerminal: vscode.Terminal) => {
        if (this.terminal === closedTerminal) {
          this.terminal = null;
          this.currentTerminalName = undefined;
        }
      },
    );
    this.disposables.push(terminalCloseHandler);
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }
  }
}
