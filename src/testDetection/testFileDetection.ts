import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logDebug } from '../util';
import {
  TestFrameworkName,
  TestPatternResult,
  DEFAULT_TEST_PATTERNS,
  testFrameworks,
} from './frameworkDefinitions';
import {
  getTestMatchFromJestConfig,
  getIncludeFromVitestConfig,
  resolveAndValidateCustomConfig,
} from './configParsing';
import { fileMatchesPatterns, detectFrameworkByPatternMatch } from './patternMatching';
import {
  detectTestFramework,
  findTestFrameworkDirectory,
  findJestDirectory,
  findVitestDirectory,
  getParentDirectories,
} from './frameworkDetection';

const createDefaultResult = (configDir: string): TestPatternResult => ({
  patterns: DEFAULT_TEST_PATTERNS,
  configDir,
  isRegex: false,
});

const resolveJestResult = (
  result: { patterns: string[]; rootDir?: string; isRegex: boolean } | undefined,
  configPath: string,
  defaultConfigDir: string
): TestPatternResult => {
  const configDir = result?.rootDir
    ? path.resolve(path.dirname(configPath), result.rootDir)
    : defaultConfigDir;

  if (result?.rootDir) {
    logDebug(`Resolved rootDir for Jest: ${configDir}`);
  }

  return {
    patterns: result?.patterns ?? DEFAULT_TEST_PATTERNS,
    configDir,
    isRegex: result?.isRegex ?? false,
  };
};

const resolveDualConfigPatterns = (
  rootPath: string,
  filePath: string,
  jestConfigPath: string,
  vitestConfigPath: string
): TestPatternResult => {
  const frameworkByPattern = detectFrameworkByPatternMatch(rootPath, filePath, jestConfigPath, vitestConfigPath);

  if (frameworkByPattern === 'vitest') {
    const patterns = getIncludeFromVitestConfig(vitestConfigPath);
    return { patterns: patterns ?? DEFAULT_TEST_PATTERNS, configDir: rootPath, isRegex: false };
  }

  if (frameworkByPattern === 'jest') {
    return resolveJestResult(getTestMatchFromJestConfig(jestConfigPath), jestConfigPath, rootPath);
  }

  const jestResult = getTestMatchFromJestConfig(jestConfigPath);
  const vitestPatterns = getIncludeFromVitestConfig(vitestConfigPath);
  const combinedPatterns = [...(jestResult?.patterns ?? []), ...(vitestPatterns ?? [])];

  return {
    patterns: combinedPatterns.length > 0 ? combinedPatterns : DEFAULT_TEST_PATTERNS,
    configDir: rootPath,
    isRegex: false,
  };
};

const findFirstValidConfig = <T>(
  configPaths: string[],
  getConfig: (configPath: string) => T | undefined
): { configPath: string; config: T } | undefined => {
  if (configPaths.length === 0) return undefined;

  const [configPath, ...rest] = configPaths;
  if (!fs.existsSync(configPath)) return findFirstValidConfig(rest, getConfig);

  const config = getConfig(configPath);
  return config ? { configPath, config } : findFirstValidConfig(rest, getConfig);
};

const findJestConfigInDir = (dir: string): TestPatternResult => {
  const jestFramework = testFrameworks.find((f) => f.name === 'jest')!;
  const configPaths = [...jestFramework.configFiles, 'package.json'].map((f) => path.join(dir, f));

  const found = findFirstValidConfig(configPaths, getTestMatchFromJestConfig);
  if (!found) return createDefaultResult(dir);

  const configDir = found.config.rootDir ? path.resolve(dir, found.config.rootDir) : dir;
  if (found.config.rootDir) {
    logDebug(`Resolved rootDir for Jest: ${configDir}`);
  }

  return { patterns: found.config.patterns, configDir, isRegex: found.config.isRegex };
};

const findVitestConfigInDir = (dir: string): TestPatternResult => {
  const vitestFramework = testFrameworks.find((f) => f.name === 'vitest')!;
  const configPaths = vitestFramework.configFiles.map((f) => path.join(dir, f));

  const found = findFirstValidConfig(configPaths, getIncludeFromVitestConfig);
  return found ? { patterns: found.config, configDir: dir, isRegex: false } : createDefaultResult(dir);
};

const detectPatternsInParentDirs = (
  filePath: string,
  rootPath: string
): TestPatternResult | undefined => {
  const search = (dirs: string[]): TestPatternResult | undefined => {
    if (dirs.length === 0) return undefined;

    const [dir, ...rest] = dirs;
    const framework = detectTestFramework(dir, filePath);

    if (framework === 'jest') return findJestConfigInDir(dir);
    if (framework === 'vitest') return findVitestConfigInDir(dir);

    return search(rest);
  };

  return search(getParentDirectories(path.dirname(filePath), rootPath));
};

function getTestFilePatternsForFile(filePath: string): TestPatternResult {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  if (!workspaceFolder) {
    return createDefaultResult(path.dirname(filePath));
  }

  const rootPath = workspaceFolder.uri.fsPath;
  const jestConfigPath = resolveAndValidateCustomConfig('jestrunner.configPath', filePath);
  const vitestConfigPath = resolveAndValidateCustomConfig('jestrunner.vitestConfigPath', filePath);

  if (jestConfigPath && vitestConfigPath) {
    return resolveDualConfigPatterns(rootPath, filePath, jestConfigPath, vitestConfigPath);
  }

  if (jestConfigPath) {
    return resolveJestResult(getTestMatchFromJestConfig(jestConfigPath), jestConfigPath, rootPath);
  }

  if (vitestConfigPath) {
    const patterns = getIncludeFromVitestConfig(vitestConfigPath);
    return { patterns: patterns ?? DEFAULT_TEST_PATTERNS, configDir: rootPath, isRegex: false };
  }

  return detectPatternsInParentDirs(filePath, rootPath) ?? createDefaultResult(rootPath);
}

export function matchesTestFilePattern(filePath: string): boolean {
  const { patterns, configDir, isRegex } = getTestFilePatternsForFile(filePath);

  logDebug(`Matching file: ${filePath}`);
  logDebug(`Using patterns: ${patterns.join(', ')} (isRegex: ${isRegex})`);
  logDebug(`Config dir: ${configDir}`);

  return fileMatchesPatterns(filePath, configDir, patterns, isRegex, undefined);
}

export function isJestTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasJestDir = !!findJestDirectory(filePath);
  const hasCustomConfig = !!resolveAndValidateCustomConfig('jestrunner.configPath', filePath);

  return hasJestDir || hasCustomConfig;
}

export function isVitestTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasVitestDir = !!findVitestDirectory(filePath);
  const hasCustomConfig = !!resolveAndValidateCustomConfig('jestrunner.vitestConfigPath', filePath);

  return hasVitestDir || hasCustomConfig;
}

export function isTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasFrameworkDir = !!findTestFrameworkDirectory(filePath);
  const hasCustomConfig =
    !!resolveAndValidateCustomConfig('jestrunner.configPath', filePath) ||
    !!resolveAndValidateCustomConfig('jestrunner.vitestConfigPath', filePath);

  return hasFrameworkDir || hasCustomConfig;
}

export function getTestFrameworkForFile(
  filePath: string,
): TestFrameworkName | undefined {
  const result = findTestFrameworkDirectory(filePath);
  return result?.framework;
}
