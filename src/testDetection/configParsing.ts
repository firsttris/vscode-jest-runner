import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import * as vscode from 'vscode';
import { TestPatterns, allTestFrameworks, DEFAULT_TEST_PATTERNS } from './frameworkDefinitions';
import { logDebug, logError } from '../utils/Logger';
import { resolveConfigPathOrMapping } from '../utils/PathUtils';
import * as Settings from '../config/Settings';

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

export function viteConfigHasTestAttribute(configPath: string): boolean {
  try {
    const content = readFileSync(configPath, 'utf8');
    return /\btest\s*[:=]/.test(content);
  } catch (error) {
    logError(`Error reading vite config file: ${configPath}`, error);
    return false;
  }
}

export function binaryExists(directoryPath: string, binaryName: string): boolean {
  const possibleBinaryPaths = [
    join(directoryPath, 'node_modules', '.bin', binaryName),
    join(directoryPath, 'node_modules', '.bin', `${binaryName}.cmd`),
    join(directoryPath, 'node_modules', binaryName, 'package.json'),
  ];
  return possibleBinaryPaths.some(existsSync);
}

export function getConfigPath(directoryPath: string, frameworkName: string): string | undefined {
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

function extractTestRegex(config: any): string[] | undefined {
  if (!config.testRegex) return undefined;

  if (typeof config.testRegex === 'string') {
    return [config.testRegex];
  }
  if (Array.isArray(config.testRegex)) {
    return config.testRegex;
  }
  return undefined;
}

function extractRoots(config: any): string[] | undefined {
  if (!config.roots) return undefined;
  if (Array.isArray(config.roots)) {
    return config.roots;
  }
  return undefined;
}

function extractTestPathIgnorePatterns(config: any): string[] | undefined {
  if (!config.testPathIgnorePatterns) return undefined;
  if (Array.isArray(config.testPathIgnorePatterns)) {
    return config.testPathIgnorePatterns;
  }
  return undefined;
}

function extractRootDir(content: string, configPath: string): string | undefined {
  const rootDirMatch = content.match(/['"]?rootDir['"]?\s*:\s*(['"]([^'"]+)['"]|__dirname)/);
  if (rootDirMatch) {
    const value = rootDirMatch[1];
    if (value === '__dirname') {
      return dirname(configPath);
    }
    return rootDirMatch[2];
  }
  return undefined;
}

const findMatchingBracket = (content: string, startIndex: number): number | undefined => {
  const search = (index: number, depth: number): number | undefined => {
    if (index >= content.length || depth === 0) {
      return depth === 0 ? index : undefined;
    }
    const char = content[index];
    const newDepth = char === '[' ? depth + 1 : char === ']' ? depth - 1 : depth;
    return search(index + 1, newDepth);
  };
  return search(startIndex + 1, 1);
};

const extractStringsFromArray = (arrayContent: string): string[] =>
  [...arrayContent.matchAll(/['"`]((?:\\.|[^'"`\\])*?)['"`]/g)].map((m) => m[1]);

const extractRootsFromText = (content: string): string[] | undefined => {
  const rootsMatch = content.match(/roots\s*:\s*\[/);
  if (!rootsMatch || rootsMatch.index === undefined) return undefined;

  const arrayStart = content.indexOf('[', rootsMatch.index);
  if (arrayStart === -1) return undefined;
  const arrayEnd = findMatchingBracket(content, arrayStart);
  if (!arrayEnd) return undefined;
  const arrayContent = content.substring(arrayStart + 1, arrayEnd - 1);
  const roots = extractStringsFromArray(arrayContent);
  return roots.length > 0 ? roots : undefined;
};

const extractTestPathIgnorePatternsFromText = (content: string): string[] | undefined => {
  const ignoreMatch = content.match(/testPathIgnorePatterns\s*:\s*\[/);
  if (!ignoreMatch || ignoreMatch.index === undefined) return undefined;

  const arrayStart = content.indexOf('[', ignoreMatch.index);
  if (arrayStart === -1) return undefined;
  const arrayEnd = findMatchingBracket(content, arrayStart);
  if (!arrayEnd) return undefined;
  const arrayContent = content.substring(arrayStart + 1, arrayEnd - 1);
  const patterns = extractStringsFromArray(arrayContent);
  return patterns.length > 0 ? patterns : undefined;
};

const parseJsonConfig = (
  content: string,
  configPath: string
): TestPatterns | undefined => {
  try {
    const config = configPath.endsWith('package.json')
      ? JSON.parse(content).jest
      : JSON.parse(content);

    if (!config) return undefined;
    const rootDir = config.rootDir;
    const roots = extractRoots(config);
    const ignorePatterns = extractTestPathIgnorePatterns(config);
    if (config.testMatch && Array.isArray(config.testMatch)) {
      return { patterns: config.testMatch, isRegex: false, rootDir, roots, ignorePatterns };
    }
    const regexPatterns = extractTestRegex(config);
    if (regexPatterns) {
      return { patterns: regexPatterns, isRegex: true, rootDir, roots, ignorePatterns };
    }
    if (roots || ignorePatterns) {
      return { patterns: [], isRegex: false, rootDir, roots, ignorePatterns };
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const parseTestMatchFromText = (
  content: string,
  configPath: string,
  rootDir: string | undefined
): TestPatterns | undefined => {
  const testMatchStart = content.indexOf('testMatch');
  if (testMatchStart === -1) return undefined;

  const arrayStart = content.indexOf('[', testMatchStart);
  if (arrayStart === -1) return undefined;

  const arrayEnd = findMatchingBracket(content, arrayStart);
  if (!arrayEnd) return undefined;

  const arrayContent = content.substring(arrayStart + 1, arrayEnd - 1);
  const patterns = extractStringsFromArray(arrayContent);

  if (patterns.length === 0) return undefined;

  return { patterns, isRegex: false, rootDir };
};

const parseTestRegexFromText = (
  content: string,
  configPath: string,
  rootDir: string | undefined
): TestPatterns | undefined => {
  const testRegexMatch = content.match(/['"]?testRegex['"]?\s*:\s*['"]([^'"]+)['"]/);
  if (!testRegexMatch) return undefined;
  const regex = testRegexMatch[1].replace(/\\\\/g, '\\');
  return { patterns: [regex], isRegex: true, rootDir };
};

const parseJsConfig = (
  content: string,
  configPath: string
): TestPatterns | undefined => {
  const rootDir = extractRootDir(content, configPath);
  const roots = extractRootsFromText(content);
  const ignorePatterns = extractTestPathIgnorePatternsFromText(content);
  const baseResult =
    parseTestMatchFromText(content, configPath, rootDir) ??
    parseTestRegexFromText(content, configPath, rootDir);

  if (baseResult) {
    return { ...baseResult, roots, ignorePatterns };
  }

  if (roots || ignorePatterns) {
    return { patterns: [], isRegex: false, rootDir, roots, ignorePatterns };
  }

  return undefined;
};

export function getTestMatchFromJestConfig(
  configPath: string
): TestPatterns | undefined {
  try {
    const content = readFileSync(configPath, 'utf8');

    if (configPath.endsWith('.json')) {
      const result = parseJsonConfig(content, configPath);
      if (result) {
        logDebug(`Parsed Jest config: ${configPath}. Result: ${JSON.stringify(result)}`);
      }
      return result;
    }

    const result = parseJsConfig(content, configPath);
    if (result) {
      logDebug(`Parsed Jest config (JS): ${configPath}. Result: ${JSON.stringify(result)}`);
    }
    return result;
  } catch (error) {
    logError(`Error reading Jest config file: ${configPath}`, error);
    return undefined;
  }
}

const findMatchingBrace = (content: string, startIndex: number): number | undefined => {
  const search = (index: number, depth: number): number | undefined => {
    if (index >= content.length) return undefined;
    if (depth === 0) return index;
    const char = content[index];
    const newDepth = char === '{' ? depth + 1 : char === '}' ? depth - 1 : depth;
    return search(index + 1, newDepth);
  };
  return search(startIndex, 1);
};

const extractTestBlockContent = (content: string): string | undefined => {
  const testBlockMatch = content.match(/test\s*:\s*\{/);
  if (!testBlockMatch || testBlockMatch.index === undefined) return undefined;

  const startIndex = testBlockMatch.index + testBlockMatch[0].length;
  const endIndex = findMatchingBrace(content, startIndex);

  return endIndex ? content.substring(startIndex, endIndex) : undefined;
};

const extractIncludePatterns = (
  testBlockContent: string,
  configPath: string
): string[] | undefined => {
  const includeStart = testBlockContent.indexOf('include');
  if (includeStart === -1) return undefined;
  const arrayStart = testBlockContent.indexOf('[', includeStart);
  if (arrayStart === -1) return undefined;
  const arrayEnd = findMatchingBracket(testBlockContent, arrayStart);
  if (!arrayEnd) return undefined;
  const arrayContent = testBlockContent.substring(arrayStart + 1, arrayEnd - 1);
  const patterns = extractStringsFromArray(arrayContent);
  if (patterns.length === 0) return undefined;
  return patterns;
};

const extractExcludePatterns = (
  testBlockContent: string,
): string[] | undefined => {
  const excludeStart = testBlockContent.indexOf('exclude');
  if (excludeStart === -1) return undefined;
  const arrayStart = testBlockContent.indexOf('[', excludeStart);
  if (arrayStart === -1) return undefined;
  const arrayEnd = findMatchingBracket(testBlockContent, arrayStart);
  if (!arrayEnd) return undefined;
  const arrayContent = testBlockContent.substring(arrayStart + 1, arrayEnd - 1);
  const patterns = extractStringsFromArray(arrayContent);
  if (patterns.length === 0) return undefined;
  return patterns;
};

const extractVitestRoot = (content: string): string | undefined => {
  const rootMatch = content.match(/['"]?root['"]?\s*:\s*['"]([^'"]+)['"]/);
  if (rootMatch) {
    return rootMatch[1];
  }
  return undefined;
};

const extractVitestDir = (
  testBlockContent: string,
  configPath: string
): string | undefined => {
  const dirMatch = testBlockContent.match(/['"]?dir['"]?\s*:\s*['"]([^'"]+)['"]/);
  if (dirMatch) {
    return dirMatch[1];
  }
  return undefined;
};

export function getVitestConfig(configPath: string): TestPatterns | undefined {
  try {
    const content = readFileSync(configPath, 'utf8');
    const testBlockContent = extractTestBlockContent(content);

    const rootDir = extractVitestRoot(content);
    const patterns = testBlockContent ? extractIncludePatterns(testBlockContent, configPath) : undefined;
    const excludePatterns = testBlockContent ? extractExcludePatterns(testBlockContent) : undefined;
    const dir = testBlockContent ? extractVitestDir(testBlockContent, configPath) : undefined;

    if (!patterns && !excludePatterns && !dir && !rootDir) {
      return undefined;
    }

    const result = {
      patterns: patterns ?? [],
      isRegex: false,
      rootDir,
      excludePatterns,
      dir,
    };
    logDebug(`Parsed Vitest config: ${configPath}. Result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    logError(`Error reading Vitest config file: ${configPath}`, error);
    return undefined;
  }
}

// Backwards compatibility - keep the old function name
export function getIncludeFromVitestConfig(configPath: string): string[] | undefined {
  const config = getVitestConfig(configPath);
  return config?.patterns && config.patterns.length > 0 ? config.patterns : undefined;
}

export function resolveAndValidateCustomConfig(
  configKey: string,
  filePath: string,
): string | undefined {
  const customConfigPath = vscode.workspace.getConfiguration().get(configKey) as string | Record<string, string> | undefined;

  const resolvedConfigPath = resolveConfigPathOrMapping(customConfigPath, filePath);
  if (!resolvedConfigPath) return undefined;

  const basePath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
  if (!basePath) return undefined;

  const fullConfigPath = resolve(basePath, resolvedConfigPath);
  if (!existsSync(fullConfigPath)) return undefined;

  return fullConfigPath;
}

export function getPlaywrightTestDir(configPath: string): string | undefined {
  try {
    const content = readFileSync(configPath, 'utf8');
    if (configPath.endsWith('.json')) {
      const config = JSON.parse(content);
      return config.testDir;
    }
    const testDirMatch = content.match(/['"]?testDir['"]?\s*:\s*(['"]([^'"]+)['"]|['"]?([^'"\s,]+)['"]?)/);
    if (testDirMatch) {
      return testDirMatch[2] || testDirMatch[3];
    }
    return undefined;
  } catch (error) {
    logError(`Error reading Playwright config file: ${configPath}`, error);
    return undefined;
  }
}

export function getCypressSpecPattern(configPath: string): string[] | undefined {
  try {
    const content = readFileSync(configPath, 'utf8');

    if (configPath.endsWith('.json')) {
      const config = JSON.parse(content);
      return config.e2e?.specPattern || config.specPattern;
    }

    const specPatternMatch = content.match(/['"]?specPattern['"]?\s*:\s*(['"]([^'"]+)['"]|\[([^\]]+)\])/);
    if (specPatternMatch) {
      const value = specPatternMatch[2] || specPatternMatch[3];
      if (value.startsWith('[')) {
        // Array
        return extractStringsFromArray(value);
      } else {
        return [value];
      }
    }

    const e2eMatch = content.match(/e2e\s*:\s*\{[^}]*['"]?specPattern['"]?\s*:\s*(['"]([^'"]+)['"]|\[([^\]]+)\])/);
    if (e2eMatch) {
      const value = e2eMatch[2] || e2eMatch[3];
      if (value.startsWith('[')) {
        return extractStringsFromArray(value);
      } else {
        return [value];
      }
    }

    return undefined;
  } catch (error) {
    logError(`Error reading Cypress config file: ${configPath}`, error);
    return undefined;
  }
}

export function parseCoverageDirectory(configPath: string, framework: 'jest' | 'vitest'): string | undefined {
  try {
    const content = readFileSync(configPath, 'utf-8');
    const configDir = dirname(configPath);

    const pattern =
      framework === 'vitest'
        ? /reportsDirectory\s*[=:]\s*["']([^"']+)["']/
        : /["']?coverageDirectory["']?\s*[=:]\s*["']([^"']+)["']/;

    const match = content.match(pattern);

    if (match) {
      const dir = match[1];

      if (framework === 'jest') {
        // For Jest, coverageDirectory is relative to rootDir
        const rootDirMatch = content.match(/["']?rootDir["']?\s*:\s*["']([^"']+)["']/);
        const rootDir = rootDirMatch ? rootDirMatch[1] : '.';
        const rootDirPath = isAbsolute(rootDir) ? rootDir : join(configDir, rootDir);
        return isAbsolute(dir) ? dir : join(rootDirPath, dir);
      } else {
        // For Vitest, reportsDirectory is relative to root
        const rootMatch = content.match(/root\s*[=:]\s*["']([^"']+)["']/);
        const root = rootMatch ? rootMatch[1] : '.';
        const rootPath = isAbsolute(root) ? root : join(configDir, root);
        return isAbsolute(dir) ? dir : join(rootPath, dir);
      }
    }
  } catch (error) {
    logError(`Could not parse ${framework} config: ${error}`);
  }
  return undefined;
}

export function getDefaultTestPatterns(): string[] {
  const patterns = Settings.getDefaultTestPatterns();
  return patterns && patterns.length > 0 ? patterns : DEFAULT_TEST_PATTERNS;
}
