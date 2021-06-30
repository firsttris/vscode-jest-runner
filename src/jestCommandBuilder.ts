import * as vscode from 'vscode';
import { RunnerConfig as config} from './runnerConfig';
import { escapeRegExpForPath, escapeSingleQuotes, normalizePath, pushMany, quote } from './util';
//import { merge } from 'merge-deep';

export class JestCommandBuilder {
  public getDebugConfig(filePath: string, currentTestName?: string, options?: unknown): vscode.DebugConfiguration {
    const debugCfg: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'jest(debug)',
      program: config.jestBinPath,
      request: 'launch',
      type: 'node',
      cwd: config.projectPath,
      ...config.jestDebugOptions,
    };

    debugCfg.args = debugCfg.args ? debugCfg.args.slice() : [];

    if (debugCfg.isYarnPnpSupportEnabled) {
      debugCfg.args = ['jest'];
      debugCfg.program = '.yarn/releases/yarn-*.cjs';
    }

    const standardArgs = this.buildArgs(filePath, currentTestName, false);
    pushMany(debugCfg.args, standardArgs);
    debugCfg.args.push('--runInBand');
    //merge(config, options);

    return debugCfg;
  }

  public buildCommand(filePath: string, testName?: string, options?: string[]): string {
    const args = this.buildArgs(filePath, testName, true, options);
    return `${config.jestCommand} ${args.join(' ')}`;
  }

  private buildArgs(filePath: string, testName?: string, withQuotes?: boolean, options: string[] = []): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str:string) => str;

    args.push(quoter(escapeRegExpForPath(normalizePath(filePath))));

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
