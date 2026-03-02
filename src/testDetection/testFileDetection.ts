import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { isMatch } from 'micromatch';
import {
  TestFrameworkName,
  TestPatternResult,
  testFrameworks,
  allTestFrameworks,
  TestPatterns,
} from './frameworkDefinitions';
import {
  getConfigPath,
  resolveAndValidateCustomConfig,
  getDefaultTestPatterns,
} from './configParsing';
import { getTestMatchFromJestConfig } from './configParsers/jestParser';
import { getVitestConfig } from './configParsers/vitestParser';
import { getDenoConfig } from './configParsers/denoParser';
import {
  getPlaywrightTestDir,
  getPlaywrightConfig,
} from './configParsers/playwrightParser';
import { getCypressSpecPattern } from './configParsers/cypressParser';
import {
  fileMatchesPatterns,
  detectFrameworkByPatternMatch,
} from './patternMatching';
import {
  detectTestFramework,
  findTestFrameworkDirectory,
  findJestDirectory,
  findVitestDirectory,
  getParentDirectories,
} from './frameworkDetection';
import { logDebug } from '../utils/Logger';

const createDefaultResult = (configDir: string): TestPatternResult => ({
  patterns: getDefaultTestPatterns(),
  configDir,
  isRegex: false,
});

export function hasConflictingTestFramework(
  filePath: string,
  currentFramework: TestFrameworkName,
): boolean {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(filePath),
  );
  if (!workspaceFolder) return false;

  const rootPath = workspaceFolder.uri.fsPath;
  const dirs = getParentDirectories(dirname(filePath), rootPath);

  for (const dir of dirs) {
    for (const framework of allTestFrameworks) {
      if (framework.name === currentFramework) continue;
      const configPath = getConfigPath(
        dir,
        framework.name as TestFrameworkName,
      );
      if (!configPath) continue;

      if (framework.name === 'playwright') {
        const testDir = getPlaywrightTestDir(configPath);
        if (testDir) {
          const testDirPath = resolve(dir, testDir);
          const relativePath = relative(testDirPath, filePath).replace(
            /\\/g,
            '/',
          );
          if (!relativePath.startsWith('../')) {
            return true;
          }
        }
      } else if (framework.name === 'cypress') {
        const specPatterns = getCypressSpecPattern(configPath);
        if (specPatterns) {
          for (const pattern of specPatterns) {
            const relativePath = relative(dir, filePath).replace(/\\/g, '/');
            if (
              isMatch(relativePath, pattern, { nocase: true, extended: true })
            ) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

const resolveJestResult = (
  results: TestPatterns[] | undefined,
  configPath: string,
  defaultConfigDir: string,
): TestPatternResult[] => {
  if (!results || results.length === 0) {
    return [createDefaultResult(defaultConfigDir)];
  }

  return results.map((result) => {
    const configDir = result.rootDir
      ? resolve(dirname(configPath), result.rootDir)
      : defaultConfigDir;

    return {
      patterns:
        result.patterns && result.patterns.length > 0
          ? result.patterns
          : getDefaultTestPatterns(),
      configDir,
      isRegex: result.isRegex ?? false,
      roots: result.roots,
      ignorePatterns: result.ignorePatterns,
      excludePatterns: undefined,
    };
  });
};

const resolveVitestResult = (
  results: TestPatterns[] | undefined,
  configPath: string,
  defaultConfigDir: string,
): TestPatternResult[] => {
  if (!results || results.length === 0) {
    return [createDefaultResult(defaultConfigDir)];
  }

  return results.map((result) => {
    const configDir = result.rootDir
      ? resolve(dirname(configPath), result.rootDir)
      : result.dir
        ? resolve(defaultConfigDir, result.dir)
        : defaultConfigDir;

    return {
      patterns:
        result.patterns && result.patterns.length > 0
          ? result.patterns
          : getDefaultTestPatterns(),
      configDir,
      isRegex: false,
      excludePatterns: result.excludePatterns,
      roots: undefined,
      ignorePatterns: undefined,
    };
  });
};

const resolveDualConfigPatterns = (
  rootPath: string,
  filePath: string,
  jestConfigPath: string,
  vitestConfigPath: string,
): TestPatternResult[] => {
  const frameworkByPattern = detectFrameworkByPatternMatch(
    rootPath,
    filePath,
    jestConfigPath,
    vitestConfigPath,
  );

  if (frameworkByPattern === 'vitest') {
    return resolveVitestResult(
      getVitestConfig(vitestConfigPath),
      vitestConfigPath,
      rootPath,
    );
  }

  if (frameworkByPattern === 'jest') {
    return resolveJestResult(
      getTestMatchFromJestConfig(jestConfigPath),
      jestConfigPath,
      rootPath,
    );
  }

  const jestResults = resolveJestResult(
    getTestMatchFromJestConfig(jestConfigPath),
    jestConfigPath,
    rootPath,
  );
  const vitestResults = resolveVitestResult(
    getVitestConfig(vitestConfigPath),
    vitestConfigPath,
    rootPath,
  );

  return [...jestResults, ...vitestResults];
};

const findFirstValidConfig = <T>(
  configPaths: string[],
  getConfig: (configPath: string) => T | undefined,
): { configPath: string; config: T } | undefined => {
  if (configPaths.length === 0) return undefined;

  const [configPath, ...rest] = configPaths;
  if (!existsSync(configPath)) return findFirstValidConfig(rest, getConfig);

  const config = getConfig(configPath);
  return config
    ? { configPath, config }
    : findFirstValidConfig(rest, getConfig);
};

const findJestConfigInDir = (dir: string): TestPatternResult[] => {
  const jestFramework = testFrameworks.find((f) => f.name === 'jest')!;
  const configPaths = [...jestFramework.configFiles, 'package.json'].map((f) =>
    join(dir, f),
  );

  const found = findFirstValidConfig(configPaths, getTestMatchFromJestConfig);
  if (!found) return [createDefaultResult(dir)];

  return resolveJestResult(found.config, found.configPath, dir);
};

const findVitestConfigInDir = (dir: string): TestPatternResult[] => {
  const vitestFramework = testFrameworks.find((f) => f.name === 'vitest')!;
  const configPaths = vitestFramework.configFiles.map((f) => join(dir, f));

  const found = findFirstValidConfig(configPaths, getVitestConfig);
  if (!found) return [createDefaultResult(dir)];

  return resolveVitestResult(found.config, found.configPath, dir);
};

const findDenoConfigInDir = (dir: string): TestPatternResult[] => {
  const denoFramework = testFrameworks.find((f) => f.name === 'deno')!;
  const configPaths = denoFramework.configFiles.map((f) => join(dir, f));

  const found = findFirstValidConfig(configPaths, getDenoConfig);
  if (!found) return [createDefaultResult(dir)];

  return [
    {
      patterns:
        found.config.patterns.length > 0
          ? found.config.patterns
          : getDefaultTestPatterns(),
      configDir: dir,
      isRegex: false,
      excludePatterns: found.config.excludePatterns,
    },
  ];
};

const findPlaywrightConfigInDir = (dir: string): TestPatternResult[] => {
  const customConfigPath = resolveAndValidateCustomConfig(
    'jestrunner.playwrightConfigPath',
    join(dir, 'dummy'),
  );
  const playwrightFramework = testFrameworks.find(
    (f) => f.name === 'playwright',
  )!;

  const configPaths = customConfigPath
    ? [customConfigPath]
    : playwrightFramework.configFiles.map((f) => join(dir, f));

  const found = findFirstValidConfig(configPaths, getPlaywrightConfig);
  if (!found || !found.config || found.config.length === 0)
    return [createDefaultResult(dir)];

  return found.config.map((config) => ({
    patterns:
      config.patterns.length > 0 ? config.patterns : getDefaultTestPatterns(),
    configDir: dir,
    isRegex: config.isRegex ?? false,
    ignorePatterns: config.ignorePatterns,
    excludePatterns: undefined,
  }));
};

const detectPatternsInParentDirs = (
  filePath: string,
  rootPath: string,
): TestPatternResult[] | undefined => {
  const search = (dirs: string[]): TestPatternResult[] | undefined => {
    if (dirs.length === 0) return undefined;

    const [dir, ...rest] = dirs;
    const framework = detectTestFramework(dir, filePath);

    if (framework === 'jest') return findJestConfigInDir(dir);
    if (framework === 'vitest') return findVitestConfigInDir(dir);
    if (framework === 'deno') return findDenoConfigInDir(dir);
    if (framework === 'playwright') return findPlaywrightConfigInDir(dir);

    return search(rest);
  };

  return search(getParentDirectories(dirname(filePath), rootPath));
};

function getTestFilePatternsForFile(filePath: string): TestPatternResult[] {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(filePath),
  );
  if (!workspaceFolder) {
    return [createDefaultResult(dirname(filePath))];
  }

  const disableFrameworkConfig = vscode.workspace
    .getConfiguration('jestrunner')
    .get<boolean>('disableFrameworkConfig');
  if (disableFrameworkConfig) {
    logDebug('Framework config disabled via setting, using default patterns');
    return [createDefaultResult(workspaceFolder.uri.fsPath)];
  }

  const rootPath = workspaceFolder.uri.fsPath;
  const jestConfigPath = resolveAndValidateCustomConfig(
    'jestrunner.configPath',
    filePath,
  );
  const vitestConfigPath = resolveAndValidateCustomConfig(
    'jestrunner.vitestConfigPath',
    filePath,
  );

  if (jestConfigPath && vitestConfigPath) {
    return resolveDualConfigPatterns(
      rootPath,
      filePath,
      jestConfigPath,
      vitestConfigPath,
    );
  }

  if (jestConfigPath) {
    logDebug(`Using Jest config for pattern detection: ${jestConfigPath}`);
    return resolveJestResult(
      getTestMatchFromJestConfig(jestConfigPath),
      jestConfigPath,
      rootPath,
    );
  }

  if (vitestConfigPath) {
    logDebug(`Using Vitest config for pattern detection: ${vitestConfigPath}`);
    return resolveVitestResult(
      getVitestConfig(vitestConfigPath),
      vitestConfigPath,
      rootPath,
    );
  }

  const playwrightConfigPath = resolveAndValidateCustomConfig(
    'jestrunner.playwrightConfigPath',
    filePath,
  );
  if (playwrightConfigPath) {
    logDebug(
      `Using Playwright config for pattern detection: ${playwrightConfigPath}`,
    );
    const configs = getPlaywrightConfig(playwrightConfigPath);
    if (configs && configs.length > 0) {
      return configs.map((config) => ({
        patterns:
          config.patterns.length > 0
            ? config.patterns
            : getDefaultTestPatterns(),
        configDir: rootPath,
        isRegex: config.isRegex ?? false,
        ignorePatterns: config.ignorePatterns,
        excludePatterns: undefined,
      }));
    }
  }

  return (
    detectPatternsInParentDirs(filePath, rootPath) ?? [
      createDefaultResult(rootPath),
    ]
  );
}

export function matchesTestFilePattern(filePath: string): boolean {
  const results = getTestFilePatternsForFile(filePath);

  if (results.length === 0) {
    const defaultRes = createDefaultResult(dirname(filePath));
    const filePatternMatches = fileMatchesPatterns(
      filePath,
      defaultRes.configDir,
      defaultRes.patterns,
      defaultRes.isRegex,
      undefined,
      defaultRes.ignorePatterns,
      defaultRes.excludePatterns,
      defaultRes.roots,
    );
    logDebug(
      `File ${filePath} matches default pattern ${defaultRes.patterns}: ${filePatternMatches}`,
    );
    return filePatternMatches;
  }

  return results.some((res) => {
    const matches = fileMatchesPatterns(
      filePath,
      res.configDir,
      res.patterns,
      res.isRegex,
      undefined,
      res.ignorePatterns,
      res.excludePatterns,
      res.roots,
    );
    logDebug(`File ${filePath} matches pattern ${res.patterns}: ${matches}`);
    return matches;
  });
}

export function isJestTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasJestDir = !!findJestDirectory(filePath);
  const hasCustomConfig = !!resolveAndValidateCustomConfig(
    'jestrunner.configPath',
    filePath,
  );

  return hasJestDir || hasCustomConfig;
}

export function isVitestTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasVitestDir = !!findVitestDirectory(filePath);
  const hasCustomConfig = !!resolveAndValidateCustomConfig(
    'jestrunner.vitestConfigPath',
    filePath,
  );

  return hasVitestDir || hasCustomConfig;
}

export function isTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const frameworkResult = findTestFrameworkDirectory(filePath);
  if (!frameworkResult) {
    return false;
  }

  if (hasConflictingTestFramework(filePath, frameworkResult.framework)) {
    return false;
  }

  const hasFrameworkDir = !!frameworkResult;
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
