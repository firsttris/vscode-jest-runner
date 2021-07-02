import * as path from 'path';
import * as vscode from 'vscode';
import { RunnerConfig as config} from './runnerConfig';
import { escapeRegExpForPath, escapeSingleQuotes, normalizePath, pushMany, quote } from './util';
const merge = require('deepmerge');

export class PlaywrightCommandBuilder {
  public static getDebugConfig(filePath: vscode.Uri, currentTestName?: string, options?: unknown): vscode.DebugConfiguration {
    const debugCfg: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'playwright(debug)',
      program: config.playwrightBinPath,
      request: 'launch',
      type: 'node',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      env: { PWDEBUG: 'console' },
      cwd: config.projectPath(filePath),
      ...config.playwrightDebugOptions,
    };

    debugCfg.args = debugCfg.args ? debugCfg.args.slice() : [];

    const standardArgs = this.buildArgs(filePath, currentTestName, false);
    pushMany(debugCfg.args, standardArgs);
    return options ? merge(debugCfg, options) : debugCfg;
  }

  public static buildCommand(filePath: vscode.Uri, testName?: string, options?: string[]): string {
    const args = this.buildArgs(filePath, testName, true, options);
    return `${config.playwrightCommand} ${args.join(' ')}`;
  }

  private static buildArgs(filePath: vscode.Uri, testName?: string, withQuotes?: boolean, options: string[] = []): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str:string) => str;

    args.push('test');

    const cwd = vscode.Uri.file(config.projectPath(filePath));
    const testfile = path.relative(cwd.fsPath + '/tests', filePath.fsPath).replace(/\\/g, '/');

    args.push(quoter(escapeRegExpForPath(normalizePath(testfile))));

    const cfg = config.playwrightConfigPath;
    if (cfg) {
      args.push('--config='+quoter(normalizePath(cfg)));
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
