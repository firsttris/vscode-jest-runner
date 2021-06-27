import * as path from 'path';
import * as vscode from 'vscode';
import { PlaywrightRunnerConfig } from './playwrightRunnerConfig';
import { escapeRegExpForPath, escapeSingleQuotes, normalizePath, pushMany, quote, mergeDeep } from './util';

export class PlaywrightCommandBuilder {
  private readonly config = new PlaywrightRunnerConfig();

  public getCwd(): string {
    return this.config.cwd;
  }

  public getDebugConfig(filePath: string, currentTestName?: string, options?: unknown): vscode.DebugConfiguration {
    const config: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'Debug Playwright Tests',
      program: this.config.playwrightBinPath,
      request: 'launch',
      type: 'node',
      cwd: this.config.cwd,
      ...this.config.debugOptions,
    };

    config.args = config.args ? config.args.slice() : [];

    if (this.config.isYarnPnpSupportEnabled) {
      config.args = ['playwright'];
      config.program = '.yarn/releases/yarn-*.cjs';
    }

    const standardArgs = this.buildArgs(filePath, currentTestName, false);
    pushMany(config.args, standardArgs);
    mergeDeep(config, options);

    return config;
  }

  public buildCommand(filePath: string, testName?: string, options?: string[]): string {
    const args = this.buildArgs(filePath, testName, true, options);
    return `${this.config.playwrightCommand} ${args.join(' ')}`;
  }

  private buildArgs(filePath: string, testName: string, withQuotes: boolean, options: string[] = []): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str) => str;

    args.push('test');

    const cwd = vscode.Uri.file(this.config.cwd);
    const testfile = path.relative(cwd.fsPath + '/tests', filePath).replace(/\\/g, '/');

    args.push(quoter(escapeRegExpForPath(normalizePath(testfile))));

    const playwrightConfigPath = this.config.getPlaywrightConfigPath(filePath);
    if (playwrightConfigPath) {
      args.push('--config=' + quoter(normalizePath(playwrightConfigPath)));
    }

    if (testName) {
      args.push('-g');
      args.push(quoter(escapeSingleQuotes(testName)));
    }

    const setOptions = new Set(options);

    if (this.config.runOptions) {
      this.config.runOptions.forEach((option) => setOptions.add(option));
    }

    args.push(...setOptions);

    return args;
  }
}
