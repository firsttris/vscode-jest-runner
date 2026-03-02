import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as vscode from 'vscode';
import {
  allTestFrameworks,
  DEFAULT_TEST_PATTERNS,
} from './frameworkDefinitions';
import { logError } from '../utils/Logger';
import { resolveConfigPathOrMapping } from '../utils/PathUtils';
import * as Settings from '../config/Settings';

import { viteConfigHasTestAttribute } from './configParsers/vitestParser';

export function packageJsonHasJestConfig(configPath: string): boolean {
  try {
    const content = readFileSync(configPath, 'utf8');
    const packageJson = JSON.parse(content);
    return 'jest' in packageJson;
  } catch (error) {
    logError(`Error reading package.json: ${configPath}`, error);
    return false;
  }
}

export function binaryExists(
  directoryPath: string,
  binaryName: string,
): boolean {
  const possibleBinaryPaths = [
    join(directoryPath, 'node_modules', '.bin', binaryName),
    join(directoryPath, 'node_modules', '.bin', `${binaryName}.cmd`),
    join(directoryPath, 'node_modules', binaryName, 'package.json'),
  ];
  return possibleBinaryPaths.some(existsSync);
}

export function getConfigPath(
  directoryPath: string,
  frameworkName: string,
): string | undefined {
  const framework = allTestFrameworks.find((f) => f.name === frameworkName);
  if (!framework) return undefined;
  for (const configFile of framework.configFiles) {
    const configPath = join(directoryPath, configFile);
    if (!existsSync(configPath)) continue;
    if (configFile.startsWith('vite.config.')) {
      if (viteConfigHasTestAttribute(configPath)) {
        return configPath;
      }
    } else if (configFile === 'package.json' && frameworkName === 'jest') {
      if (packageJsonHasJestConfig(configPath)) {
        return configPath;
      }
    } else {
      return configPath;
    }
  }

  return undefined;
}

export function resolveAndValidateCustomConfig(
  configKey: string,
  filePath: string,
): string | undefined {
  const customConfigPath = vscode.workspace
    .getConfiguration()
    .get(configKey) as string | Record<string, string> | undefined;

  const resolvedConfigPath = resolveConfigPathOrMapping(
    customConfigPath,
    filePath,
  );
  if (!resolvedConfigPath) return undefined;

  const basePath = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(filePath),
  )?.uri.fsPath;
  if (!basePath) return undefined;

  const fullConfigPath = resolve(basePath, resolvedConfigPath);
  if (!existsSync(fullConfigPath)) return undefined;

  return fullConfigPath;
}

export function getDefaultTestPatterns(): string[] {
  const patterns = Settings.getDefaultTestPatterns();
  return patterns && patterns.length > 0 ? patterns : DEFAULT_TEST_PATTERNS;
}
