import * as path from 'path';
import * as vscode from 'vscode';
import { RunnerConfig } from './runnerConfig';
import { escapeRegExpForPath, escapeSingleQuotes, normalizePath, pushMany, quote } from './util';
const merge = require('deepmerge');

export class PlaywrightCommandBuilder {
  public static getDebugConfig(filePath: vscode.Uri, currentTestName?: string, options?: unknown): vscode.DebugConfiguration {
    const config = new RunnerConfig(filePath);
    const cmds = config.playwrightCommand.split(/\s+/);
    const executer = cmds.shift();
    const debugCfg: vscode.DebugConfiguration = {
      console: 'internalConsole',
      internalConsoleOptions: "openOnSessionStart",
      outputCapture: "std",
      name: 'playwright',
      runtimeExecutable:executer,
      runtimeArgs: cmds,
      request: 'launch',
      type: 'pwa-node',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      env: { PWDEBUG: 'console' },
      ...config.playwrightDebugOptions,
    };
    if(RunnerConfig.changeDirectoryToWorkspaceRoot) {
      debugCfg.cwd = config.projectPath;
    }

    debugCfg.args = debugCfg.args ? debugCfg.args.slice() : [];

    const standardArgs = this.buildArgs(config, filePath, currentTestName, false);
    pushMany(standardArgs, debugCfg.args);
    debugCfg.args = standardArgs;
    return options ? merge(debugCfg, options) : debugCfg;
  }

  public static buildCommand(filePath: vscode.Uri, testName?: string, options?: string[]): string {
    const config = new RunnerConfig(filePath);
    const args = this.buildArgs(config, filePath, testName, true, options);
    return `${config.playwrightCommand} ${args.join(' ')}`;
  }
  
  public static buildShowTraceCommand(filePath: vscode.Uri): string {
    const config = new RunnerConfig(filePath);
    const args: string[] = [];
    args.push('show-trace');
    args.push(quote(escapeRegExpForPath(normalizePath(filePath.fsPath))));
    return `${config.playwrightCommand} ${args.join(' ')}`;
  }

  private static buildArgs(config:RunnerConfig, filePath: vscode.Uri, testName?: string, withQuotes?: boolean, options: string[] = []): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str:string) => str;

    args.push('test');

    const testfile = path.relative(config.projectPath + '/tests', filePath.fsPath).replace(/\\/g, '/');

    args.push(quoter(escapeRegExpForPath(normalizePath(testfile))));

    const cfg = config.playwrightConfigPath;
    if (cfg) {
      args.push('-c');
      args.push(quoter(normalizePath(cfg)));
    }

    if (testName) {
      args.push('-g');
      args.push(quoter(escapeSingleQuotes(testName)));
    }

    const setOptions = new Set(options);

    if (config.playwrightRunOptions) {
      config.playwrightRunOptions.forEach((option) => setOptions.add(option));
    }

    args.push(...setOptions);

    return args;
  }
}
