import { isPlaywrightTest, parse, findTestCode } from './playwright-editor-support';
import * as vscode from 'vscode';
import { quote, unquote, resolveTestNameStringInterpolation } from './util';

import { JestCommandBuilder } from './jestCommandBuilder';
import { PlaywrightCommandBuilder } from './playwrightCommandBuilder';
import { RunnerConfig as config} from './runnerConfig';
interface RunCommand {
  cwd: string | undefined;
  command: string;
}
interface DebugCommand {
  documentUri: vscode.Uri;
  config: vscode.DebugConfiguration;
}

export class TestCase {
  public isplaywright:boolean = false;
  public filePath:vscode.Uri = vscode.Uri.file('.');
  public testName:string | undefined = undefined;

  public buildRunCommand(options?: string[]):string {
    if(this.isplaywright) {
      return PlaywrightCommandBuilder.buildCommand(this.filePath, this.testName, options);
    }
    return JestCommandBuilder.buildCommand(this.filePath, this.testName, options);
  }

  public buildDebugCommand(options?: unknown):vscode.DebugConfiguration {
    if(this.isplaywright) {
      return PlaywrightCommandBuilder.getDebugConfig(this.filePath, this.testName, options);
    }
    return JestCommandBuilder.getDebugConfig(this.filePath, this.testName, options);
  }

  public static toFile(file:vscode.Uri):TestCase {
    const inst = new TestCase();
    inst.isplaywright = isPlaywrightTest(file.fsPath);
    inst.filePath = file;
    inst.testName = undefined;
    return inst;
  }

  public static async toEditor(testcase?: string):Promise<TestCase> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error('not found active text editor');
    }

    await editor.document.save();

    const filePath = editor.document.uri;
    const fileText = editor.document.getText();
    const testName = testcase || this.findCurrentTestName(editor);

    const inst = new TestCase();
    inst.isplaywright = isPlaywrightTest(filePath.fsPath, fileText);
    inst.filePath = filePath;
    inst.testName = testName;
    return inst;
  }

  private static findCurrentTestName(editor: vscode.TextEditor): string | undefined {
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
}

export class MultiRunner {
  private previousRunCommand: RunCommand | undefined;
  private previousDebugCommand: DebugCommand | undefined;

  private terminal: vscode.Terminal | undefined;

  constructor() {
    this.setup();
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

  //
  // private methods
  //

  public async runTest(testcase:TestCase, options?: string[]): Promise<void> {
    const cwd = config.projectPath(testcase.filePath);
    let command = testcase.buildRunCommand(options);
    this.executeRunCommand({
      cwd: config.changeDirectoryToWorkspaceRoot ? cwd : undefined,
      command: command,
    });
  }

  public async debugTest(testcase:TestCase, options?: unknown): Promise<void> {
    let debugConfig = testcase.buildDebugCommand(options);
    this.executeDebugCommand({
      config: debugConfig,
      documentUri: testcase.filePath,
    });
  }

  private async executeRunCommand(cmd: RunCommand) {
    this.previousRunCommand = cmd;
    this.previousDebugCommand = undefined;

    if (cmd.cwd) {
      await this.runTerminalCommand(`cd ${quote(cmd.cwd)}`, cmd.command);
    } else {
      await this.runTerminalCommand(cmd.command);
    }
  }

  private executeDebugCommand(cmd: DebugCommand) {
    this.previousRunCommand = undefined;
    this.previousDebugCommand = cmd;

    vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(cmd.documentUri), cmd.config);
  }

  private async runTerminalCommand(...commands: string[]) {
    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal('playwright');
    }
    this.terminal.show();
    await vscode.commands.executeCommand('workbench.action.terminal.clear');
    const terminal = this.terminal;
    commands.forEach( command => terminal.sendText(command) );
  }

  private setup() {
    vscode.window.onDidCloseTerminal(() => {
      this.terminal = undefined;
    });
  }
}
