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

/**
 * Parses a shell command string into an array of arguments, respecting quotes.
 * Handles single quotes, double quotes, and escaped characters.
 */
function parseShellCommand(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

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

    // Use npx for all platforms. npx is bundled with npm 5.2.0+ (2017) and works
    // cross-platform. VS Code's terminal automatically handles .cmd extensions on Windows.
    // For edge cases or older npm versions, users can set jestrunner.jestCommand.
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

  private get useNearestConfig(): boolean | undefined {
    return vscode.workspace.getConfiguration().get<boolean>('jestrunner.useNearestConfig');
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
    if (!configPath || this.useNearestConfig) {
      const foundPath = this.findConfigPath(targetPath, configPath);
      if (foundPath) {
        return foundPath;
        // Continue to default if no config is found
      }
    }

    // default
    return configPath
      ? normalizePath(path.resolve(this.currentWorkspaceFolderPath, this.projectPathFromConfig || '', configPath))
      : '';
  }
  
  public findConfigPath(targetPath?: string, targetConfigFilename?: string): string | undefined {
    const foundPath = searchPathToParent<string>(
      targetPath || path.dirname(vscode.window.activeTextEditor.document.uri.fsPath),
      this.currentWorkspaceFolderPath,
      (currentFolderPath: string) => {
        for (const configFilename of targetConfigFilename
          ? [targetConfigFilename]
          : ['jest.config.js', 'jest.config.ts', 'jest.config.cjs', 'jest.config.mjs', 'jest.config.json']) {
          const currentFolderConfigPath = path.join(currentFolderPath, configFilename);

          if (fs.existsSync(currentFolderConfigPath)) {
            return currentFolderConfigPath;
          }
        }
      },
    );
    return foundPath ? normalizePath(foundPath) : undefined;
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
    const config = vscode.workspace.getConfiguration();
    
    // Check for old disableCodeLens setting for backwards compatibility
    const disableCodeLens = config.get<boolean>('jestrunner.disableCodeLens');
    if (disableCodeLens !== undefined) {
      return !disableCodeLens;
    }
    
    // Use new enableCodeLens setting (default: true)
    const enableCodeLens = config.get<boolean>('jestrunner.enableCodeLens', true);
    return enableCodeLens;
  }

  public get codeLensOptions(): CodeLensOption[] {
    const codeLensOptions = vscode.workspace.getConfiguration().get('jestrunner.codeLens');
    if (Array.isArray(codeLensOptions)) {
      return validateCodeLensOptions(codeLensOptions);
    }
    return [];
  }

  /**
   * Gets the test file pattern for CodeLens and Test Explorer.
   * Supports both the new 'testFilePattern' and deprecated 'codeLensSelector' settings
   * for backward compatibility.
   */
  public getTestFilePattern(): string {
    const config = vscode.workspace.getConfiguration();
    
    // Check for old codeLensSelector setting for backwards compatibility
    const codeLensSelector = config.get<string>('jestrunner.codeLensSelector');
    if (codeLensSelector !== undefined && codeLensSelector !== '**/*.{test,spec}.{js,jsx,ts,tsx}') {
      // User has customized the old setting, use it
      return codeLensSelector;
    }
    
    // Use new testFilePattern setting (with default)
    const testFilePattern = config.get<string>('jestrunner.testFilePattern', '**/*.{test,spec}.{js,jsx,ts,tsx}');
    return testFilePattern;
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
      args.push(withQuotes ? quoter(escapeSingleQuotes(testName)) : testName);
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
      // When using program, runtimeExecutable should not be set
      // as it would conflict with the program execution
      delete debugConfig.runtimeExecutable;
      debugConfig.program = `.yarn/releases/${this.getYarnPnpCommand}`;
      debugConfig.args = ['jest'];
      return debugConfig;
    }

    // Handle custom Jest command if one is set
    const customCommand = vscode.workspace.getConfiguration().get('jestrunner.jestCommand');
    if (customCommand && typeof customCommand === 'string') {
      const parts = parseShellCommand(customCommand);
      if (parts.length > 0) {
        // When using program, runtimeExecutable should not be set
        // as it would conflict with the program execution
        delete debugConfig.runtimeExecutable;
        debugConfig.program = parts[0];
        debugConfig.args = parts.slice(1);
      }
      return debugConfig;
    }

    return debugConfig;
  }
}
