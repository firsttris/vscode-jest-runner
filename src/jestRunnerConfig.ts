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
    jestPath = path.join(this.currentWorkspaceFolderPath, relativeJestBin);
    return normalizePath(jestPath);
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

  public get debugOptions(): Partial<vscode.DebugConfiguration> {
    // legacy
    let debugOptions = vscode.workspace.getConfiguration().get('jestrunner.runOptions');
    if (debugOptions) {
      vscode.window.showWarningMessage(
        'The "jestrunner.runOptions" option is deprecated. Please use "jestrunner.debugOptions" instead.'
      );
      return debugOptions;
    }

    // custom
    debugOptions = vscode.workspace.getConfiguration().get('jestrunner.debugOptions');
    if (debugOptions) {
      return debugOptions;
    }

    // default
    return {};
  }
}
