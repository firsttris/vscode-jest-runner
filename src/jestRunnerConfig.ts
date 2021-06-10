import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodeLensOption, isNodeExecuteAbleFile, normalizePath, quote, validateCodeLensOptions } from './util';

interface Configuration {
  get<T>(section: string): T | undefined;
}

export class JestRunnerConfig {
  get configuration(): Configuration {
    let currentFolderPath: string = path.dirname(vscode.window.activeTextEditor.document.fileName);
    let currentFolderConfigPath: string;
    do {
      currentFolderConfigPath = path.join(currentFolderPath, '.vscode/settings.json');
      if (fs.existsSync(currentFolderConfigPath)) {
        break;
      }
      currentFolderPath = path.join(currentFolderPath, '..');
    } while (currentFolderPath !== this.currentWorkspaceFolderPath);

    return {
      get: <T>(section: string): T => {
        if (fs.existsSync(currentFolderConfigPath)) {
          const content = fs.readFileSync(currentFolderConfigPath, 'utf-8');
          const config = JSON.parse(content);
          return config[section];
        }
        return null;
      },
    };
  }

  /**
   * The command that runs jest.
   * Defaults to: node "node_modules/.bin/jest"
   */
  public get jestCommand(): string {
    // custom
    const jestCommand: string = this.configuration.get('jestrunner.jestCommand');
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
    return this.configuration.get('jestrunner.changeDirectoryToWorkspaceRoot');
  }

  public get preserveEditorFocus(): boolean {
    return this.configuration.get('jestrunner.preserveEditorFocus') || false;
  }

  public get jestBinPath(): string {
    // custom
    let jestPath: string = this.configuration.get('jestrunner.jestPath');
    if (jestPath) {
      return jestPath;
    }

    // default
    const fallbackRelativeJestBinPath = 'node_modules/jest/bin/jest.js';
    const mayRelativeJestBin = ['node_modules/.bin/jest', 'node_modules/jest/bin/jest.js'];
    const cwd = this.cwd;

    jestPath = mayRelativeJestBin.find((relativeJestBin) => isNodeExecuteAbleFile(path.join(cwd, relativeJestBin)));
    jestPath = jestPath || path.join(cwd, fallbackRelativeJestBinPath);

    return normalizePath(jestPath);
  }

  public get projectPath(): string {
    return this.configuration.get('jestrunner.projectPath') || this.currentWorkspaceFolderPath;
  }

  public get cwd(): string {
    return (
      this.configuration.get('jestrunner.projectPath') || this.currentPackagePath || this.currentWorkspaceFolderPath
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
    const configPath: string = this.configuration.get('jestrunner.configPath');
    if (!configPath) {
      return this.findConfigPath();
    }

    // default
    return normalizePath(path.join(this.currentWorkspaceFolderPath, configPath));
  }

  getJestConfigPath(targetPath: string): string {
    // custom
    const configPath: string = this.configuration.get('jestrunner.configPath');
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
    const runOptions = this.configuration.get('jestrunner.runOptions');
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
    const debugOptions = this.configuration.get('jestrunner.debugOptions');
    if (debugOptions) {
      return debugOptions;
    }

    // default
    return {};
  }

  public get isCodeLensDisabled(): boolean {
    const isCodeLensDisabled: boolean = this.configuration.get('jestrunner.disableCodeLens');
    return isCodeLensDisabled ? isCodeLensDisabled : false;
  }

  public get codeLensOptions(): CodeLensOption[] {
    const codeLensOptions = this.configuration.get('jestrunner.codeLens');
    if (Array.isArray(codeLensOptions)) {
      return validateCodeLensOptions(codeLensOptions);
    }
    return [];
  }

  public get isYarnPnpSupportEnabled(): boolean {
    const isYarnPnp: boolean = this.configuration.get('jestrunner.enableYarnPnpSupport');
    return isYarnPnp ? isYarnPnp : false;
  }
  public get getYarnPnpCommand(): string {
    const yarnPnpCommand: string = this.configuration.get('jestrunner.yarnPnpCommand');
    return yarnPnpCommand;
  }
}
