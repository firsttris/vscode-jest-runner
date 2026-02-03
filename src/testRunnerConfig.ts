import * as vscode from 'vscode';
import { ConfigResolver } from './ConfigResolver';
import { CodeLensOption } from './util';
import { getTestFrameworkForFile } from './testDetection/testFileDetection';
import { TestFrameworkName } from './testDetection/frameworkDefinitions';
import { findTestFrameworkDirectory } from './testDetection/frameworkDetection';
import { resolve } from 'node:path';
import { getFrameworkAdapter } from './frameworkAdapters';
import { normalizePath } from './utils/PathUtils';
import { quote } from './utils/TestNameUtils';
import { resolveBinaryPath } from './utils/ResolverUtils';
import { DebugConfigurationProvider } from './debug/DebugConfigurationProvider';
import * as Settings from './config/Settings';


export class TestRunnerConfig {
  private configResolver = new ConfigResolver();
  private debugConfigProvider = new DebugConfigurationProvider();

  public get jestCommand(): string {
    const customCommand = Settings.getJestCommand();
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
    const customCommand = Settings.getVitestCommand();
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
    return Settings.getNodeTestCommand() || 'node';
  }

  public get bunCommand(): string {
    return 'bun';
  }

  public get denoCommand(): string {
    return 'deno';
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
      if (framework === 'bun') {
        return this.bunCommand;
      }
      if (framework === 'deno') {
        return this.denoCommand;
      }
    }
    return this.jestCommand;
  }

  public get enableESM(): boolean {
    return Settings.isESMEnabled();
  }

  public getEnvironmentForRun(_filePath: string): Record<string, string> | undefined {
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
    return Settings.isChangeDirectoryToWorkspaceRoot();
  }

  public get preserveEditorFocus(): boolean {
    return Settings.isPreserveEditorFocus();
  }

  public get cwd(): string {
    return (
      this.projectPathFromConfig ||
      this.currentPackagePath ||
      this.currentWorkspaceFolderPath
    );
  }

  public get projectPathFromConfig(): string | undefined {
    const projectPath = Settings.getProjectPath();
    if (projectPath) {
      return resolve(this.currentWorkspaceFolderPath, projectPath);
    }
  }

  public get useNearestConfig(): boolean | undefined {
    return Settings.isUseNearestConfig();
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
        projectPathFromConfig: this.projectPathFromConfig,
        useNearestConfig: this.useNearestConfig
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
    return Settings.getJestRunOptions();
  }

  public get debugOptions(): Partial<vscode.DebugConfiguration> {
    return Settings.getJestDebugOptions();
  }

  public get vitestDebugOptions(): Partial<vscode.DebugConfiguration> {
    return Settings.getVitestDebugOptions();
  }

  public get nodeTestDebugOptions(): Partial<vscode.DebugConfiguration> {
    return Settings.getNodeTestDebugOptions();
  }

  public get nodeTestRunOptions(): string[] | null {
    return Settings.getNodeTestRunOptions();
  }

  public get bunRunOptions(): string[] | null {
    return Settings.getBunRunOptions();
  }

  public get denoRunOptions(): string[] | null {
    return Settings.getDenoRunOptions();
  }

  public get bunDebugOptions(): Partial<vscode.DebugConfiguration> {
    return Settings.getBunDebugOptions();
  }

  public get denoDebugOptions(): Partial<vscode.DebugConfiguration> {
    return Settings.getDenoDebugOptions();
  }

  public get isCodeLensEnabled(): boolean {
    return Settings.isCodeLensEnabled();
  }

  public get codeLensOptions(): CodeLensOption[] {
    return Settings.getCodeLensOptions();
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
    const runOptions = Settings.getVitestRunOptions() ?? this.runOptions;

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
      '',
      this.nodeTestRunOptions,
    );
  }

  public buildBunArgs(
    filePath: string,
    testName: string | undefined,
    withQuotes: boolean,
    options: string[] = [],
  ): string[] {
    return getFrameworkAdapter('bun').buildArgs(
      filePath,
      testName,
      withQuotes,
      options,
      '',
      Settings.getBunRunOptions(),
    );
  }

  public buildDenoArgs(
    filePath: string,
    testName: string | undefined,
    withQuotes: boolean,
    options: string[] = [],
  ): string[] {
    return getFrameworkAdapter('deno').buildArgs(
      filePath,
      testName,
      withQuotes,
      options,
      '',
      Settings.getDenoRunOptions(),
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
    if (framework === 'bun') {
      return this.buildBunArgs(filePath, testName, withQuotes, options);
    }
    if (framework === 'deno') {
      return this.buildDenoArgs(filePath, testName, withQuotes, options);
    }
    return this.buildJestArgs(filePath, testName, withQuotes, options);
  }

  public getDebugConfiguration(filePath?: string, testName?: string): vscode.DebugConfiguration {
    return this.debugConfigProvider.getDebugConfiguration(this, filePath, testName);
  }
}
