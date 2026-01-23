import * as path from 'path';
import * as mm from 'micromatch';
import { logDebug } from '../util';
import { DEFAULT_TEST_PATTERNS } from './frameworkDefinitions';
import { getTestMatchFromJestConfig, getIncludeFromVitestConfig } from './configParsing';

/**
 * Matches a file against patterns WITHOUT using default patterns.
 * Used for framework detection where we need to distinguish between
 * "config has no patterns" and "config has patterns that don't match".
 */
export function fileMatchesPatternsExplicit(
  filePath: string,
  configDir: string,
  patterns: string[],
  isRegex: boolean,
  rootDir: string | undefined,
): boolean {
  const baseDir = rootDir ? path.resolve(configDir, rootDir) : configDir;
  const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
  const pathToMatch = isRegex ? filePath.replace(/\\/g, '/') : relativePath;

  for (const pattern of patterns) {
    if (isRegex) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(pathToMatch)) {
          return true;
        }
      } catch {
        // Invalid regex, skip
      }
    } else {
      const normalizedPattern = pattern.replace(/^<rootDir>\//i, '');
      if (mm.isMatch(pathToMatch, normalizedPattern, { nocase: true })) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Matches a file against patterns, using default patterns if none specified.
 * Used for general test file matching.
 */
export function fileMatchesPatterns(
  filePath: string,
  configDir: string,
  patterns: string[] | undefined,
  isRegex: boolean,
  rootDir: string | undefined,
): boolean {
  if (!patterns || patterns.length === 0) {
    return fileMatchesPatternsExplicit(filePath, configDir, DEFAULT_TEST_PATTERNS, false, rootDir);
  }

  return fileMatchesPatternsExplicit(filePath, configDir, patterns, isRegex, rootDir);
}

export function detectFrameworkByPatternMatch(
  directoryPath: string,
  filePath: string,
  jestConfigPath: string,
  vitestConfigPath: string,
): 'jest' | 'vitest' | undefined {
  const jestPatterns = getTestMatchFromJestConfig(jestConfigPath);
  const vitestPatterns = getIncludeFromVitestConfig(vitestConfigPath);

  const jestHasExplicitPatterns = jestPatterns && jestPatterns.patterns.length > 0;
  const vitestHasExplicitPatterns = vitestPatterns && vitestPatterns.length > 0;

  logDebug(`Pattern matching for ${filePath}: jestPatterns=${jestPatterns?.patterns?.join(',') ?? 'none'}, vitestPatterns=${vitestPatterns?.join(',') ?? 'none'}`);

  if (!jestHasExplicitPatterns && !vitestHasExplicitPatterns) {
    logDebug('Neither config has explicit patterns - cannot determine framework by pattern');
    return undefined;
  }

  const jestMatches = jestHasExplicitPatterns
    ? fileMatchesPatternsExplicit(filePath, directoryPath, jestPatterns.patterns, jestPatterns.isRegex, jestPatterns.rootDir)
    : false;
  const vitestMatches = vitestHasExplicitPatterns
    ? fileMatchesPatternsExplicit(filePath, directoryPath, vitestPatterns, false, undefined)
    : false;

  logDebug(`Pattern matching results: jest=${jestMatches} (explicit: ${jestHasExplicitPatterns}), vitest=${vitestMatches} (explicit: ${vitestHasExplicitPatterns})`);

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
