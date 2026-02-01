import * as vscode from 'vscode';
import { CodeLensOption, validateCodeLensOptions } from '../util';

// Pure helper - no side effects
const getConfig = <T>(key: string, defaultValue?: T): T | undefined =>
  vscode.workspace.getConfiguration().get(key, defaultValue);

// === Jest Settings ===

export const getJestCommand = (): string | undefined =>
  getConfig<string>('jestrunner.jestCommand');

export const getJestConfigPath = (): string | Record<string, string> | undefined =>
  getConfig<string | Record<string, string>>('jestrunner.configPath');

export const getJestRunOptions = (): string[] | null => {
  const options = getConfig('jestrunner.runOptions');
  if (!options) return null;
  if (Array.isArray(options)) return options;
  vscode.window.showWarningMessage(
    'Please check your vscode settings. "jestrunner.runOptions" must be an Array.',
  );
  return null;
};

export const getJestDebugOptions = (): Partial<vscode.DebugConfiguration> =>
  getConfig('jestrunner.debugOptions', {});

// === Vitest Settings ===

export const getVitestCommand = (): string | undefined =>
  getConfig<string>('jestrunner.vitestCommand');

export const getVitestConfigPath = (): string | Record<string, string> | undefined =>
  getConfig<string | Record<string, string>>('jestrunner.vitestConfigPath');

export const getVitestRunOptions = (): string[] | null => {
  const options = getConfig<string[]>('jestrunner.vitestRunOptions');
  return options && Array.isArray(options) ? options : null;
};

export const getVitestDebugOptions = (): Partial<vscode.DebugConfiguration> =>
  getConfig('jestrunner.vitestDebugOptions', {});

// === Node Test Settings ===

export const getNodeTestCommand = (): string | undefined =>
  getConfig<string>('jestrunner.nodeTestCommand');

export const getNodeTestRunOptions = (): string[] | null => {
  const options = getConfig<string[]>('jestrunner.nodeTestRunOptions');
  return options && Array.isArray(options) ? options : null;
};

export const getNodeTestDebugOptions = (): Partial<vscode.DebugConfiguration> =>
  getConfig('jestrunner.nodeTestDebugOptions', {});

// === General Settings ===

export const getProjectPath = (): string | undefined =>
  getConfig<string>('jestrunner.projectPath');

export const isChangeDirectoryToWorkspaceRoot = (): boolean =>
  getConfig('jestrunner.changeDirectoryToWorkspaceRoot', false);

export const isPreserveEditorFocus = (): boolean =>
  getConfig('jestrunner.preserveEditorFocus', false);

export const isUseNearestConfig = (): boolean | undefined =>
  getConfig<boolean>('jestrunner.useNearestConfig');

export const isESMEnabled = (): boolean =>
  getConfig<boolean>('jestrunner.enableESM', false);

// === CodeLens Settings ===

export const isCodeLensEnabled = (): boolean =>
  getConfig('jestrunner.enableCodeLens', true);

export const getCodeLensOptions = (): CodeLensOption[] => {
  const options = getConfig('jestrunner.codeLens');
  return Array.isArray(options) ? validateCodeLensOptions(options) : [];
};

// === Test Detection Settings ===

export const getDefaultTestPatterns = (): string[] | undefined =>
  getConfig<string[]>('jestrunner.defaultTestPatterns');

// === Computed Settings ===

export const getRunOptionsForFramework = (framework: 'jest' | 'vitest' | 'node-test'): string[] | null => {
  switch (framework) {
    case 'vitest':
      return getVitestRunOptions() ?? getJestRunOptions();
    case 'node-test':
      return getNodeTestRunOptions();
    default:
      return getJestRunOptions();
  }
};

export const getDebugOptionsForFramework = (framework: 'jest' | 'vitest' | 'node-test'): Partial<vscode.DebugConfiguration> => {
  switch (framework) {
    case 'vitest':
      return getVitestDebugOptions();
    case 'node-test':
      return getNodeTestDebugOptions();
    default:
      return getJestDebugOptions();
  }
};
