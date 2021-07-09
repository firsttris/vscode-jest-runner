import * as vscode from 'vscode';
import { quote } from './util';
import { RunnerConfig } from './runnerConfig';
import { TestCase } from './testCase';

interface RunCommand {
  terminal:string,
  commands: string[];
}
interface DebugCommand {
  documentUri: vscode.Uri;
  config: vscode.DebugConfiguration;
}

export class MultiRunner {
  private previousRunCommand: RunCommand | undefined;
  private previousDebugCommand: DebugCommand | undefined;

  private terminals:any = {};

  constructor() {
    this.setup();
  }

  public async runTest(testcase:TestCase, options?: string[]): Promise<void> {
    const config = new RunnerConfig(testcase.filePath);
    const cmds = [];
    RunnerConfig.changeDirectoryToWorkspaceRoot && cmds.push(`cd ${quote(config.projectPath)}`);
    cmds.push(testcase.buildRunCommand(options));

    await this.executeRunCommand({
      terminal: testcase.isplaywright ? 'playwright' : 'jest',
      commands: cmds,
    });
  }

  public async debugTest(testcase:TestCase, options?: unknown): Promise<void> {
    let debugConfig = testcase.buildDebugCommand(options);
    await this.executeDebugCommand({
      config: debugConfig,
      documentUri: testcase.filePath,
    });
  }
  
  public async runPreviousTest(): Promise<void> {
    if (this.previousRunCommand) {
      await this.executeRunCommand(this.previousRunCommand);
      return;
    }

    if (this.previousDebugCommand) {
      await this.executeDebugCommand(this.previousDebugCommand);
      return;
    }
    throw new Error('not found prev test');
  }

  //
  // private methods
  //

  private async executeRunCommand(cmd: RunCommand) {
    this.previousRunCommand = cmd;
    this.previousDebugCommand = undefined;

    await this.runTerminalCommand(cmd.terminal, ...cmd.commands);
  }

  private async executeDebugCommand(cmd: DebugCommand) {
    this.previousRunCommand = undefined;
    this.previousDebugCommand = cmd;

    await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(cmd.documentUri), cmd.config);
  }

  private async runTerminalCommand(terminalName:string, ...commands: string[]) {
    if (!this.terminals[terminalName]) {
      this.terminals[terminalName] = vscode.window.createTerminal(terminalName);
    }
    const terminal = this.terminals[terminalName];
    terminal.show();
    await vscode.commands.executeCommand('workbench.action.terminal.clear');
    commands.forEach( command => terminal.sendText(command) );
  }

  private setup() {
    vscode.window.onDidCloseTerminal(() => {
      this.terminals = {};
    });
  }
}
