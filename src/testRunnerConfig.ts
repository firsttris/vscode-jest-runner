import * as vscode from 'vscode';
import { ConfigResolver } from './ConfigResolver';
import {
  validateCodeLensOptions,
  CodeLensOption,
} from './util';
import { getTestFrameworkForFile } from './testDetection/testFileDetection';
import { TestFrameworkName } from './testDetection/frameworkDefinitions';
import { findTestFrameworkDirectory } from './testDetection/frameworkDetection';
import { resolve } from 'node:path';
import { getFrameworkAdapter } from './frameworkAdapters';
import { normalizePath } from './utils/PathUtils';
import { quote } from './utils/TestNameUtils';
import { resolveBinaryPath } from './utils/ResolverUtils';
import { DebugConfigurationProvider } from './debug/DebugConfigurationProvider';


export class TestRunnerConfig {
  private configResolver = new ConfigResolver();
  private debugConfigProvider = new DebugConfigurationProvider();

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
    return this.debugConfigProvider.getDebugConfiguration(this, filePath, testName);
  }
}
