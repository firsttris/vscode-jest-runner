import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { createRequire } from 'module';
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
  logDebug,
  logWarning,
} from './util';
import { getTestFrameworkForFile } from './testDetection/testFileDetection';
import { TestFrameworkName, testFrameworks } from './testDetection/frameworkDefinitions';
import { findTestFrameworkDirectory } from './testDetection/frameworkDetection';



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

/**
 * Resolve the absolute path to a binary using Node's require.resolve.
 * This recursively searches parent directories, just like npx does.
 */
function resolveBinaryPath(binaryName: string, cwd: string): string | undefined {
  try {
    // Create a require function with the cwd as the base path
    // This allows require.resolve to search from the project directory upwards
    const requireFromCwd = createRequire(path.join(cwd, 'package.json'));

    // Try to resolve the binary package
    // For jest, this resolves to the main entry point of the jest package
    const packagePath = requireFromCwd.resolve(binaryName);

    // Extract the package directory
    const packageDir = packagePath.substring(0, packagePath.lastIndexOf(binaryName) + binaryName.length);

    // Construct path to the binary in node_modules/.bin
    const binPath = path.join(packageDir, '..', '.bin', binaryName);

    if (fs.existsSync(binPath)) {
      logDebug(`Resolved binary path for ${binaryName}: ${binPath}`);
      return normalizePath(binPath);
    }

    // Fallback: try to find the binary script directly in the package
    // For example, jest/bin/jest.js
    try {
      const binaryScript = requireFromCwd.resolve(`${binaryName}/bin/${binaryName}.js`);
      if (fs.existsSync(binaryScript)) {
        logDebug(`Resolved binary script for ${binaryName}: ${binaryScript}`);
        return normalizePath(binaryScript);
      }
    } catch {
      // Binary script not found in standard location
    }
  } catch (error) {
    logWarning(`Failed to resolve binary path for ${binaryName}: ${error}`);
  }
  return undefined;
}


export class TestRunnerConfig {
  private getConfig<T>(key: string, defaultValue?: T): T | undefined {
    return vscode.workspace.getConfiguration().get(key, defaultValue);
  }

  public get jestCommand(): string {
    const customCommand = this.getConfig<string>('jestrunner.jestCommand');
    if (customCommand) {
      return customCommand;
    }



    return 'npx --no-install jest';
  }

  public get vitestCommand(): string {
    const customCommand = this.getConfig<string>('jestrunner.vitestCommand');
    if (customCommand) {
      return customCommand;
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

  public get enableESM(): boolean {
    return this.getConfig<boolean>('jestrunner.enableESM', false);
  }

  public getEnvironmentForRun(filePath: string): Record<string, string> | undefined {
    if (this.enableESM) {
      return { NODE_OPTIONS: '--experimental-vm-modules' };
    }
    return undefined;
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
    return this.getConfig('jestrunner.changeDirectoryToWorkspaceRoot');
  }

  public get preserveEditorFocus(): boolean {
    return this.getConfig('jestrunner.preserveEditorFocus', false);
  }

  public get cwd(): string {
    return (
      this.projectPathFromConfig ||
      this.currentPackagePath ||
      this.currentWorkspaceFolderPath
    );
  }

  private get projectPathFromConfig(): string | undefined {
    const projectPathFromConfig = this.getConfig<string>('jestrunner.projectPath');
    if (projectPathFromConfig) {
      return path.resolve(
        this.currentWorkspaceFolderPath,
        projectPathFromConfig,
      );
    }
  }

  private get useNearestConfig(): boolean | undefined {
    return this.getConfig<boolean>('jestrunner.useNearestConfig');
  }

  public get currentPackagePath() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return '';
    }

    const result = findTestFrameworkDirectory(editor.document.uri.fsPath);
    return result ? normalizePath(result.directory) : '';
  }

  private get currentWorkspaceFolderPath(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      editor.document.uri,
    );
    if (!workspaceFolder) {
      return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    return workspaceFolder.uri.fsPath;
  }

  private getConfigPath(
    targetPath: string,
    configKey: string,
    framework?: TestFrameworkName,
  ): string {
    const configPathOrMapping = this.getConfig<string | Record<string, string>>(configKey);

    const configPath = resolveConfigPathOrMapping(
      configPathOrMapping,
      targetPath,
    );
    if (!configPath || this.useNearestConfig) {
      const foundPath = this.findConfigPath(targetPath, configPath, framework);
      if (foundPath) {
        logDebug(`Found config path using findConfigPath: ${foundPath}`);
        return foundPath;
      }
    }

    if (configPath) {
      const resolvedPath = normalizePath(
        path.resolve(
          this.currentWorkspaceFolderPath,
          this.projectPathFromConfig || '',
          configPath,
        ),
      );

      if (fs.existsSync(resolvedPath)) {
        return resolvedPath;
      }

      const foundPath = this.findConfigPath(targetPath, undefined, framework);
      if (foundPath) {
        logDebug(`Found config path (fallback) using findConfigPath: ${foundPath}`);
        return foundPath;
      }

      logDebug(`Using resolved config path from settings: ${resolvedPath}`);
      return resolvedPath;
    }

    return '';
  }

  public getJestConfigPath(targetPath: string): string {
    return this.getConfigPath(targetPath, 'jestrunner.configPath', 'jest');
  }

  public findConfigPath(
    targetPath?: string,
    targetConfigFilename?: string,
    framework?: TestFrameworkName,
  ): string | undefined {
    let configFiles: readonly string[];
    if (targetConfigFilename) {
      configFiles = [targetConfigFilename];
    } else if (framework) {
      const frameworkDef = testFrameworks.find(f => f.name === framework);
      configFiles = frameworkDef ? frameworkDef.configFiles : [];
    } else {
      configFiles = testFrameworks.flatMap(f => f.configFiles);
    }

    const foundPath = searchPathToParent<string>(
      targetPath ||
      path.dirname(vscode.window.activeTextEditor.document.uri.fsPath),
      this.currentWorkspaceFolderPath,
      (currentFolderPath: string) => {
        for (const configFilename of configFiles) {
          const currentFolderConfigPath = path.join(
            currentFolderPath,
            configFilename,
          );
          if (fs.existsSync(currentFolderConfigPath)) {
            return currentFolderConfigPath;
          }
        }
      },
    );
    const result = foundPath ? normalizePath(foundPath) : undefined;
    if (result) {
      logDebug(`findConfigPath found: ${result}`);
    } else {
      logDebug(`findConfigPath failed to find config in: ${targetPath}`);
    }
    return result;
  }

  public getVitestConfigPath(targetPath: string): string {
    return this.getConfigPath(targetPath, 'jestrunner.vitestConfigPath', 'vitest');
  }

  public get runOptions(): string[] | null {
    const runOptions = this.getConfig('jestrunner.runOptions');
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
    return this.getConfig('jestrunner.debugOptions', {});
  }

  public get vitestDebugOptions(): Partial<vscode.DebugConfiguration> {
    return this.getConfig('jestrunner.vitestDebugOptions', {});
  }

  public get isCodeLensEnabled(): boolean {
    return this.getConfig('jestrunner.enableCodeLens', true);
  }

  public get codeLensOptions(): CodeLensOption[] {
    const codeLensOptions = this.getConfig('jestrunner.codeLens');
    if (Array.isArray(codeLensOptions)) {
      return validateCodeLensOptions(codeLensOptions);
    }
    return [];
  }

  public getAllPotentialSourceFiles(): string {
    // Return a broad pattern to catch all potential test files
    // Actual filtering is done by isTestFile() which reads patterns
    // from framework configs (Jest testMatch / Vitest include)
    return '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}';
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

    const vitestRunOptions = this.getConfig<string[]>('jestrunner.vitestRunOptions');
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
      ...(this.changeDirectoryToWorkspaceRoot ? { cwd: this.cwd } : {}),
      ...(isVitest ? this.vitestDebugOptions : this.debugOptions),
    };

    if (!isVitest && this.enableESM) {
      debugConfig.env = {
        ...debugConfig.env,
        NODE_OPTIONS: '--experimental-vm-modules'
      };
    }


    const customCommandKey = isVitest
      ? 'jestrunner.vitestCommand'
      : 'jestrunner.jestCommand';
    const customCommand = this.getConfig(customCommandKey);
    if (customCommand && typeof customCommand === 'string') {
      const parts = parseShellCommand(customCommand);
      if (parts.length > 0) {
        debugConfig.program = parts[0];
        debugConfig.args = isVitest
          ? [...parts.slice(1), 'run']
          : parts.slice(1);
      }
      return debugConfig;
    }

    // Use npx to resolve the binary path and execute it directly
    const binaryName = isVitest ? 'vitest' : 'jest';
    const binaryPath = resolveBinaryPath(binaryName, this.cwd);

    if (binaryPath) {
      debugConfig.program = binaryPath;
      debugConfig.args = isVitest ? ['run'] : ['--runInBand'];
    } else {
      // Fallback to npx if binary path cannot be resolved
      logWarning(`Could not resolve ${binaryName} binary path, falling back to npx`);
      debugConfig.runtimeExecutable = 'npx';
      debugConfig.args = isVitest
        ? ['--no-install', 'vitest', 'run']
        : ['--no-install', 'jest', '--runInBand'];
    }

    return debugConfig;
  }
}
