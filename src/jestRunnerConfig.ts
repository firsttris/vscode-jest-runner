import * as path from 'path';
import * as vscode from 'vscode';
import { isWindows, normalizePath, quote } from './util';

export class JestRunnerConfig {
  /**
   * The command that runs jest.
   * Defaults to: node "node_modules/.bin/jest"
   */
  public get jestCommand(): string {
    // custom
    const jestCommand: string = vscode.workspace.getConfiguration().get('jestrunner.jestCommand');
    if (jestCommand) {
      return jestCommand;
    }

    // default
    if (this.isYarnPnpSupportEnabled) {
      const pnp = `${this.yarnPnpPath}`;
      return `node ${pnp} "${this.jestBinPath}"`;
    }
    return `node ${quote(this.jestBinPath)}`;
  }

  public get jestBinPath(): string {
    // custom
    let jestPath: string = vscode.workspace.getConfiguration().get('jestrunner.jestPath');
    if (jestPath) {
      return jestPath;
    }

    // default
    const relativeJestBin = isWindows() ? 'node_modules/jest/bin/jest.js' : 'node_modules/.bin/jest';
    jestPath = path.join(this.projectPath, relativeJestBin);
    if (this.isDetectYarnPnpJestBin) {
      jestPath = this.yarnPnpJestBinPath;
    }
    
    return normalizePath(jestPath);
  }

  public get projectPath(): string {
    return vscode.workspace.getConfiguration().get('jestrunner.projectPath') || this.currentWorkspaceFolderPath;
  }

  public get currentWorkspaceFolderPath() {
    const editor = vscode.window.activeTextEditor;
    return vscode.workspace.getWorkspaceFolder(editor.document.uri).uri.fsPath;
  }

  public get jestConfigPath(): string {
    // custom
    let configPath: string = vscode.workspace.getConfiguration().get('jestrunner.configPath');
    if (!configPath) {
      return '';
    }

    // default
    configPath = path.join(this.currentWorkspaceFolderPath, configPath);
    return normalizePath(configPath);
  }

  public get runOptions(): any {
    const runOptions = vscode.workspace.getConfiguration().get('jestrunner.runOptions');
    if (runOptions) {
      if (Array.isArray(runOptions)) {
        return runOptions;
      } else {
        vscode.window.showWarningMessage(
          'Please check your vscode settings. "jestrunner.runOptions" must be an Array. '
        );
      }
    }
    return null;
  }

  public get debugOptions(): Partial<vscode.DebugConfiguration> {
    const debugOptions = vscode.workspace.getConfiguration().get('jestrunner.debugOptions');
    if (debugOptions) {
      return debugOptions;
    }

    // default
    return {};
  }

  public get isCodeLensDisabled(): boolean {
    const isCodeLensDisabled: boolean = vscode.workspace.getConfiguration().get('jestrunner.disableCodeLens');
    return isCodeLensDisabled ? isCodeLensDisabled : false;
  }

  public get isYarnPnpSupportEnabled(): boolean {
    const isYarnPnp: boolean = vscode.workspace.getConfiguration().get('jestrunner.enableYarnPnpSupport');
    return isYarnPnp ? isYarnPnp : false;
  }

  public get yarnPnpPath(): string {
    return `--require ${quote(this.currentWorkspaceFolderPath + '/.pnp.js')}`;
  }

  public get isDetectYarnPnpJestBin(): boolean {
    const isDetectYarnPnpJestBin: boolean = vscode.workspace.getConfiguration().get('jestrunner.detectYarnPnpJestBin');
    return isDetectYarnPnpJestBin ? isDetectYarnPnpJestBin : false;
  }

  public get yarnPnpJestBinPath(): string {
    return '`yarn bin jest`';
  }

}
