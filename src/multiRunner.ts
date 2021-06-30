import { isPlaywrightTest, parse, findTestCode } from './playwright-editor-support';
import * as vscode from 'vscode';
import { quote, unquote, resolveTestNameStringInterpolation } from './util';

import { JestCommandBuilder } from './jestCommandBuilder';
import { PlaywrightCommandBuilder } from './playwrightCommandBuilder';
import { RunnerConfig as config} from './runnerConfig';
interface RunCommand {
  cwd: string;
  command: string;
}
interface DebugCommand {
  documentUri: vscode.Uri;
  config: vscode.DebugConfiguration;
}

export class MultiRunner {
  private previousRunCommand: RunCommand | undefined;
  private previousDebugCommand: DebugCommand | undefined;

  private terminal: vscode.Terminal | undefined;

  constructor() {
    this.setup();
  }

  public async runTestsOnPath(path: string): Promise<void> {
    await this.runTest(path);
  }

  public async runTestAndUpdateSnapshots(currentTestName?: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const fileText = editor.document.getText();
    const testName = currentTestName || this.findCurrentTestName(editor);

    await this.runTest(filePath, fileText, testName, ['-u']);
  }

  public async runCurrentTest(currentTestName?: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const fileText = editor.document.getText();
    const testName = currentTestName || this.findCurrentTestName(editor);

    await this.runTest(filePath, fileText, testName);
  }

  public async runCurrentFile(options?: string[]): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const fileText = editor.document.getText();
    await this.runTest(filePath, fileText, undefined, options);
  }

  public async runPreviousTest(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    if (this.previousRunCommand) {
      await this.executeRunCommand(this.previousRunCommand);
      return;
    }

    if (this.previousDebugCommand) {
      this.executeDebugCommand(this.previousDebugCommand);
      return;
    }
  }

  public async debugTestsOnPath(path: string): Promise<void> {
    await this.debugTest(path);
  }

  public async debugCurrentTest(currentTestName?: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const fileText = editor.document.getText();
    const testName = currentTestName || this.findCurrentTestName(editor);

    await this.debugTest(filePath, fileText, testName);
  }

  public async inspectCurrentTest(currentTestName?: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await editor.document.save();

    const filePath = editor.document.fileName;
    const fileText = editor.document.getText();
    const testName = currentTestName || this.findCurrentTestName(editor);

    // eslint-disable-next-line @typescript-eslint/naming-convention
    await this.debugTest(filePath, fileText, testName, { env: { PWDEBUG: 1 } });
  }

  //
  // private methods
  //

  private async runTest(path: string, fileText?: string, testName?: string, options?: string[]): Promise<void> {
    const cwd = config.projectPath;
    let command;
    if (isPlaywrightTest(path, fileText)) {
      command = PlaywrightCommandBuilder.buildCommand(path, testName, options);
    } else {
      command = JestCommandBuilder.buildCommand(path, testName, options);
    }
    this.executeRunCommand({
      cwd: cwd,
      command: command,
    });
  }

  private async debugTest(path: string, fileText?: string, testName?: string, options?: unknown): Promise<void> {
    let debugConfig;
    if (isPlaywrightTest(path, fileText)) {
      debugConfig = PlaywrightCommandBuilder.getDebugConfig(path, testName, options);
    } else {
      debugConfig = JestCommandBuilder.getDebugConfig(path, testName, options);
    }
    this.executeDebugCommand({
      config: debugConfig,
      documentUri: vscode.Uri.file(path),
    });
  }

  private async executeRunCommand(cmd: RunCommand) {
    this.previousRunCommand = cmd;
    this.previousDebugCommand = undefined;

    await this.goToCwd(cmd.cwd);
    await this.runTerminalCommand(cmd.command);
  }

  private executeDebugCommand(cmd: DebugCommand) {
    this.previousRunCommand = undefined;
    this.previousDebugCommand = cmd;

    vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(cmd.documentUri), cmd.config);
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
    const testcode = findTestCode(tests, selectedLine);

    return testcode ? resolveTestNameStringInterpolation(testcode.fullname) : undefined;
  }

  private async goToCwd(cmd: string) {
    if (config.changeDirectoryToWorkspaceRoot) {
      await this.runTerminalCommand(`cd ${quote(cmd)}`);
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
      this.terminal = undefined;
    });
  }
}
