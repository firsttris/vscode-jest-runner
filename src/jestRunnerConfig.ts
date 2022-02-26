import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { CodeLensOption, isWindows, normalizePath, quote, validateCodeLensOptions } from './util';

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
      return `yarn jest`;
    }
    return `node ${quote(this.jestBinPath)}`;
  }

  public get changeDirectoryToWorkspaceRoot(): boolean {
    return vscode.workspace.getConfiguration().get('jestrunner.changeDirectoryToWorkspaceRoot');
  }

  public get preserveEditorFocus(): boolean {
    return vscode.workspace.getConfiguration().get('jestrunner.preserveEditorFocus') || false;
  }

  public get jestBinPath(): string {
    // custom
    let jestPath: string = vscode.workspace.getConfiguration().get('jestrunner.jestPath');
    if (jestPath) {
      return jestPath;
    }

    // default
    const relativeJestBin = isWindows() ? 'node_modules/jest/bin/jest.js' : 'node_modules/.bin/jest';
    const cwd = this.cwd;

    jestPath = path.join(cwd, relativeJestBin);

    return normalizePath(jestPath);
  }

  public get projectPath(): string {
    return vscode.workspace.getConfiguration().get('jestrunner.projectPath') || this.currentWorkspaceFolderPath;
  }

  public get cwd(): string {
    return (
      vscode.workspace.getConfiguration().get('jestrunner.projectPath') ||
      this.currentPackagePath ||
      this.currentWorkspaceFolderPath
    );
  }

  private get currentPackagePath() {
    let currentFolderPath: string = path.dirname(vscode.window.activeTextEditor.document.fileName);
    do {
      // Try to find where jest is installed relatively to the current opened file.
      // Do not assume that jest is always installed at the root of the opened project, this is not the case
      // such as in multi-module projects.
      const pkg = path.join(currentFolderPath, 'package.json');
      const jest = path.join(currentFolderPath, 'node_modules', 'jest');
      if (fs.existsSync(pkg) && fs.existsSync(jest)) {
        return currentFolderPath;
      }
      currentFolderPath = path.join(currentFolderPath, '..');
    } while (currentFolderPath !== this.currentWorkspaceFolderPath);

    return '';
  }

  public get currentWorkspaceFolderPath(): string {
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

  getJestConfigPath(targetPath: string): string {
    // custom
    const configPath: string = vscode.workspace.getConfiguration().get('jestrunner.configPath');
    if (!configPath) {
      return this.findConfigPath(targetPath);
    }

    // default
    return normalizePath(path.join(this.currentWorkspaceFolderPath, configPath));
  }

  private findConfigPath(targetPath?: string): string {
    let currentFolderPath: string = targetPath || path.dirname(vscode.window.activeTextEditor.document.fileName);
    let currentFolderConfigPath: string;
    do {
      for (const configFilename of ['jest.config.js', 'jest.config.ts']) {
        currentFolderConfigPath = path.join(currentFolderPath, configFilename);

        if (fs.existsSync(currentFolderConfigPath)) {
          return currentFolderConfigPath;
        }
      }
      currentFolderPath = path.join(currentFolderPath, '..');
    } while (currentFolderPath !== this.currentWorkspaceFolderPath);
    return '';
  }

  public get runOptions(): string[] | null {
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

  public get codeLensOptions(): CodeLensOption[] {
    const codeLensOptions = vscode.workspace.getConfiguration().get('jestrunner.codeLens');
    if (Array.isArray(codeLensOptions)) {
      return validateCodeLensOptions(codeLensOptions);
    }
    return [];
  }

  public get isYarnPnpSupportEnabled(): boolean {
    const isYarnPnp: boolean = vscode.workspace.getConfiguration().get('jestrunner.enableYarnPnpSupport');
    return isYarnPnp ? isYarnPnp : false;
  }
}
