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
import { getTestFrameworkForFile, type TestFrameworkName } from './testDetection';

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

export class TestRunnerConfig {
  /**
   * The command that runs jest or vitest.
   * For Jest: Defaults to npx --no-install jest
   * For Vitest: Defaults to npx --no-install vitest
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

  /**
   * The command that runs vitest.
   * Defaults to: npx --no-install vitest
   */
  public get vitestCommand(): string {
    // Check for custom vitest command first
    const customCommand = vscode.workspace.getConfiguration().get('jestrunner.vitestCommand') as string | undefined;
    if (customCommand) {
      return customCommand;
    }

    // Use yarn for PnP support
    if (this.isYarnPnpSupportEnabled) {
      return `yarn vitest`;
    }

    return 'npx --no-install vitest';
  }

  /**
   * Get the appropriate test command based on the framework used for the file
   */
  public getTestCommand(filePath?: string): string {
    if (filePath) {
      const framework = getTestFrameworkForFile(filePath);
      if (framework === 'vitest') {
        return this.vitestCommand;
      }
    }
    return this.jestCommand;
  }

  /**
   * Detects the test framework for the current file
   */
  public getTestFramework(filePath?: string): TestFrameworkName | undefined {
    if (filePath) {
      return getTestFrameworkForFile(filePath);
    }
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      return getTestFrameworkForFile(editor.document.uri.fsPath);
    }
    return undefined;
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
  
  public findConfigPath(targetPath?: string, targetConfigFilename?: string, framework?: TestFrameworkName): string | undefined {
    const jestConfigFiles = ['jest.config.js', 'jest.config.ts', 'jest.config.cjs', 'jest.config.mjs', 'jest.config.json'];
    // Vitest config can be in vitest.config.* OR vite.config.* (vitest is often embedded in vite config)
    const vitestConfigFiles = [
      'vitest.config.js', 'vitest.config.ts', 'vitest.config.mjs', 'vitest.config.mts', 'vitest.config.cjs', 'vitest.config.cts',
      'vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts', 'vite.config.cjs', 'vite.config.cts'
    ];
    
    // Determine which config files to look for based on framework
    let configFiles: string[];
    if (targetConfigFilename) {
      configFiles = [targetConfigFilename];
    } else if (framework === 'vitest') {
      configFiles = vitestConfigFiles;
    } else {
      configFiles = jestConfigFiles;
    }

    const foundPath = searchPathToParent<string>(
      targetPath || path.dirname(vscode.window.activeTextEditor.document.uri.fsPath),
      this.currentWorkspaceFolderPath,
      (currentFolderPath: string) => {
        for (const configFilename of configFiles) {
          const currentFolderConfigPath = path.join(currentFolderPath, configFilename);

          if (fs.existsSync(currentFolderConfigPath)) {
            return currentFolderConfigPath;
          }
        }
      },
    );
    return foundPath ? normalizePath(foundPath) : undefined;
  }

  /**
   * Gets the Vitest config path for a given target path
   */
  public getVitestConfigPath(targetPath: string): string {
    const configPathOrMapping: string | Record<string, string> | undefined = vscode.workspace
      .getConfiguration()
      .get('jestrunner.vitestConfigPath');

    const configPath = resolveConfigPathOrMapping(configPathOrMapping, targetPath);
    if (!configPath || this.useNearestConfig) {
      const foundPath = this.findConfigPath(targetPath, configPath, 'vitest');
      if (foundPath) {
        return foundPath;
      }
    }

    return configPath
      ? normalizePath(path.resolve(this.currentWorkspaceFolderPath, this.projectPathFromConfig || '', configPath))
      : '';
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

  public get vitestDebugOptions(): Partial<vscode.DebugConfiguration> {
    const vitestDebugOptions = vscode.workspace.getConfiguration().get('jestrunner.vitestDebugOptions');
    if (vitestDebugOptions) {
      return vitestDebugOptions;
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

    // When withQuotes is true (terminal mode), we escape regex chars and quote
    // When withQuotes is false (debug mode), we only normalize the path (no escaping)
    // This prevents issues with Git Bash where backslash-escaped spaces break path parsing
    const processedFilePath = withQuotes 
      ? quoter(escapeRegExpForPath(normalizePath(filePath)))
      : normalizePath(filePath);
    args.push(processedFilePath);

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

  /**
   * Build Vitest arguments for running tests
   */
  public buildVitestArgs(
    filePath: string,
    testName: string | undefined,
    withQuotes: boolean,
    options: string[] = [],
  ): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str) => str;

    // Vitest uses 'run' subcommand for single runs (non-watch mode)
    args.push('run');

    // Vitest uses glob patterns for file filtering, NOT regex - don't escape the path
    args.push(quoter(normalizePath(filePath)));

    const vitestConfigPath = this.getVitestConfigPath(filePath);
    if (vitestConfigPath) {
      args.push('--config');
      args.push(quoter(normalizePath(vitestConfigPath)));
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

    // Get vitest-specific run options
    const vitestRunOptions = vscode.workspace.getConfiguration().get<string[]>('jestrunner.vitestRunOptions');
    if (vitestRunOptions && Array.isArray(vitestRunOptions)) {
      vitestRunOptions.forEach((option) => setOptions.add(option));
    } else if (this.runOptions) {
      // Fall back to jest run options if no vitest-specific options are set
      this.runOptions.forEach((option) => setOptions.add(option));
    }

    args.push(...setOptions);

    return args;
  }

  /**
   * Build test args based on detected framework
   */
  public buildTestArgs(
    filePath: string,
    testName: string | undefined,
    withQuotes: boolean,
    options: string[] = [],
  ): string[] {
    const framework = this.getTestFramework(filePath);
    if (framework === 'vitest') {
      return this.buildVitestArgs(filePath, testName, withQuotes, options);
    }
    return this.buildJestArgs(filePath, testName, withQuotes, options);
  }

  public getDebugConfiguration(filePath?: string): vscode.DebugConfiguration {
    const framework = this.getTestFramework(filePath);
    const isVitest = framework === 'vitest';

    // Base configuration that both implementations share
    const debugConfig: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: isVitest ? 'Debug Vitest Tests' : 'Debug Jest Tests',
      request: 'launch',
      type: 'node',
      runtimeExecutable: 'npx',
      // Only set cwd if changeDirectoryToWorkspaceRoot is enabled
      ...(this.changeDirectoryToWorkspaceRoot ? { cwd: this.cwd } : {}),
      args: isVitest ? ['--no-install', 'vitest', 'run'] : ['--no-install', 'jest', '--runInBand'],
      ...(isVitest ? this.vitestDebugOptions : this.debugOptions),
    };

    // Handle Yarn PnP support first
    if (this.isYarnPnpSupportEnabled) {
      // When using program, runtimeExecutable should not be set
      // as it would conflict with the program execution
      delete debugConfig.runtimeExecutable;
      debugConfig.program = `.yarn/releases/${this.getYarnPnpCommand}`;
      debugConfig.args = isVitest ? ['vitest', 'run'] : ['jest'];
      return debugConfig;
    }

    // Handle custom command if one is set
    const customCommandKey = isVitest ? 'jestrunner.vitestCommand' : 'jestrunner.jestCommand';
    const customCommand = vscode.workspace.getConfiguration().get(customCommandKey);
    if (customCommand && typeof customCommand === 'string') {
      const parts = parseShellCommand(customCommand);
      if (parts.length > 0) {
        // When using program, runtimeExecutable should not be set
        // as it would conflict with the program execution
        delete debugConfig.runtimeExecutable;
        debugConfig.program = parts[0];
        debugConfig.args = isVitest ? [...parts.slice(1), 'run'] : parts.slice(1);
      }
      return debugConfig;
    }

    return debugConfig;
  }
}
