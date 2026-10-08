import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { cacheManager } from '../cache/CacheManager';
import { isPlaywrightDisabled } from '../config/Settings';
import { logDebug, logError } from '../utils/Logger';
import { normalizePath } from '../utils/PathUtils';
import {
	binaryExists,
	getConfigPath,
	resolveAndValidateCustomConfig,
} from './configParsing';
import {
	type FrameworkResult,
	type SearchOutcome,
	type TestFrameworkName,
	testFrameworks,
} from './frameworkDefinitions';
import { detectFrameworkByPatternMatch } from './patternMatching';

const moduleImport = (moduleName: string): RegExp =>
	new RegExp(
		`from\\s+['"]${moduleName}['"]|require\\s*\\(\\s*['"]${moduleName}['"]\\s*\\)`,
	);

const IMPORT_PATTERNS: ReadonlyArray<[TestFrameworkName, RegExp]> = [
	['node-test', moduleImport('node:test')],
	['bun', moduleImport('bun:test')],
	[
		'deno',
		/Deno\.test|from\s+['"](?:jsr:@std\/expect|@std\/assert|jsr:@std\/assert)['"]|from\s+['"]https:\/\/deno\.land\//,
	],
	['playwright', moduleImport('@playwright/test')],
	['rstest', moduleImport('(?:@rstest/core|rstest)')],
];

const NO_FRAMEWORKS: ReadonlySet<string> = new Set();

/**
 * Frameworks whose test module `filePath` imports. The file is read once
 * for all of them and cached until it changes (see invalidateNodeTestCache).
 */
function getImportedFrameworks(filePath: string): ReadonlySet<string> {
	const cached = cacheManager.getImportedFrameworks(filePath);
	if (cached) {
		return cached;
	}

	try {
		if (!existsSync(filePath)) {
			return NO_FRAMEWORKS;
		}

		const content = readFileSync(filePath, 'utf-8');
		const frameworks = new Set(
			IMPORT_PATTERNS.filter(([, pattern]) => pattern.test(content)).map(
				([framework]) => framework,
			),
		);
		cacheManager.setImportedFrameworks(filePath, frameworks);
		return frameworks;
	} catch (error) {
		logError(`Error checking the test imports of ${filePath}`, error);
		return NO_FRAMEWORKS;
	}
}

function hasFrameworkImport(
	filePath: string,
	framework: TestFrameworkName,
): boolean {
	const cached = cacheManager.getFileFramework(filePath);
	if (cached !== undefined) {
		return cached?.framework === framework;
	}
	return getImportedFrameworks(filePath).has(framework);
}

export const isNodeTestFile = (filePath: string): boolean =>
	hasFrameworkImport(filePath, 'node-test');

export const isBunTestFile = (filePath: string): boolean =>
	hasFrameworkImport(filePath, 'bun');

export const isDenoTestFile = (filePath: string): boolean =>
	hasFrameworkImport(filePath, 'deno');

export const isPlaywrightTestFile = (filePath: string): boolean =>
	hasFrameworkImport(filePath, 'playwright');

export const isRstestTestFile = (filePath: string): boolean =>
	hasFrameworkImport(filePath, 'rstest');

function hasFrameworkDependency(
	packageJson: any,
	frameworkName: TestFrameworkName,
): boolean {
	const sources = [
		packageJson.dependencies,
		packageJson.devDependencies,
		packageJson.peerDependencies,
	];

	if (frameworkName === 'rstest') {
		return (
			sources.some((deps) => deps?.['@rstest/core'] || deps?.rstest) ||
			!!packageJson.rstest
		);
	}

	return (
		sources.some((deps) => deps?.[frameworkName]) ||
		!!packageJson[frameworkName]
	);
}

export function invalidateNodeTestCache(filePath: string): void {
	cacheManager.invalidate(filePath);
}

export function isFrameworkUsedIn(
	directoryPath: string,
	frameworkName: TestFrameworkName,
): boolean {
	const cached = cacheManager.getFramework(directoryPath, frameworkName);

	if (cached !== undefined) {
		return cached;
	}

	const setCache = (value: boolean) => {
		cacheManager.setFramework(directoryPath, frameworkName, value);
	};

	try {
		const framework = testFrameworks.find((f) => f.name === frameworkName);
		if (!framework) {
			return false;
		}

		if (binaryExists(directoryPath, framework.binaryName)) {
			setCache(true);
			return true;
		}

		if (getConfigPath(directoryPath, frameworkName)) {
			setCache(true);
			return true;
		}

		const packageJsonPath = join(directoryPath, 'package.json');
		if (existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

				if (hasFrameworkDependency(packageJson, frameworkName)) {
					setCache(true);
					return true;
				}
			} catch (error) {
				logError(`Error parsing package.json for ${frameworkName}`, error);
			}
		}

		setCache(false);
		return false;
	} catch (error) {
		logError(`Error checking for ${frameworkName}`, error);
		return false;
	}
}

export function detectTestFramework(
	directoryPath: string,
	filePath?: string,
): TestFrameworkName | undefined {
	if (filePath) {
		if (isNodeTestFile(filePath)) {
			return 'node-test';
		}
		if (isBunTestFile(filePath)) {
			return 'bun';
		}
		if (isDenoTestFile(filePath)) {
			return 'deno';
		}
		if (isPlaywrightTestFile(filePath)) {
			return 'playwright';
		}
		if (isRstestTestFile(filePath)) {
			return 'rstest';
		}
	}

	const jestConfigPath = getConfigPath(directoryPath, 'jest');
	const vitestConfigPath = getConfigPath(directoryPath, 'vitest');
	const rstestConfigPath = getConfigPath(directoryPath, 'rstest');

	if (jestConfigPath && vitestConfigPath && filePath) {
		const frameworkByPattern = detectFrameworkByPatternMatch(
			directoryPath,
			filePath,
			jestConfigPath,
			vitestConfigPath,
		);
		if (frameworkByPattern) {
			return frameworkByPattern;
		}
	}

	// Without a pattern that decides, Jest wins over Vitest.
	if (jestConfigPath) {
		return 'jest';
	}
	if (vitestConfigPath) {
		return 'vitest';
	}

	if (rstestConfigPath) {
		return 'rstest';
	}

	const packageJsonPath = join(directoryPath, 'package.json');
	if (existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

			for (const framework of testFrameworks) {
				if (
					hasFrameworkDependency(
						packageJson,
						framework.name as TestFrameworkName,
					)
				) {
					return framework.name as TestFrameworkName;
				}
			}
		} catch (error) {
			logError('Error parsing package.json', error);
		}
	}

	for (const framework of testFrameworks) {
		if (binaryExists(directoryPath, framework.binaryName)) {
			return framework.name as TestFrameworkName;
		}
	}

	return undefined;
}

const matchesTarget = (
	framework: TestFrameworkName,
	targetFramework?: TestFrameworkName,
): boolean => !targetFramework || framework === targetFramework;

export const getParentDirectories = (
	startDir: string,
	rootPath: string,
): string[] => {
	if (!normalizePath(startDir).startsWith(normalizePath(rootPath))) return [];
	const parentDir = dirname(startDir);
	return parentDir === startDir
		? [startDir]
		: [startDir, ...getParentDirectories(parentDir, rootPath)];
};

const resolveCustomConfigs = (
	filePath: string,
	rootPath: string,
	targetFramework?: TestFrameworkName,
): FrameworkResult | undefined => {
	const customJestConfig = resolveAndValidateCustomConfig(
		'jestrunner.configPath',
		filePath,
	);
	const customVitestConfig = resolveAndValidateCustomConfig(
		'jestrunner.vitestConfigPath',
		filePath,
	);

	if (!customJestConfig && !customVitestConfig) return undefined;

	if (customJestConfig && customVitestConfig) {
		const frameworkByPattern = detectFrameworkByPatternMatch(
			rootPath,
			filePath,
			customJestConfig,
			customVitestConfig,
		);

		if (frameworkByPattern) {
			return matchesTarget(frameworkByPattern, targetFramework)
				? { directory: rootPath, framework: frameworkByPattern }
				: undefined;
		}

		return matchesTarget('jest', targetFramework)
			? { directory: rootPath, framework: 'jest' }
			: undefined;
	}

	if (customJestConfig && matchesTarget('jest', targetFramework)) {
		return { directory: rootPath, framework: 'jest' };
	}

	if (customVitestConfig && matchesTarget('vitest', targetFramework)) {
		return { directory: rootPath, framework: 'vitest' };
	}

	return undefined;
};

const findFrameworkInParentDirs = (
	filePath: string,
	rootPath: string,
	targetFramework?: TestFrameworkName,
): SearchOutcome => {
	const dirs = getParentDirectories(dirname(filePath), rootPath);

	const search = (remainingDirs: string[]): SearchOutcome => {
		if (remainingDirs.length === 0) return { status: 'not_found' };

		const [dir, ...rest] = remainingDirs;
		const framework = detectTestFramework(dir, filePath);

		if (framework) {
			return matchesTarget(framework, targetFramework)
				? { status: 'found', result: { directory: dir, framework } }
				: { status: 'wrong_framework' };
		}

		return search(rest);
	};

	return search(dirs);
};

const findNearestFrameworkDirectory = (
	filePath: string,
	rootPath: string,
	framework: TestFrameworkName,
): string | undefined => {
	const dirs = getParentDirectories(dirname(filePath), rootPath);
	return dirs.find((dir) => isFrameworkUsedIn(dir, framework));
};

const detectFrameworkByDependency = (
	rootPath: string,
	targetFramework?: TestFrameworkName,
): FrameworkResult | undefined => {
	const checks: Array<{ framework: TestFrameworkName; isUsed: () => boolean }> =
		targetFramework
			? [
					{
						framework: targetFramework,
						isUsed: () => isFrameworkUsedIn(rootPath, targetFramework),
					},
				]
			: [
					{
						framework: 'vitest',
						isUsed: () => isFrameworkUsedIn(rootPath, 'vitest'),
					},
					{
						framework: 'jest',
						isUsed: () => isFrameworkUsedIn(rootPath, 'jest'),
					},
					{
						framework: 'bun',
						isUsed: () => isFrameworkUsedIn(rootPath, 'bun'),
					},
					{
						framework: 'deno',
						isUsed: () => isFrameworkUsedIn(rootPath, 'deno'),
					},
					{
						framework: 'playwright',
						isUsed: () => isFrameworkUsedIn(rootPath, 'playwright'),
					},
					{
						framework: 'rstest',
						isUsed: () => isFrameworkUsedIn(rootPath, 'rstest'),
					},
				];

	const found = checks.find((check) => check.isUsed());
	return found
		? { directory: rootPath, framework: found.framework }
		: undefined;
};

export function findTestFrameworkDirectory(
	filePath: string,
	targetFramework?: TestFrameworkName,
): FrameworkResult | undefined {
	// testFileCache stores this function's result for each test file.
	const cached = targetFramework
		? undefined
		: cacheManager.getFileFramework(filePath);
	if (cached) {
		return cached as FrameworkResult;
	}

	const workspaceFolder = vscode.workspace.getWorkspaceFolder(
		vscode.Uri.file(filePath),
	);
	if (!workspaceFolder) return undefined;

	const rootPath = workspaceFolder.uri.fsPath;

	const isNodeTest = isNodeTestFile(filePath);
	if (isNodeTest) {
		logDebug(`Detected node:test for ${filePath}`);
		return { directory: dirname(filePath), framework: 'node-test' };
	}

	const isBun = isBunTestFile(filePath);
	if (isBun) {
		return { directory: dirname(filePath), framework: 'bun' };
	}

	const isDeno = isDenoTestFile(filePath);
	if (isDeno) {
		return { directory: dirname(filePath), framework: 'deno' };
	}

	const isPlaywright = isPlaywrightTestFile(filePath);
	if (isPlaywright) {
		if (isPlaywrightDisabled()) return undefined;
		return { directory: dirname(filePath), framework: 'playwright' };
	}

	const isRstest = isRstestTestFile(filePath);
	if (isRstest) {
		if (!matchesTarget('rstest', targetFramework)) {
			return undefined;
		}

		const nearestRstestDirectory = findNearestFrameworkDirectory(
			filePath,
			rootPath,
			'rstest',
		);

		return {
			directory: nearestRstestDirectory ?? dirname(filePath),
			framework: 'rstest',
		};
	}

	const customResult = resolveCustomConfigs(
		filePath,
		rootPath,
		targetFramework,
	);
	if (customResult) return customResult;

	const parentDirResult = findFrameworkInParentDirs(
		filePath,
		rootPath,
		targetFramework,
	);
	if (parentDirResult.status === 'found') {
		if (
			parentDirResult.result.framework === 'playwright' &&
			isPlaywrightDisabled()
		)
			return undefined;
		return parentDirResult.result;
	}
	if (parentDirResult.status === 'wrong_framework') return undefined;

	const depResult = detectFrameworkByDependency(rootPath, targetFramework);
	if (depResult?.framework === 'playwright' && isPlaywrightDisabled())
		return undefined;
	return depResult;
}
