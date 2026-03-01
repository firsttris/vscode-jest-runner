import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
import { logDebug, logError } from '../utils/Logger';
import { normalizePath } from '../utils/PathUtils';
import { isPlaywrightDisabled } from '../config/Settings';

export function isNodeTestFile(filePath: string): boolean {
  const cached = cacheManager.getFileFramework(filePath);
  if (cached !== undefined) {
    return cached?.framework === 'node-test';
  }

  try {
    if (!existsSync(filePath)) {
      return false;
    }

    const content = readFileSync(filePath, 'utf-8');
    const isNodeTest =
      /from\s+['"]node:test['"]/.test(content) ||
      /require\s*\(\s*['"]node:test['"]\s*\)/.test(content);

    return isNodeTest;
  } catch (error) {
    logError(`Error checking for node:test in ${filePath}`, error);
    return false;
  }
}

export function isBunTestFile(filePath: string): boolean {
  return hasImport(filePath, 'bun:test');
}

export function isDenoTestFile(filePath: string): boolean {
  const cached = cacheManager.getFileFramework(filePath);
  if (cached !== undefined) {
    return cached?.framework === 'deno';
  }

  try {
    if (!existsSync(filePath)) return false;
    const content = readFileSync(filePath, 'utf-8');
    return (
      /Deno\.test/.test(content) ||
      /from\s+['"]jsr:@std\/expect['"]/.test(content) ||
      /from\s+['"]@std\/assert['"]/.test(content) ||
      /from\s+['"]jsr:@std\/assert['"]/.test(content) ||
      /from\s+['"]https:\/\/deno\.land\//.test(content)
    );
  } catch (error) {
    logError(`Error checking for Deno.test in ${filePath}`, error);
    return false;
  }
}

export function isPlaywrightTestFile(filePath: string): boolean {
  return hasImport(filePath, '@playwright/test');
}

const rstestImportRegex =
  /from\s+['"](?:@rstest\/core|rstest)['"]|require\s*\(\s*['"](?:@rstest\/core|rstest)['"]\s*\)/;

export function isRstestTestFile(filePath: string): boolean {
  const cached = cacheManager.getFileFramework(filePath);
  if (cached !== undefined) {
    return cached?.framework === 'rstest';
  }

  try {
    if (!existsSync(filePath)) {
      return false;
    }

    const content = readFileSync(filePath, 'utf-8');
    return rstestImportRegex.test(content);
  } catch (error) {
    logError(`Error checking for rstest in ${filePath}`, error);
    return false;
  }
}

export const isRstestFile = isRstestTestFile;

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

function hasImport(filePath: string, moduleName: string): boolean {
  const cached = cacheManager.getFileFramework(filePath);
  if (cached !== undefined) {
    return (
      cached?.framework ===
      (moduleName === 'bun:test'
        ? 'bun'
        : moduleName === '@playwright/test'
          ? 'playwright'
          : 'node-test')
    );
  }

  try {
    if (!existsSync(filePath)) return false;

    const content = readFileSync(filePath, 'utf-8');
    const regex = new RegExp(
      `from\\s+['"]${moduleName}['"]|require\\s*\\(\\s*['"]${moduleName}['"]\\s*\\)`,
    );
    return regex.test(content);
  } catch (error) {
    logError(`Error checking for ${moduleName} in ${filePath}`, error);
    return false;
  }
}

export function clearNodeTestCache(): void {
  cacheManager.invalidateAll();
}

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

export function isJestUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'jest');
}

export function isVitestUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'vitest');
}

export function isPlaywrightUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'playwright');
}

export function isRstestUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'rstest');
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
          { framework: 'vitest', isUsed: () => isVitestUsedIn(rootPath) },
          { framework: 'jest', isUsed: () => isJestUsedIn(rootPath) },
          { framework: 'bun', isUsed: () => isBunUsedIn(rootPath) },
          { framework: 'deno', isUsed: () => isDenoUsedIn(rootPath) },
          {
            framework: 'playwright',
            isUsed: () => isPlaywrightUsedIn(rootPath),
          },
          { framework: 'rstest', isUsed: () => isRstestUsedIn(rootPath) },
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
    return { directory: dirname(filePath), framework: 'rstest' };
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

export function findJestDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'jest');
  return result?.directory;
}

export function findVitestDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'vitest');
  return result?.directory;
}

export function findPlaywrightDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath);
  return result?.framework === 'playwright' ? result.directory : undefined;
}

export function isBunUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'bun');
}

export function isDenoUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'deno');
}

export function findBunDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'bun');
  return result?.directory;
}

export function findDenoDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'deno');
  return result?.directory;
}

export function findRstestDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'rstest');
  return result?.directory;
}
