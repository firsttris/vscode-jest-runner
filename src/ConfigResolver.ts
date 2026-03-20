import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as vscode from 'vscode';
import { cacheManager } from './cache/CacheManager';
import { packageJsonHasJestConfig } from './testDetection/configParsing';
import {
	type TestFrameworkName,
	testFrameworks,
} from './testDetection/frameworkDefinitions';
import { logDebug } from './utils/Logger';
import { normalizePath, resolveConfigPathOrMapping } from './utils/PathUtils';
import { resolveConfigPath as resolveConfigPathInTree } from './utils/ResolverUtils';

export interface ConfigResolutionContext {
	currentWorkspaceFolderPath: string;
	projectPathFromConfig?: string;
	useNearestConfig?: boolean;
}

export function resolveConfigPath(
	targetPath: string,
	configKey: string,
	context: ConfigResolutionContext,
	framework?: TestFrameworkName,
): string {
	const configPathOrMapping = vscode.workspace
		.getConfiguration()
		.get<string | Record<string, string>>(configKey);

	const configPath = resolveConfigPathOrMapping(configPathOrMapping, targetPath);

	if (context.useNearestConfig) {
		const foundPath = findConfigPath(targetPath, context, configPath, framework);
		if (foundPath) {
			logDebug(`Found config path using findConfigPath: ${foundPath}`);
			return foundPath;
		}
	}

	if (configPath) {
		const resolvedPath = normalizePath(
			resolve(
				context.currentWorkspaceFolderPath,
				context.projectPathFromConfig || '',
				configPath,
			),
		);

		if (existsSync(resolvedPath)) {
			return resolvedPath;
		}

		const foundPath = findConfigPath(targetPath, context, undefined, framework);
		if (foundPath) {
			logDebug(`Found config path (fallback) using findConfigPath: ${foundPath}`);
			return foundPath;
		}

		logDebug(`Using resolved config path from settings: ${resolvedPath}`);
		return resolvedPath;
	}

	return '';
}

export function findConfigPath(
	targetPath: string | undefined,
	context: ConfigResolutionContext,
	targetConfigFilename?: string,
	framework?: TestFrameworkName,
): string | undefined {
	let configFiles: readonly string[];
	if (targetConfigFilename) {
		configFiles = [targetConfigFilename];
	} else if (framework) {
		const frameworkDef = testFrameworks.find((f) => f.name === framework);
		configFiles = frameworkDef ? frameworkDef.configFiles : [];
	} else {
		configFiles = testFrameworks.flatMap((f) => f.configFiles);
	}

	const currentWorkspaceFolderPath = context.currentWorkspaceFolderPath;
	const startPath =
		targetPath || dirname(vscode.window.activeTextEditor?.document.uri.fsPath || '');

	if (!startPath) {
		return undefined;
	}

	const cacheKey = `config:${startPath}:${configFiles.join(',')}`;
	const cachedPath = cacheManager.getConfigPath(cacheKey);
	if (cachedPath !== undefined) {
		return cachedPath;
	}

	const foundPath = resolveConfigPathInTree(
		[...configFiles],
		startPath,
		currentWorkspaceFolderPath,
		(filePath: string) => {
			if (filePath.endsWith('package.json')) {
				return packageJsonHasJestConfig(filePath);
			}
			return true;
		},
	);

	if (foundPath) {
		logDebug(`findConfigPath found: ${foundPath}`);
	} else {
		logDebug(`findConfigPath failed to find config in: ${targetPath}`);
	}

	cacheManager.setConfigPath(cacheKey, foundPath);
	return foundPath;
}
