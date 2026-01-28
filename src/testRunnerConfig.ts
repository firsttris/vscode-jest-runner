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
  logDebug,
  isNodeExecuteAbleFile,
  isWindows,
} from './util';
import { getTestFrameworkForFile } from './testDetection/testFileDetection';
import { TestFrameworkName, testFrameworks } from './testDetection/frameworkDefinitions';
import { findTestFrameworkDirectory } from './testDetection/frameworkDetection';

export function detectYarnPnp(
  cwd: string,
  workspaceRoot: string,
): { enabled: boolean; yarnBinary?: string } {
  let yarnBinary: string | undefined;

  const foundPnpPath = searchPathToParent(
    cwd,
    workspaceRoot,
    (currentFolderPath) => {
      const yarnReleasesPath = path.join(currentFolderPath, '.yarn', 'releases');
      if (fs.existsSync(yarnReleasesPath)) {
        try {
          const files = fs.readdirSync(yarnReleasesPath);
          const foundBinary = files.find(
            (file) => file.startsWith('yarn-') && file.endsWith('.cjs'),
          );
          if (foundBinary) {
            yarnBinary = foundBinary;
          }
          return yarnReleasesPath;
        } catch { }
        // If we found the folder but failed to read it, we might still want to consider it PnP?
        // But for safety, strict check: if we can read it and find binary OR just find folder?
        // Existing logic suggests: if folder exists, it is PnP candidate.
        return yarnReleasesPath;
      }
    },
  );

  if (foundPnpPath) {
    return { enabled: true, yarnBinary };
  }

  return { enabled: false };
}

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
  private getConfig<T>(key: string, defaultValue?: T): T | undefined {
    return vscode.workspace.getConfiguration().get(key, defaultValue);
  }

  public get jestCommand(): string {
    const customCommand = this.getConfig<string>('jestrunner.jestCommand');
    if (customCommand) {
      return customCommand;
    }

    const yarnPnp = detectYarnPnp(this.cwd, this.currentWorkspaceFolderPath);
    if (yarnPnp.enabled) {
      return `yarn jest`;
    }

    return 'npx --no-install jest';
  }

  public get vitestCommand(): string {
    const customCommand = this.getConfig<string>('jestrunner.vitestCommand');
    if (customCommand) {
      return customCommand;
    }

    const yarnPnp = detectYarnPnp(this.cwd, this.currentWorkspaceFolderPath);
    if (yarnPnp.enabled) {
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

  public get jestBinPath(): string {
    const jestPath = this.getConfig<string>('jestrunner.jestPath');
    if (jestPath) {
      return jestPath;
    }

    const fallbackRelativeJestBinPath = 'node_modules/jest/bin/jest.js';
    const mayRelativeJestBin = [
      'node_modules/.bin/jest',
      'node_modules/jest/bin/jest.js',
    ];
    const cwd = this.cwd;

    const foundJestPath = searchPathToParent(
      cwd,
      this.currentWorkspaceFolderPath,
      (currentFolderPath) => {
        const found = mayRelativeJestBin.find((relativeJestBin) =>
          isNodeExecuteAbleFile(path.join(currentFolderPath, relativeJestBin)),
        );
        if (found) {
          return path.join(currentFolderPath, found);
        }
      },
    );

    return normalizePath(
      foundJestPath || path.join(cwd, fallbackRelativeJestBinPath),
    );
  }

  public get vitestBinPath(): string {
    const vitestPath = this.getConfig<string>('jestrunner.vitestPath');
    if (vitestPath) {
      return vitestPath;
    }

    const fallbackRelativeVitestBinPath = 'node_modules/vitest/vitest.mjs';
    const mayRelativeVitestBin = [
      'node_modules/.bin/vitest',
      'node_modules/vitest/vitest.mjs',
    ];
    const cwd = this.cwd;

    const foundVitestPath = searchPathToParent(
      cwd,
      this.currentWorkspaceFolderPath,
      (currentFolderPath) => {
        const found = mayRelativeVitestBin.find((relativeVitestBin) =>
          isNodeExecuteAbleFile(path.join(currentFolderPath, relativeVitestBin)),
        );
        if (found) {
          return path.join(currentFolderPath, found);
        }
      },
    );

    return normalizePath(
      foundVitestPath || path.join(cwd, fallbackRelativeVitestBinPath),
    );
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

    const yarnPnp = detectYarnPnp(this.cwd, this.currentWorkspaceFolderPath);

    if (isVitest) {
      if (yarnPnp.enabled && !yarnPnp.yarnBinary) {
        debugConfig.runtimeExecutable = 'yarn';
        debugConfig.args = ['vitest', 'run'];
      } else if (isWindows()) {
        debugConfig.program = this.vitestBinPath;
        debugConfig.args = ['run'];
      } else {
        debugConfig.runtimeExecutable = 'npx';
        debugConfig.args = ['--no-install', 'vitest', 'run'];
      }
    } else {
      if (yarnPnp.enabled && !yarnPnp.yarnBinary) {
        debugConfig.runtimeExecutable = 'yarn';
        debugConfig.args = ['jest', '--runInBand'];
      } else if (isWindows()) {
        debugConfig.program = this.jestBinPath;
        debugConfig.args = ['--runInBand'];
      } else {
        debugConfig.runtimeExecutable = 'npx';
        debugConfig.args = ['--no-install', 'jest', '--runInBand'];
      }
    }

    if (!isVitest && this.enableESM) {
      debugConfig.env = {
        ...debugConfig.env,
        NODE_OPTIONS: '--experimental-vm-modules'
      };
    }


    if (yarnPnp.enabled && yarnPnp.yarnBinary) {
      delete debugConfig.runtimeExecutable;
      debugConfig.program = `.yarn/releases/${yarnPnp.yarnBinary}`;
      debugConfig.args = isVitest ? ['vitest', 'run'] : ['jest'];
      return debugConfig;
    }

    const customCommandKey = isVitest
      ? 'jestrunner.vitestCommand'
      : 'jestrunner.jestCommand';
    const customCommand = this.getConfig(customCommandKey);
    if (customCommand && typeof customCommand === 'string') {
      const parts = parseShellCommand(customCommand);
      if (parts.length > 0) {
        delete debugConfig.runtimeExecutable;
        debugConfig.program = parts[0];
        debugConfig.args = isVitest
          ? [...parts.slice(1), 'run']
          : parts.slice(1);
      }
      return debugConfig;
    }

    return debugConfig;
  }
}
