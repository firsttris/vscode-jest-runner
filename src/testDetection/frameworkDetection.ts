import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logError, logDebug } from '../util';
import {
  TestFrameworkName,
  testFrameworks,
  FrameworkResult,
  SearchOutcome,
} from './frameworkDefinitions';
import { cacheManager } from '../cache/CacheManager';
import {
  binaryExists,
  getConfigPath,
  resolveAndValidateCustomConfig,
} from './configParsing';
import { detectFrameworkByPatternMatch } from './patternMatching';

/**
 * Check if a file uses Node.js built-in test runner (node:test)
 * Automatically detects based on import statements in the file
 */
export function isNodeTestFile(filePath: string): boolean {
  // Check cache first
  const cached = cacheManager.getFileFramework(filePath);
  if (cached !== undefined) {
    return cached?.framework === 'node-test';
  }

  try {
    if (!existsSync(filePath)) {
      // If file doesn't exist, we can't be sure it's not a test file in general,
      // but strictly for node-test it's false. 
      // We don't cache 'null' indiscriminately here to avoid side effects on other frameworks.
      return false;
    }

    const content = readFileSync(filePath, 'utf-8');
    // Check for node:test import patterns:
    // - import { test } from 'node:test'
    // - import test from 'node:test'
    // - const { test } = require('node:test')
    // - require('node:test')
    const isNodeTest =
      /from\s+['"]node:test['"]/.test(content) ||
      /require\s*\(\s*['"]node:test['"]\s*\)/.test(content);

    if (isNodeTest) {
      // We do NOT cache here because pattern matching checks haven't run yet.
      // The TestFileCache will handle caching valid test files.
    }

    return isNodeTest;
  } catch (error) {
    logError(`Error checking for node:test in ${filePath}`, error);
    return false;
  }
}

/**
 * Clear the node-test file cache (useful when settings change)
 */
/**
 * Clear the node-test file cache (useful when settings change)
 */
export function clearNodeTestCache(): void {
  cacheManager.invalidateAll();
}

/**
 * Invalidate the node-test cache for a specific file
 */
export function invalidateNodeTestCache(filePath: string): void {
  cacheManager.invalidate(filePath);
}

function isFrameworkUsedIn(
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

        if (
          packageJson.dependencies?.[frameworkName] ||
          packageJson.devDependencies?.[frameworkName] ||
          packageJson.peerDependencies?.[frameworkName] ||
          packageJson[frameworkName]
        ) {
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

export function isJestUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'jest');
}

export function isVitestUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'vitest');
}

export function detectTestFramework(
  directoryPath: string,
  filePath?: string,
): TestFrameworkName | undefined {
  // Check for node:test first if file path is provided
  if (filePath && isNodeTestFile(filePath)) {
    return 'node-test';
  }

  const jestConfigPath = getConfigPath(directoryPath, 'jest');
  const vitestConfigPath = getConfigPath(directoryPath, 'vitest');

  if (jestConfigPath && vitestConfigPath && filePath) {
    const frameworkByPattern = detectFrameworkByPatternMatch(directoryPath, filePath, jestConfigPath, vitestConfigPath);
    if (frameworkByPattern) {
      return frameworkByPattern;
    }
  }

  if (jestConfigPath && !vitestConfigPath) {
    return 'jest';
  }
  if (vitestConfigPath && !jestConfigPath) {
    return 'vitest';
  }
  if (jestConfigPath && vitestConfigPath) {
    return 'jest';
  }

  const packageJsonPath = join(directoryPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      for (const framework of testFrameworks) {
        if (
          packageJson.dependencies?.[framework.name] ||
          packageJson.devDependencies?.[framework.name] ||
          packageJson.peerDependencies?.[framework.name] ||
          packageJson[framework.name]
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
  targetFramework?: 'jest' | 'vitest'
): boolean => !targetFramework || framework === targetFramework;

export const getParentDirectories = (startDir: string, rootPath: string): string[] => {
  if (!startDir.startsWith(rootPath)) return [];
  const parentDir = dirname(startDir);
  return parentDir === startDir
    ? [startDir]
    : [startDir, ...getParentDirectories(parentDir, rootPath)];
};

const resolveCustomConfigs = (
  filePath: string,
  rootPath: string,
  targetFramework?: 'jest' | 'vitest'
): FrameworkResult | undefined => {
  const customJestConfig = resolveAndValidateCustomConfig('jestrunner.configPath', filePath);
  const customVitestConfig = resolveAndValidateCustomConfig('jestrunner.vitestConfigPath', filePath);

  if (!customJestConfig && !customVitestConfig) return undefined;

  if (customJestConfig && customVitestConfig) {
    const frameworkByPattern = detectFrameworkByPatternMatch(
      rootPath,
      filePath,
      customJestConfig,
      customVitestConfig
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
  targetFramework?: 'jest' | 'vitest'
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

const detectFrameworkByDependency = (
  rootPath: string,
  targetFramework?: 'jest' | 'vitest'
): FrameworkResult | undefined => {
  const checks: Array<{ framework: TestFrameworkName; isUsed: () => boolean }> = targetFramework
    ? [{ framework: targetFramework, isUsed: () => (targetFramework === 'jest' ? isJestUsedIn : isVitestUsedIn)(rootPath) }]
    : [
      { framework: 'vitest', isUsed: () => isVitestUsedIn(rootPath) },
      { framework: 'jest', isUsed: () => isJestUsedIn(rootPath) },
    ];

  const found = checks.find((check) => check.isUsed());
  return found ? { directory: rootPath, framework: found.framework } : undefined;
};

export function findTestFrameworkDirectory(
  filePath: string,
  targetFramework?: 'jest' | 'vitest'
): FrameworkResult | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  if (!workspaceFolder) return undefined;

  const rootPath = workspaceFolder.uri.fsPath;

  // Check for node:test first - it takes priority based on file content
  const isNodeTest = isNodeTestFile(filePath);
  logDebug(`findTestFrameworkDirectory: filePath=${filePath}, targetFramework=${targetFramework}, isNodeTest=${isNodeTest}`);
  if (!targetFramework && isNodeTest) {
    logDebug(`Detected node:test for ${filePath}`);
    return { directory: dirname(filePath), framework: 'node-test' };
  }

  const customResult = resolveCustomConfigs(filePath, rootPath, targetFramework);
  if (customResult) return customResult;

  const parentDirResult = findFrameworkInParentDirs(filePath, rootPath, targetFramework);
  if (parentDirResult.status === 'found') return parentDirResult.result;
  if (parentDirResult.status === 'wrong_framework') return undefined;

  return detectFrameworkByDependency(rootPath, targetFramework);
}

export function findJestDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'jest');
  return result?.directory;
}

export function findVitestDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'vitest');
  return result?.directory;
}
