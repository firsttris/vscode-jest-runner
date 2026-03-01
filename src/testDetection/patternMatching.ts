import { relative, resolve } from 'node:path';
import { isMatch } from 'micromatch';
import { getTestMatchFromJestConfig } from './configParsers/jestParser';
import { getVitestConfig } from './configParsers/vitestParser';
import { getDefaultTestPatterns } from './configParsing';
import { TestPatterns } from './frameworkDefinitions';

function matchesExcludePatterns(
  filePath: string,
  relativePath: string,
  ignorePatterns?: string[],
  excludePatterns?: string[],
): boolean {
  const absolutePath = filePath.replace(/\\/g, '/');

  if (ignorePatterns && ignorePatterns.length > 0) {
    for (const pattern of ignorePatterns) {
      if (typeof pattern !== 'string' || pattern.length === 0) {
        continue;
      }
      try {
        const normalizedPattern = pattern.replace(/<rootDir>/gi, '');
        const regex = new RegExp(normalizedPattern);
        if (regex.test(absolutePath)) {
          return true;
        }
      } catch {}
    }
  }

  if (excludePatterns && excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      if (typeof pattern !== 'string' || pattern.length === 0) {
        continue;
      }
      if (isMatch(relativePath, pattern, { nocase: true, extended: true })) {
        return true;
      }
    }
  }

  return false;
}

function resolveRootDirToken(
  pattern: string,
  rootDir: string | undefined,
): string {
  const resolved = pattern.replace(/<rootDir>/gi, rootDir || '');
  if (rootDir && resolved.startsWith(rootDir)) {
    return resolved;
  }
  return resolved.replace(/^\/+/, '');
}

export function fileMatchesPatternsExplicit(
  filePath: string,
  configDir: string,
  patterns: string[],
  isRegex: boolean,
  rootDir: string | undefined,
  ignorePatterns?: string[],
  excludePatterns?: string[],
  roots?: string[],
): boolean {
  const baseDir = rootDir ? resolve(configDir, rootDir) : configDir;
  const relativePath = relative(baseDir, filePath).replace(/\\/g, '/');
  const pathToMatch = isRegex ? filePath.replace(/\\/g, '/') : relativePath;

  if (
    matchesExcludePatterns(
      filePath,
      relativePath,
      ignorePatterns,
      excludePatterns,
    )
  ) {
    return false;
  }

  if (roots && roots.length > 0) {
    const absolutePath = resolve(filePath).replace(/\\/g, '/');
    const isInRoots = roots.some((root) => {
      const resolvedRoot = resolve(
        baseDir,
        resolveRootDirToken(root, rootDir),
      ).replace(/\\/g, '/');
      return absolutePath.startsWith(resolvedRoot);
    });
    if (!isInRoots) {
      return false;
    }
  }

  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      continue;
    }

    if (isRegex) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(pathToMatch)) {
          return true;
        }
      } catch {}
    } else {
      const normalizedPattern = resolveRootDirToken(pattern, rootDir);
      if (
        isMatch(pathToMatch, normalizedPattern, {
          nocase: true,
          extended: true,
        })
      ) {
        return true;
      }
    }
  }

  return false;
}

export function fileMatchesPatterns(
  filePath: string,
  configDir: string,
  patterns: string[] | undefined,
  isRegex: boolean,
  rootDir: string | undefined,
  ignorePatterns?: string[],
  excludePatterns?: string[],
  roots?: string[],
): boolean {
  if (!patterns || patterns.length === 0) {
    return fileMatchesPatternsExplicit(
      filePath,
      configDir,
      getDefaultTestPatterns(),
      false,
      rootDir,
      ignorePatterns,
      excludePatterns,
      roots,
    );
  }

  return fileMatchesPatternsExplicit(
    filePath,
    configDir,
    patterns,
    isRegex,
    rootDir,
    ignorePatterns,
    excludePatterns,
    roots,
  );
}

function checkConfigMatches(
  filePath: string,
  directoryPath: string,
  configs: TestPatterns[] | undefined,
  framework: 'jest' | 'vitest',
): boolean {
  if (!configs || configs.length === 0) return false;

  return configs.some((config) => {
    if (!config.patterns || config.patterns.length === 0) return false;

    return fileMatchesPatternsExplicit(
      filePath,
      directoryPath,
      config.patterns,
      framework === 'jest' ? (config.isRegex ?? false) : false,
      config.rootDir,
      framework === 'jest' ? config.ignorePatterns : undefined,
      framework === 'vitest' ? config.excludePatterns : undefined,
      config.roots,
    );
  });
}

export function detectFrameworkByPatternMatch(
  directoryPath: string,
  filePath: string,
  jestConfigPath: string,
  vitestConfigPath: string,
): 'jest' | 'vitest' | undefined {
  const jestConfigs = getTestMatchFromJestConfig(jestConfigPath);
  const vitestConfigs = getVitestConfig(vitestConfigPath);

  const jestHasExplicitPatterns = jestConfigs && jestConfigs.length > 0;
  const vitestHasExplicitPatterns = vitestConfigs && vitestConfigs.length > 0;

  const jestMatches = checkConfigMatches(
    filePath,
    directoryPath,
    jestConfigs,
    'jest',
  );
  const vitestMatches = checkConfigMatches(
    filePath,
    directoryPath,
    vitestConfigs,
    'vitest',
  );

  if (jestHasExplicitPatterns && vitestHasExplicitPatterns) {
    if (jestMatches && !vitestMatches) return 'jest';
    if (vitestMatches && !jestMatches) return 'vitest';
    return undefined;
  }

  if (jestHasExplicitPatterns) {
    if (jestMatches) return 'jest';
    return 'vitest';
  }

  if (vitestHasExplicitPatterns) {
    if (vitestMatches) return 'vitest';
    return 'jest';
  }

  return undefined;
}
