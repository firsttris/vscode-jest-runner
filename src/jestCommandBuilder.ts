import * as vscode from 'vscode';
import { RunnerConfig as config} from './runnerConfig';
import { escapeRegExpForPath, escapeSingleQuotes, normalizePath, pushMany, quote } from './util';
const merge = require('deepmerge');

export class JestCommandBuilder {
  public static getDebugConfig(filePath: vscode.Uri, currentTestName?: string, options?: any): vscode.DebugConfiguration {
    const debugCfg: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'jest(debug)',
      program: config.jestBinPath,
      request: 'launch',
      type: 'node',
      cwd: config.projectPath(filePath),
      ...config.jestDebugOptions,
    };

    debugCfg.args = debugCfg.args ? debugCfg.args.slice() : [];

    if (config.isYarnPnpSupportEnabled) {
      debugCfg.args = ['jest'];
      debugCfg.program = '.yarn/releases/yarn-*.cjs';
    }

    const standardArgs = this.buildArgs(filePath, currentTestName, false);
    pushMany(debugCfg.args, standardArgs);
    debugCfg.args.push('--runInBand');
    return options ? merge(debugCfg, options) : debugCfg;
  }

  public static buildCommand(filePath: vscode.Uri, testName?: string, options?: string[]): string {
    const args = this.buildArgs(filePath, testName, true, options);
    return `${config.jestCommand} ${args.join(' ')}`;
  }

  private static buildArgs(filePath: vscode.Uri, testName?: string, withQuotes?: boolean, options: string[] = []): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str:string) => str;

    args.push(quoter(escapeRegExpForPath(normalizePath(filePath.fsPath))));

    const cfg = config.jestConfigPath;
    if (cfg) {
      args.push('-c');
      args.push(quoter(normalizePath(cfg)));
    }

    if (testName) {
      args.push('-t');
      args.push(quoter(escapeSingleQuotes(testName)));
    }

    const setOptions = new Set(options);
    config.jestRunOptions.forEach((option) => setOptions.add(option));

    args.push(...setOptions);

    return args;
  }
}