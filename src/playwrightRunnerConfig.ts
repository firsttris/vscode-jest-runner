import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { isWindows, normalizePath, quote } from './util';

export class PlaywrightRunnerConfig {
  /**
   * The command that runs playwright.
   * Defaults to: node "node_modules/.bin/playwright"
   */
  public get playwrightCommand(): string {
    // custom
    const playwrightCommand: string = vscode.workspace.getConfiguration().get('jestrunner.playwrightCommand');
    if (playwrightCommand) {
      return playwrightCommand;
    }

    // default
    if (this.isYarnPnpSupportEnabled) {
      return `yarn playwright`;
    }
    return `node ${quote(this.playwrightBinPath)}`;
  }

  public get changeDirectoryToWorkspaceRoot(): boolean {
    return vscode.workspace.getConfiguration().get('jestrunner.changeDirectoryToWorkspaceRoot');
  }

  public get playwrightBinPath(): string {
    // custom
    let playwrightPath: string = vscode.workspace.getConfiguration().get('jestrunner.playwrightPath');
    if (playwrightPath) {
      return playwrightPath;
    }

    // default
    if (isWindows()) {
      return normalizePath('./node_modules/playwright/lib/cli/cli.js');
    }

    const relativePlaywrightBin = 'node_modules/.bin/playwright';
    const cwd = this.cwd;
    playwrightPath = path.join(cwd, relativePlaywrightBin);

    return normalizePath(playwrightPath);
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
      // Try to find where playwright is installed relatively to the current opened file.
      // Do not assume that playwright is always installed at the root of the opened project, this is not the case
      // such as in multi-module projects.
      const pkg = path.join(currentFolderPath, 'package.json');
      const playwright = path.join(currentFolderPath, 'node_modules', 'playwright');
      if (fs.existsSync(pkg) && fs.existsSync(playwright)) {
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

  public get playwrightConfigPath(): string {
    // custom
    const configPath: string = vscode.workspace.getConfiguration().get('jestrunner.playwrightConfigPath');
    if (!configPath) {
      return this.findConfigPath();
    }

    // default
    return normalizePath(path.join(this.currentWorkspaceFolderPath, configPath));
  }

  getPlaywrightConfigPath(targetPath: string): string {
    // custom
    const configPath: string = vscode.workspace.getConfiguration().get('jestrunner.playwrightConfigPath');
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
      currentFolderConfigPath = path.join(currentFolderPath, 'playwright.config.js');
      if (fs.existsSync(currentFolderConfigPath)) {
        return currentFolderConfigPath;
      }
      currentFolderPath = path.join(currentFolderPath, '..');
    } while (currentFolderPath !== this.currentWorkspaceFolderPath);
    return '';
  }

  public get runOptions(): string[] | null {
    const runOptions = vscode.workspace.getConfiguration().get('jestrunner.playwrightRunOptions');
    if (runOptions) {
      if (Array.isArray(runOptions)) {
        return runOptions;
      } else {
        vscode.window.showWarningMessage(
          'Please check your vscode settings. "jestrunner.playwrightRunOptions" must be an Array. '
        );
      }
    }
    return null;
  }

  public get debugOptions(): Partial<vscode.DebugConfiguration> {
    const debugOptions = vscode.workspace.getConfiguration().get('jestrunner.playwrightDebugOptions');
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
}
