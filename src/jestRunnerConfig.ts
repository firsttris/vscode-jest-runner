import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  normalizePath,
  validateCodeLensOptions,
  CodeLensOption,
  resolveConfigPathOrMapping,
  searchPathToParent,
  resolveTestNameStringInterpolation,
  escapeRegExpForPath,
  quote,
  escapeSingleQuotes,
} from './util';

export class JestRunnerConfig {
  /**
   * The command that runs jest.
   * Defaults to: node "node_modules/.bin/jest"
   */
  public get jestCommand(): string {
    // Check for custom command first
    const customCommand = vscode.workspace.getConfiguration().get('jestrunner.jestCommand') as string | undefined;
    if (customCommand) {
      return customCommand;
    }

    // Use yarn for PnP support
    if (this.isYarnPnpSupportEnabled) {
      return `yarn jest`;
    }

    // Use npx for all platforms
    return 'npx --no-install jest';
  }

  public get changeDirectoryToWorkspaceRoot(): boolean {
    return vscode.workspace.getConfiguration().get('jestrunner.changeDirectoryToWorkspaceRoot');
  }

  public get preserveEditorFocus(): boolean {
    return vscode.workspace.getConfiguration().get('jestrunner.preserveEditorFocus') || false;
  }

  public get cwd(): string {
    return this.projectPathFromConfig || this.currentPackagePath || this.currentWorkspaceFolderPath;
  }

  private get projectPathFromConfig(): string | undefined {
    const projectPathFromConfig = vscode.workspace.getConfiguration().get<string>('jestrunner.projectPath');
    if (projectPathFromConfig) {
      return path.resolve(this.currentWorkspaceFolderPath, projectPathFromConfig);
    }
  }

  public get currentPackagePath() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return '';
    }
    
    const checkRelativePathForJest = vscode.workspace
      .getConfiguration()
      .get<boolean>('jestrunner.checkRelativePathForJest');
    const foundPath = searchPathToParent<string>(
      path.dirname(editor.document.uri.fsPath),
      this.currentWorkspaceFolderPath,
      (currentFolderPath: string) => {
        // Try to find where jest is installed relatively to the current opened file.
        // Do not assume that jest is always installed at the root of the opened project, this is not the case
        // such as in multi-module projects.
        const pkg = path.join(currentFolderPath, 'package.json');
        const jest = path.join(currentFolderPath, 'node_modules', 'jest');
        if (fs.existsSync(pkg) && (fs.existsSync(jest) || !checkRelativePathForJest)) {
          return currentFolderPath;
        }
      },
    );
    return foundPath ? normalizePath(foundPath) : '';
  }

  private get currentWorkspaceFolderPath(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      // Fallback to first workspace folder if no active editor
      return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }
    
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) {
      // Fallback to first workspace folder if file is not in workspace
      return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }
    
    return workspaceFolder.uri.fsPath;
  }

  public getJestConfigPath(targetPath: string): string {
    // custom
    const configPathOrMapping: string | Record<string, string> | undefined = vscode.workspace
      .getConfiguration()
      .get('jestrunner.configPath');

    const configPath = resolveConfigPathOrMapping(configPathOrMapping, targetPath);
    if (!configPath) {
      return this.findConfigPath(targetPath);
    }

    // default
    return normalizePath(path.resolve(this.currentWorkspaceFolderPath, this.projectPathFromConfig || '', configPath));
  }

  public findConfigPath(targetPath?: string): string {
    const editor = vscode.window.activeTextEditor;
    const defaultPath = editor ? path.dirname(editor.document.uri.fsPath) : this.currentWorkspaceFolderPath;
    
    const foundPath = searchPathToParent<string>(
      targetPath || defaultPath,
      this.currentWorkspaceFolderPath,
      (currentFolderPath: string) => {
        for (const configFilename of [
          'jest.config.js',
          'jest.config.ts',
          'jest.config.cjs',
          'jest.config.mjs',
          'jest.config.json',
        ]) {
          const currentFolderConfigPath = path.join(currentFolderPath, configFilename);

          if (fs.existsSync(currentFolderConfigPath)) {
            return currentFolderConfigPath;
          }
        }
      },
    );
    return foundPath ? normalizePath(foundPath) : '';
  }

  public get runOptions(): string[] | null {
    const runOptions = vscode.workspace.getConfiguration().get('jestrunner.runOptions');
    if (runOptions) {
      if (Array.isArray(runOptions)) {
        return runOptions;
      } else {
        vscode.window.showWarningMessage(
          'Please check your vscode settings. "jestrunner.runOptions" must be an Array. ',
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

  public get isCodeLensEnabled(): boolean {
    const testInterface = vscode.workspace.getConfiguration().get<string>('jestrunner.testInterface', 'testExplorer');
    return testInterface === 'codeLens';
  }

  public get codeLensOptions(): CodeLensOption[] {
    const codeLensOptions = vscode.workspace.getConfiguration().get('jestrunner.codeLens');
    if (Array.isArray(codeLensOptions)) {
      return validateCodeLensOptions(codeLensOptions);
    }
    return [];
  }

  public get isYarnPnpSupportEnabled(): boolean {
    return vscode.workspace.getConfiguration().get('jestrunner.enableYarnPnpSupport') || false;
  }
  public get getYarnPnpCommand(): string {
    const yarnPnpCommand: string = vscode.workspace.getConfiguration().get('jestrunner.yarnPnpCommand');
    return yarnPnpCommand;
  }

  public buildJestArgs(
    filePath: string,
    testName: string | undefined,
    withQuotes: boolean,
    options: string[] = [],
  ): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str) => str;

    args.push(quoter(escapeRegExpForPath(normalizePath(filePath))));

    const jestConfigPath = this.getJestConfigPath(filePath);
    if (jestConfigPath) {
      args.push('-c');
      args.push(quoter(normalizePath(jestConfigPath)));
    }

    if (testName) {
      // Transform any placeholders in the test name if needed
      if (testName.includes('%')) {
        testName = resolveTestNameStringInterpolation(testName);
      }

      args.push('-t');
      args.push(quoter(escapeSingleQuotes(testName)));
    }

    const setOptions = new Set(options);

    if (this.runOptions) {
      this.runOptions.forEach((option) => setOptions.add(option));
    }

    args.push(...setOptions);

    return args;
  }

  public getDebugConfiguration(): vscode.DebugConfiguration {
    // Base configuration that both implementations share
    const debugConfig: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: 'Debug Jest Tests',
      request: 'launch',
      type: 'node',
      runtimeExecutable: 'npx',
      cwd: this.cwd,
      args: ['--no-install', 'jest', '--runInBand'],
      ...this.debugOptions,
    };

    // Handle Yarn PnP support first
    if (this.isYarnPnpSupportEnabled) {
      debugConfig.program = `.yarn/releases/${this.getYarnPnpCommand}`;
      debugConfig.args = ['jest'];
      return debugConfig;
    }

    // Handle custom Jest command if one is set
    const customCommand = vscode.workspace.getConfiguration().get('jestrunner.jestCommand');
    if (customCommand && typeof customCommand === 'string') {
      const parts = customCommand.split(' ');
      debugConfig.program = parts[0];
      debugConfig.args = parts.slice(1);
      return debugConfig;
    }

    return debugConfig;
  }
}
