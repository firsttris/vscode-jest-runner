import * as path from 'path';
import * as fs from 'fs';
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
    let projPath: string = vscode.workspace.getConfiguration().get('jestrunner.projectPath');
    if (projPath) {
      return projPath;
    }

    const configPath = this.findConfigPath();
    const configDir = path.dirname(configPath);
    if (fs.existsSync(path.join(configDir, 'node_modules'))) {
      return configDir;
    }

    return this.currentWorkspaceFolderPath;
  }

  public get currentWorkspaceFolderPath() {
    const editor = vscode.window.activeTextEditor;
    return vscode.workspace.getWorkspaceFolder(editor.document.uri).uri.fsPath;
  }
  public get jestConfigPath(): string {
    // custom
    const configPath: string = vscode.workspace.getConfiguration().get('jestrunner.configPath');
    if (!configPath) {
      return this.findConfigPath();
    }

    // default
    return normalizePath(path.join(this.currentWorkspaceFolderPath, configPath));
  }
    
  private findConfigPath(): string {
    let currentFolderPath: string = path.dirname(vscode.window.activeTextEditor.document.fileName);
    let currentFolderConfigPath: string;
    do {
      currentFolderConfigPath = path.join(currentFolderPath, 'jest.config.js');
      if(fs.existsSync(currentFolderConfigPath)) {
        return currentFolderConfigPath;
      }
      currentFolderPath = path.join(currentFolderPath, '..');
    } while(currentFolderPath !== this.currentWorkspaceFolderPath);
    return '';
  }

  public get runOptions() {
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
