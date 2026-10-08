import * as vscode from 'vscode';
import type { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import { type CodeLensOption, validateCodeLensOptions } from '../util';

function getConfig<T>(key: string): T | undefined;
function getConfig<T>(key: string, defaultValue: T): T;
function getConfig<T>(key: string, defaultValue?: T): T | undefined {
	return vscode.workspace.getConfiguration().get(key, defaultValue);
}

/**
 * A run options setting, or null when it is not an array (the settings
 * editor already marks values of the wrong type).
 */
const getRunOptions = (key: string): string[] | null => {
	const options = getConfig<unknown>(key);
	return Array.isArray(options) ? options : null;
};

// === Jest Settings ===

export const getJestCommand = (): string | undefined =>
	getConfig<string>('jestrunner.jestCommand');

export const getJestConfigPath = ():
	| string
	| Record<string, string>
	| undefined =>
	getConfig<string | Record<string, string>>('jestrunner.configPath');

export const getJestRunOptions = (): string[] | null =>
	getRunOptions('jestrunner.runOptions');

export const getJestDebugOptions = (): Partial<vscode.DebugConfiguration> =>
	getConfig('jestrunner.debugOptions', {});

// === Vitest Settings ===

export const getVitestCommand = (): string | undefined =>
	getConfig<string>('jestrunner.vitestCommand');

export const getVitestConfigPath = ():
	| string
	| Record<string, string>
	| undefined =>
	getConfig<string | Record<string, string>>('jestrunner.vitestConfigPath');

export const getVitestRunOptions = (): string[] | null =>
	getRunOptions('jestrunner.vitestRunOptions');

export const getVitestDebugOptions = (): Partial<vscode.DebugConfiguration> =>
	getConfig('jestrunner.vitestDebugOptions', {});

// === Node Test Settings ===

export const getNodeTestCommand = (): string | undefined =>
	getConfig<string>('jestrunner.nodeTestCommand');

export const getNodeTestRunOptions = (): string[] | null =>
	getRunOptions('jestrunner.nodeTestRunOptions');

export const getNodeTestDebugOptions = (): Partial<vscode.DebugConfiguration> =>
	getConfig('jestrunner.nodeTestDebugOptions', {});

// === Bun Settings ===

export const getBunRunOptions = (): string[] | null =>
	getRunOptions('jestrunner.bunRunOptions');

export const getBunDebugOptions = (): Partial<vscode.DebugConfiguration> =>
	getConfig('jestrunner.bunDebugOptions', {});

// === Deno Settings ===

export const getDenoRunOptions = (): string[] | null =>
	getRunOptions('jestrunner.denoRunOptions');

export const getDenoDebugOptions = (): Partial<vscode.DebugConfiguration> =>
	getConfig('jestrunner.denoDebugOptions', {});

// === Playwright Settings ===

export const getPlaywrightCommand = (): string | undefined =>
	getConfig<string>('jestrunner.playwrightCommand');

export const getPlaywrightConfigPath = (): string | undefined =>
	getConfig<string>('jestrunner.playwrightConfigPath');

export const isPlaywrightDisabled = (): boolean =>
	getConfig<boolean>('jestrunner.disablePlaywright', false);

export const getPlaywrightRunOptions = (): string[] | null =>
	getRunOptions('jestrunner.playwrightRunOptions');

export const getPlaywrightDebugOptions =
	(): Partial<vscode.DebugConfiguration> =>
		getConfig('jestrunner.playwrightDebugOptions', {});

// === Rstest Settings ===

export const getRstestCommand = (): string | undefined =>
	getConfig<string>('jestrunner.rstestCommand');

export const getRstestRunOptions = (): string[] | null =>
	getRunOptions('jestrunner.rstestRunOptions');

export const getRstestDebugOptions = (): Partial<vscode.DebugConfiguration> =>
	getConfig('jestrunner.rstestDebugOptions', {});

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

export const getDebugOptionsForFramework = (
	framework: TestFrameworkName,
): Partial<vscode.DebugConfiguration> => {
	switch (framework) {
		case 'vitest':
			return getVitestDebugOptions();
		case 'node-test':
			return getNodeTestDebugOptions();
		case 'bun':
			return getBunDebugOptions();
		case 'deno':
			return getDenoDebugOptions();
		case 'playwright':
			return getPlaywrightDebugOptions();
		case 'rstest':
			return getRstestDebugOptions();
		default:
			return getJestDebugOptions();
	}
};
