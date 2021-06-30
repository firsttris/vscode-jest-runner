import * as vscode from 'vscode';
import { JestRunnerConfig } from './jestRunnerConfig';
import { escapeRegExpForPath, escapeSingleQuotes, normalizePath, pushMany, quote } from './util';
//import { merge } from 'merge-deep';

export class JestCommandBuilder {
  private readonly config = new JestRunnerConfig();

  public getCwd(): string {
    return JestRunnerConfig.projectPath;
  }

  public getDebugConfig(filePath: string, currentTestName?: string, options?: unknown): vscode.DebugConfiguration {
    const config: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'jest(debug)',
      program: JestRunnerConfig.jestBinPath,
      request: 'launch',
      type: 'node',
      cwd: JestRunnerConfig.projectPath,
      ...JestRunnerConfig.debugOptions,
    };

    config.args = config.args ? config.args.slice() : [];

    if (JestRunnerConfig.isYarnPnpSupportEnabled) {
      config.args = ['jest'];
      config.program = '.yarn/releases/yarn-*.cjs';
    }

    const standardArgs = this.buildArgs(filePath, currentTestName, false);
    pushMany(config.args, standardArgs);
    config.args.push('--runInBand');
    //merge(config, options);

    return config;
  }

  public buildCommand(filePath: string, testName?: string, options?: string[]): string {
    const args = this.buildArgs(filePath, testName, true, options);
    return `${JestRunnerConfig.jestCommand} ${args.join(' ')}`;
  }

  private buildArgs(filePath: string, testName?: string, withQuotes?: boolean, options: string[] = []): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str:string) => str;

    args.push(quoter(escapeRegExpForPath(normalizePath(filePath))));

    const config = JestRunnerConfig.jestConfigPath;
    if (config) {
      args.push('-c');
      args.push(quoter(normalizePath(config)));
    }

    if (testName) {
      args.push('-t');
      args.push(quoter(escapeSingleQuotes(testName)));
    }

    const setOptions = new Set(options);
    JestRunnerConfig.runOptions.forEach((option) => setOptions.add(option));

    args.push(...setOptions);

    return args;
  }
}
