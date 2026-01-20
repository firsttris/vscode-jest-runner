import * as vscode from 'vscode';
import * as fs from 'fs';
import { TestRunnerConfig } from './testRunnerConfig';
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
    const command = this.buildJestCommand(path);
    const framework = this.config.getTestFramework(path);

    this.previousCommand = command;
    this.previousFramework = framework;

    await this.goToCwd();
    await this.runTerminalCommand(command, framework);
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
      const targetFileName = getFileName(filePath).replace(
        /\.(test|spec)\./,
        '.',
      );

      const coverageTarget = fs.existsSync(`${targetFileDir}/${targetFileName}`)
        ? `**/${targetFileName}`
        : `**/${getFileName(targetFileDir)}/**`;

      finalOptions.push('--collectCoverageFrom');
      finalOptions.push(quote(coverageTarget));
    }

    const testName = currentTestName || this.findCurrentTestName(editor);
    const resolvedTestName = updateTestNameIfUsingProperties(testName);
    const command = this.buildJestCommand(
      filePath,
      resolvedTestName,
      finalOptions,
    );
    const framework = this.config.getTestFramework(filePath);

    this.previousCommand = command;
    this.previousFramework = framework;

    await this.goToCwd();
    await this.runTerminalCommand(command, framework);
  }

  public async runCurrentFile(options?: string[]): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const command = this.buildJestCommand(filePath, undefined, options);
    const framework = this.config.getTestFramework(filePath);

    this.previousCommand = command;
    this.previousFramework = framework;

    await this.goToCwd();
    await this.runTerminalCommand(command, framework);
  }

  public async runPreviousTest(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    if (typeof this.previousCommand === 'string') {
      await this.goToCwd();
      await this.runTerminalCommand(
        this.previousCommand,
        this.previousFramework,
      );
    } else {
      await this.executeDebugCommand(this.previousCommand);
    }
  }

  public async debugTestsOnPath(filePath: string): Promise<void> {
    const debugConfig = this.config.getDebugConfiguration(filePath);
    const framework = this.config.getTestFramework(filePath);

    const standardArgs =
      framework === 'vitest'
        ? this.config.buildVitestArgs(filePath, undefined, false)
        : this.config.buildJestArgs(filePath, undefined, false);
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
    const debugConfig = this.config.getDebugConfiguration(filePath);
    const framework = this.config.getTestFramework(filePath);

    const standardArgs =
      framework === 'vitest'
        ? this.config.buildVitestArgs(filePath, resolvedTestName, false)
        : this.config.buildJestArgs(filePath, resolvedTestName, false);
    pushMany(debugConfig.args, standardArgs);

    await this.goToCwd();
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

  private buildJestCommand(
    filePath: string,
    testName?: string,
    options?: string[],
  ): string {
    const framework = this.config.getTestFramework(filePath);

    if (framework === 'vitest') {
      return this.buildVitestCommand(filePath, testName, options);
    }

    const args = this.config.buildJestArgs(filePath, testName, true, options);
    return `${this.config.jestCommand} ${args.join(' ')}`;
  }

  private buildVitestCommand(
    filePath: string,
    testName?: string,
    options?: string[],
  ): string {
    const args = this.config.buildVitestArgs(filePath, testName, true, options);
    return `${this.config.vitestCommand} ${args.join(' ')}`;
  }

  private async goToCwd() {
    const command = `cd ${quote(this.config.cwd)}`;
    if (this.config.changeDirectoryToWorkspaceRoot) {
      await this.runTerminalCommand(command);
    }
  }

  private async runTerminalCommand(command: string, framework?: string) {
    const terminalName = framework === 'vitest' ? 'vitest' : 'jest';

    if (
      !this.terminal ||
      (this.currentTerminalName && this.currentTerminalName !== terminalName)
    ) {
      if (this.terminal) {
        this.terminal.dispose();
      }
      this.terminal = vscode.window.createTerminal(terminalName);
      this.currentTerminalName = terminalName;
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
