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
  public get jestCommand(): string {
    const customCommand = vscode.workspace.getConfiguration().get('jestrunner.jestCommand') as string | undefined;
    if (customCommand) {
      return customCommand;
    }

    if (this.isYarnPnpSupportEnabled) {
      return `yarn jest`;
    }

    return 'npx --no-install jest';
  }

  public get vitestCommand(): string {
    const customCommand = vscode.workspace.getConfiguration().get('jestrunner.vitestCommand') as string | undefined;
    if (customCommand) {
      return customCommand;
    }

    if (this.isYarnPnpSupportEnabled) {
      return `yarn vitest`;
    }

    return 'npx --no-install vitest';
  }

  public getTestCommand(filePath?: string): string {
    if (filePath) {
      const framework = getTestFrameworkForFile(filePath);
      if (framework === 'vitest') {
        return this.vitestCommand;
      }
    }
    return this.jestCommand;
  }

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
      return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }
    
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) {
      return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }
    
    return workspaceFolder.uri.fsPath;
  }

  public getJestConfigPath(targetPath: string): string {
    const configPathOrMapping: string | Record<string, string> | undefined = vscode.workspace
      .getConfiguration()
      .get('jestrunner.configPath');

    const configPath = resolveConfigPathOrMapping(configPathOrMapping, targetPath);
    if (!configPath || this.useNearestConfig) {
      const foundPath = this.findConfigPath(targetPath, configPath);
      if (foundPath) {
        return foundPath;
      }
    }

    return configPath
      ? normalizePath(path.resolve(this.currentWorkspaceFolderPath, this.projectPathFromConfig || '', configPath))
      : '';
  }
  
  public findConfigPath(targetPath?: string, targetConfigFilename?: string, framework?: TestFrameworkName): string | undefined {
    const jestConfigFiles = ['jest.config.js', 'jest.config.ts', 'jest.config.cjs', 'jest.config.mjs', 'jest.config.json'];
    const vitestConfigFiles = [
      'vitest.config.js', 'vitest.config.ts', 'vitest.config.mjs', 'vitest.config.mts', 'vitest.config.cjs', 'vitest.config.cts',
      'vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts', 'vite.config.cjs', 'vite.config.cts'
    ];
    
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

    return {};
  }

  public get vitestDebugOptions(): Partial<vscode.DebugConfiguration> {
    const vitestDebugOptions = vscode.workspace.getConfiguration().get('jestrunner.vitestDebugOptions');
    if (vitestDebugOptions) {
      return vitestDebugOptions;
    }

    return {};
  }

  public get isCodeLensEnabled(): boolean {
    const config = vscode.workspace.getConfiguration();
    
    const disableCodeLens = config.get<boolean>('jestrunner.disableCodeLens');
    if (disableCodeLens !== undefined) {
      return !disableCodeLens;
    }
    
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

  public getTestFilePattern(): string {
    const config = vscode.workspace.getConfiguration();
    
    const codeLensSelector = config.get<string>('jestrunner.codeLensSelector');
    if (codeLensSelector !== undefined && codeLensSelector !== '**/*.{test,spec}.{js,jsx,ts,tsx}') {
      return codeLensSelector;
    }
    
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

  public buildVitestArgs(
    filePath: string,
    testName: string | undefined,
    withQuotes: boolean,
    options: string[] = [],
  ): string[] {
    const args: string[] = [];
    const quoter = withQuotes ? quote : (str) => str;

    args.push('run');

    args.push(quoter(normalizePath(filePath)));

    const vitestConfigPath = this.getVitestConfigPath(filePath);
    if (vitestConfigPath) {
      args.push('--config');
      args.push(quoter(normalizePath(vitestConfigPath)));
    }

    if (testName) {
      if (testName.includes('%')) {
        testName = resolveTestNameStringInterpolation(testName);
      }

      args.push('-t');
      args.push(withQuotes ? quoter(escapeSingleQuotes(testName)) : testName);
    }

    const setOptions = new Set(options);

    const vitestRunOptions = vscode.workspace.getConfiguration().get<string[]>('jestrunner.vitestRunOptions');
    if (vitestRunOptions && Array.isArray(vitestRunOptions)) {
      vitestRunOptions.forEach((option) => setOptions.add(option));
    } else if (this.runOptions) {
      this.runOptions.forEach((option) => setOptions.add(option));
    }

    args.push(...setOptions);

    return args;
  }

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

    const debugConfig: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: isVitest ? 'Debug Vitest Tests' : 'Debug Jest Tests',
      request: 'launch',
      type: 'node',
      runtimeExecutable: 'npx',
      ...(this.changeDirectoryToWorkspaceRoot ? { cwd: this.cwd } : {}),
      args: isVitest ? ['--no-install', 'vitest', 'run'] : ['--no-install', 'jest', '--runInBand'],
      ...(isVitest ? this.vitestDebugOptions : this.debugOptions),
    };

    if (this.isYarnPnpSupportEnabled) {
      delete debugConfig.runtimeExecutable;
      debugConfig.program = `.yarn/releases/${this.getYarnPnpCommand}`;
      debugConfig.args = isVitest ? ['vitest', 'run'] : ['jest'];
      return debugConfig;
    }

    const customCommandKey = isVitest ? 'jestrunner.vitestCommand' : 'jestrunner.jestCommand';
    const customCommand = vscode.workspace.getConfiguration().get(customCommandKey);
    if (customCommand && typeof customCommand === 'string') {
      const parts = parseShellCommand(customCommand);
      if (parts.length > 0) {
        delete debugConfig.runtimeExecutable;
        debugConfig.program = parts[0];
        debugConfig.args = isVitest ? [...parts.slice(1), 'run'] : parts.slice(1);
      }
      return debugConfig;
    }

    return debugConfig;
  }
}
