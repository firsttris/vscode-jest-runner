import * as vscode from 'vscode';
import { createRequire } from 'module';
import { ConfigResolver } from './ConfigResolver';
import {
  normalizePath,
  validateCodeLensOptions,
  CodeLensOption,
  resolveConfigPathOrMapping,
  searchPathToParent,
  resolveTestNameStringInterpolation,
  quote,
  logDebug,
  logWarning,
  parseShellCommand,
  isWindows,
} from './util';
import { getTestFrameworkForFile } from './testDetection/testFileDetection';
import { TestFrameworkName, testFrameworks } from './testDetection/frameworkDefinitions';
import { findTestFrameworkDirectory } from './testDetection/frameworkDetection';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { getFrameworkAdapter } from './frameworkAdapters';



/**
 * Resolve the absolute path to a binary using Node's require.resolve.
 * This recursively searches parent directories, just like npx does.
 */
function resolveBinaryPath(binaryName: string, cwd: string): string | undefined {
  try {
    // Create a require function with the cwd as the base path
    // This allows require.resolve to search from the project directory upwards
    const requireFromCwd = createRequire(join(cwd, 'package.json'));

    // Strategy 1: On non-Windows, try node_modules/.bin symlink (most reliable)
    // These are executable symlinks created by npm/yarn/pnpm
    if (!isWindows()) {
      try {
        const pkgJsonPath = requireFromCwd.resolve(`${binaryName}/package.json`);
        // Extract the base node_modules path (works for normal, scoped, and pnpm layouts)
        const nodeModulesMatch = pkgJsonPath.split(/[/\\]node_modules[/\\]/);
        if (nodeModulesMatch.length > 1) {
          const binPath = join(nodeModulesMatch[0], 'node_modules', '.bin', binaryName);
          if (existsSync(binPath)) {
            logDebug(`Resolved binary via node_modules/.bin for ${binaryName}: ${binPath}`);
            return normalizePath(binPath);
          }
        }
      } catch {
        // .bin approach failed, try other strategies
      }
    }

    // Strategy 2: Resolve via package.json and bin field
    // Works for packages that don't export their bin (e.g., vitest)
    try {
      const pkgJsonPath = requireFromCwd.resolve(`${binaryName}/package.json`);
      const pkgDir = dirname(pkgJsonPath);
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const binEntry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[binaryName];
      if (binEntry) {
        const binPath = join(pkgDir, binEntry);
        if (existsSync(binPath)) {
          logDebug(`Resolved binary via package.json for ${binaryName}: ${binPath}`);
          return normalizePath(binPath);
        }
      }
    } catch {
      // Package.json approach also failed
    }
  } catch (error) {
    logWarning(`Failed to resolve binary path for ${binaryName}: ${error}`);
  }
  return undefined;
}


export class TestRunnerConfig {
  private configResolver = new ConfigResolver();

  private getConfig<T>(key: string, defaultValue?: T): T | undefined {
    return vscode.workspace.getConfiguration().get(key, defaultValue);
  }

  public get jestCommand(): string {
    const customCommand = this.getConfig<string>('jestrunner.jestCommand');
    if (customCommand) {
      return customCommand;
    }

    const binaryPath = resolveBinaryPath('jest', this.cwd);
    if (binaryPath) {
      return `node ${quote(binaryPath)}`;
    }

    return 'npx --no-install jest';
  }

  public get vitestCommand(): string {
    const customCommand = this.getConfig<string>('jestrunner.vitestCommand');
    if (customCommand) {
      return customCommand;
    }

    const binaryPath = resolveBinaryPath('vitest', this.cwd);
    if (binaryPath) {
      return `node ${quote(binaryPath)}`;
    }

    return 'npx --no-install vitest';
  }

  public get nodeTestCommand(): string {
    const customCommand = this.getConfig<string>('jestrunner.nodeTestCommand');
    if (customCommand) {
      return customCommand;
    }
    return 'node';
  }

  public getTestCommand(filePath?: string): string {
    if (filePath) {
      const framework = getTestFrameworkForFile(filePath);
      if (framework === 'vitest') {
        return this.vitestCommand;
      }
      if (framework === 'node-test') {
        return this.nodeTestCommand;
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

  public get projectPathFromConfig(): string | undefined {
    const projectPathFromConfig = this.getConfig<string>('jestrunner.projectPath');
    if (projectPathFromConfig) {
      return resolve(
        this.currentWorkspaceFolderPath,
        projectPathFromConfig,
      );
    }
  }

  public get useNearestConfig(): boolean | undefined {
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

  public get currentWorkspaceFolderPath(): string {
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
    return this.configResolver.resolveConfigPath(
      targetPath,
      configKey,
      {
        currentWorkspaceFolderPath: this.currentWorkspaceFolderPath,
        projectPathFromConfig: this.projectPathFromConfig, // accessed via public getter
        useNearestConfig: this.useNearestConfig // accessed via public getter
      },
      framework
    );
  }

  public getJestConfigPath(targetPath: string): string {
    return this.getConfigPath(targetPath, 'jestrunner.configPath', 'jest');
  }

  public findConfigPath(
    targetPath?: string,
    targetConfigFilename?: string,
    framework?: TestFrameworkName,
  ): string | undefined {
    return this.configResolver.findConfigPath(
      targetPath,
      {
        currentWorkspaceFolderPath: this.currentWorkspaceFolderPath,
        projectPathFromConfig: this.projectPathFromConfig,
        useNearestConfig: this.useNearestConfig
      },
      targetConfigFilename,
      framework
    );
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

  public get nodeTestDebugOptions(): Partial<vscode.DebugConfiguration> {
    return this.getConfig('jestrunner.nodeTestDebugOptions', {});
  }

  public get nodeTestRunOptions(): string[] | null {
    const runOptions = this.getConfig<string[]>('jestrunner.nodeTestRunOptions');
    if (runOptions && Array.isArray(runOptions)) {
      return runOptions;
    }
    return null;
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
    const configPath = this.getJestConfigPath(filePath);
    return getFrameworkAdapter('jest').buildArgs(
      filePath,
      testName,
      withQuotes,
      options,
      configPath,
      this.runOptions,
    );
  }

  public buildVitestArgs(
    filePath: string,
    testName: string | undefined,
    withQuotes: boolean,
    options: string[] = [],
  ): string[] {
    const configPath = this.getVitestConfigPath(filePath);
    const vitestRunOptions = this.getConfig<string[]>('jestrunner.vitestRunOptions');
    const runOptions = (vitestRunOptions && Array.isArray(vitestRunOptions))
      ? vitestRunOptions
      : this.runOptions;

    return getFrameworkAdapter('vitest').buildArgs(
      filePath,
      testName,
      withQuotes,
      options,
      configPath,
      runOptions,
    );
  }

  public buildNodeTestArgs(
    filePath: string,
    testName: string | undefined,
    withQuotes: boolean,
    options: string[] = [],
  ): string[] {
    return getFrameworkAdapter('node-test').buildArgs(
      filePath,
      testName,
      withQuotes,
      options,
      '', // Node test has no config file
      this.nodeTestRunOptions,
    );
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
    if (framework === 'node-test') {
      return this.buildNodeTestArgs(filePath, testName, withQuotes, options);
    }
    return this.buildJestArgs(filePath, testName, withQuotes, options);
  }

  public getDebugConfiguration(filePath?: string, testName?: string): vscode.DebugConfiguration {
    const framework = this.getTestFramework(filePath);
    const isVitest = framework === 'vitest';
    const isNodeTest = framework === 'node-test';

    const debugConfig: vscode.DebugConfiguration = {
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      name: isNodeTest
        ? 'Debug Node.js Tests'
        : isVitest
          ? 'Debug Vitest Tests'
          : 'Debug Jest Tests',
      request: 'launch',
      type: 'node',
      ...(this.changeDirectoryToWorkspaceRoot ? { cwd: this.cwd } : {}),
      ...(isNodeTest
        ? this.nodeTestDebugOptions
        : isVitest
          ? this.vitestDebugOptions
          : this.debugOptions),
    };

    if (!isVitest && !isNodeTest && this.enableESM) {
      debugConfig.env = {
        ...debugConfig.env,
        NODE_OPTIONS: '--experimental-vm-modules'
      };
    }

    // Node.js test runner uses node directly with --test flag
    if (isNodeTest) {
      const customCommand = this.getConfig<string>('jestrunner.nodeTestCommand');
      if (customCommand) {
        const parts = parseShellCommand(customCommand);
        if (parts.length > 0) {
          debugConfig.runtimeExecutable = parts[0];
          debugConfig.runtimeArgs = [...parts.slice(1), '--test'];
        }
      } else {
        debugConfig.runtimeArgs = ['--test'];
      }

      // Add test name pattern if specified
      if (testName) {
        let resolvedTestName = testName;
        if (testName.includes('%')) {
          resolvedTestName = resolveTestNameStringInterpolation(testName);
        }
        debugConfig.runtimeArgs.push('--test-name-pattern', resolvedTestName);
      }

      // Add user-configured run options
      if (this.nodeTestRunOptions) {
        debugConfig.runtimeArgs.push(...this.nodeTestRunOptions);
      }

      debugConfig.program = filePath || '';
      debugConfig.args = [];
      return debugConfig;
    }

    // Jest/Vitest: build test args and add to config (only if filePath is provided)
    const testArgs = filePath
      ? (isVitest
        ? this.buildVitestArgs(filePath, testName, false)
        : this.buildJestArgs(filePath, testName, false))
      : [];

    const customCommandKey = isVitest
      ? 'jestrunner.vitestCommand'
      : 'jestrunner.jestCommand';
    const customCommand = this.getConfig(customCommandKey);
    if (customCommand && typeof customCommand === 'string') {
      const parts = parseShellCommand(customCommand);
      if (parts.length > 0) {
        debugConfig.program = parts[0];
        debugConfig.args = isVitest
          ? [...parts.slice(1), ...testArgs]
          : [...parts.slice(1), ...testArgs];
      }
      return debugConfig;
    }

    // Use npx to resolve the binary path and execute it directly
    const binaryName = isVitest ? 'vitest' : 'jest';
    const binaryPath = resolveBinaryPath(binaryName, this.cwd);

    if (binaryPath) {
      debugConfig.program = binaryPath;
      debugConfig.args = isVitest ? ['run', ...testArgs] : ['--runInBand', ...testArgs];
    } else {
      // Fallback to npx if binary path cannot be resolved
      logWarning(`Could not resolve ${binaryName} binary path, falling back to npx`);
      debugConfig.runtimeExecutable = 'npx';
      debugConfig.args = isVitest
        ? ['--no-install', 'vitest', 'run', ...testArgs]
        : ['--no-install', 'jest', '--runInBand', ...testArgs];
    }

    return debugConfig;
  }
}
