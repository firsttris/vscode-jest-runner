import * as path from 'path';
import * as vscode from 'vscode';
import { PlaywrightRunnerConfig } from './playwrightRunnerConfig';
import { escapeRegExpForPath, escapeSingleQuotes, normalizePath, pushMany, quote } from './util';
//import { merge } from 'merge-deep';
export class PlaywrightCommandBuilder {
  private readonly config = new PlaywrightRunnerConfig();

  public getCwd(): string {
    return PlaywrightRunnerConfig.projectPath;
  }

  public getDebugConfig(filePath: string, currentTestName?: string, options?: unknown): vscode.DebugConfiguration {
    const config: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'playwright(debug)',
      program: PlaywrightRunnerConfig.playwrightBinPath,
      request: 'launch',
      type: 'node',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      env: { PWDEBUG: 'console' },
      cwd: PlaywrightRunnerConfig.projectPath,
      ...PlaywrightRunnerConfig.debugOptions,
    };

    config.args = config.args ? config.args.slice() : [];

    const standardArgs = this.buildArgs(filePath, currentTestName, false);
    pushMany(config.args, standardArgs);
    //merge(config, options);

    return config;
  }

  public buildCommand(filePath: string, testName?: string, options?: string[]): string {
    const args = this.buildArgs(filePath, testName, true, options);
    return `${PlaywrightRunnerConfig.playwrightCommand} ${args.join(' ')}`;
  }

  private buildArgs(filePath: string, testName?: string, withQuotes?: boolean, options: string[] = []): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str:string) => str;

    args.push('test');

    const cwd = vscode.Uri.file(PlaywrightRunnerConfig.projectPath);
    const testfile = path.relative(cwd.fsPath + '/tests', filePath).replace(/\\/g, '/');

    args.push(quoter(escapeRegExpForPath(normalizePath(testfile))));

    const config = PlaywrightRunnerConfig.playwrightConfigPath;
    if (config) {
      args.push('--config=');
      args.push(quoter(normalizePath(config)));
    }

    if (testName) {
      args.push('-g');
      args.push(quoter(escapeSingleQuotes(testName)));
    }

    const setOptions = new Set(options);

    if (PlaywrightRunnerConfig.runOptions) {
      PlaywrightRunnerConfig.runOptions.forEach((option) => setOptions.add(option));
    }

    args.push(...setOptions);

    return args;
  }
}
