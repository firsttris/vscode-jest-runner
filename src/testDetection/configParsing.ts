import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logError, logDebug, resolveConfigPathOrMapping } from '../util';
import { TestPatterns, testFrameworks, allTestFrameworks, TestFrameworkName } from './frameworkDefinitions';

export function packageJsonHasJestConfig(configPath: string): boolean {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const packageJson = JSON.parse(content);
    return 'jest' in packageJson;
  } catch (error) {
    logError(`Error reading package.json: ${configPath}`, error);
    return false;
  }
}

export function viteConfigHasTestAttribute(configPath: string): boolean {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return /\btest\s*[:=]/.test(content);
  } catch (error) {
    logError(`Error reading vite config file: ${configPath}`, error);
    return false;
  }
}

export function binaryExists(directoryPath: string, binaryName: string): boolean {
  const possibleBinaryPaths = [
    path.join(directoryPath, 'node_modules', '.bin', binaryName),
    path.join(directoryPath, 'node_modules', '.bin', `${binaryName}.cmd`),
    path.join(directoryPath, 'node_modules', binaryName, 'package.json'),
  ];
  return possibleBinaryPaths.some(fs.existsSync);
}

export function getConfigPath(directoryPath: string, frameworkName: string): string | undefined {
  const framework = allTestFrameworks.find((f) => f.name === frameworkName);
  if (!framework) return undefined;

  for (const configFile of framework.configFiles) {
    const configPath = path.join(directoryPath, configFile);
    if (!fs.existsSync(configPath)) continue;

    // vite.config.* ist nur gültig wenn test-Attribut vorhanden
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
      return path.dirname(configPath);
    }
    return rootDirMatch[2]; // the captured string inside quotes
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
  const rootsStart = content.indexOf('roots');
  if (rootsStart === -1) return undefined;

  const arrayStart = content.indexOf('[', rootsStart);
  if (arrayStart === -1) return undefined;

  const arrayEnd = findMatchingBracket(content, arrayStart);
  if (!arrayEnd) return undefined;

  const arrayContent = content.substring(arrayStart + 1, arrayEnd - 1);
  const roots = extractStringsFromArray(arrayContent);

  return roots.length > 0 ? roots : undefined;
};

const extractTestPathIgnorePatternsFromText = (content: string): string[] | undefined => {
  const ignoreStart = content.indexOf('testPathIgnorePatterns');
  if (ignoreStart === -1) return undefined;

  const arrayStart = content.indexOf('[', ignoreStart);
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
    if (rootDir) {
      logDebug(`Found rootDir in ${configPath}: ${rootDir}`);
    }

    const roots = extractRoots(config);
    if (roots) {
      logDebug(`Found roots in ${configPath}: ${roots.join(', ')}`);
    }

    const ignorePatterns = extractTestPathIgnorePatterns(config);
    if (ignorePatterns) {
      logDebug(`Found testPathIgnorePatterns in ${configPath}: ${ignorePatterns.join(', ')}`);
    }

    if (config.testMatch && Array.isArray(config.testMatch)) {
      logDebug(`Found testMatch in ${configPath}: ${config.testMatch.join(', ')}`);
      return { patterns: config.testMatch, isRegex: false, rootDir, roots, ignorePatterns };
    }

    const regexPatterns = extractTestRegex(config);
    if (regexPatterns) {
      logDebug(`Found testRegex in ${configPath}: ${regexPatterns.join(', ')}`);
      return { patterns: regexPatterns, isRegex: true, rootDir, roots, ignorePatterns };
    }

    // Return config with roots/ignorePatterns even if no explicit patterns found
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

  logDebug(`Found testMatch patterns in ${configPath}: ${patterns.join(', ')}`);
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
  logDebug(`Found testRegex in ${configPath}: ${regex}`);
  return { patterns: [regex], isRegex: true, rootDir };
};

const parseJsConfig = (
  content: string,
  configPath: string
): TestPatterns | undefined => {
  const rootDir = extractRootDir(content, configPath);
  if (rootDir) {
    logDebug(`Found rootDir in ${configPath}: ${rootDir}`);
  }

  const roots = extractRootsFromText(content);
  if (roots) {
    logDebug(`Found roots in ${configPath}: ${roots.join(', ')}`);
  }

  const ignorePatterns = extractTestPathIgnorePatternsFromText(content);
  if (ignorePatterns) {
    logDebug(`Found testPathIgnorePatterns in ${configPath}: ${ignorePatterns.join(', ')}`);
  }

  const baseResult =
    parseTestMatchFromText(content, configPath, rootDir) ??
    parseTestRegexFromText(content, configPath, rootDir);

  if (baseResult) {
    return { ...baseResult, roots, ignorePatterns };
  }

  // Return config with roots/ignorePatterns even if no explicit patterns found
  if (roots || ignorePatterns) {
    return { patterns: [], isRegex: false, rootDir, roots, ignorePatterns };
  }

  return undefined;
};

export function getTestMatchFromJestConfig(
  configPath: string
): TestPatterns | undefined {
  try {
    const content = fs.readFileSync(configPath, 'utf8');

    if (configPath.endsWith('.json')) {
      return parseJsonConfig(content, configPath);
    }

    return parseJsConfig(content, configPath);
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

  logDebug(`Found include patterns in ${configPath}: ${patterns.join(', ')}`);
  return patterns;
};

const extractExcludePatterns = (
  testBlockContent: string,
  configPath: string
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

  logDebug(`Found exclude patterns in ${configPath}: ${patterns.join(', ')}`);
  return patterns;
};

const extractVitestRoot = (content: string): string | undefined => {
  // root is at the top level of defineConfig, not inside test block
  const rootMatch = content.match(/['"]?root['"]?\s*:\s*['"]([^'"]+)['"]/);
  if (rootMatch) {
    logDebug(`Found Vitest root: ${rootMatch[1]}`);
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
    logDebug(`Found dir in ${configPath}: ${dirMatch[1]}`);
    return dirMatch[1];
  }
  return undefined;
};

export function getVitestConfig(configPath: string): TestPatterns | undefined {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const testBlockContent = extractTestBlockContent(content);

    const rootDir = extractVitestRoot(content);
    const patterns = testBlockContent ? extractIncludePatterns(testBlockContent, configPath) : undefined;
    const excludePatterns = testBlockContent ? extractExcludePatterns(testBlockContent, configPath) : undefined;
    const dir = testBlockContent ? extractVitestDir(testBlockContent, configPath) : undefined;

    if (!patterns && !excludePatterns && !dir && !rootDir) {
      return undefined;
    }

    return {
      patterns: patterns ?? [],
      isRegex: false,
      rootDir,
      excludePatterns,
      dir,
    };
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

  const fullConfigPath = path.resolve(basePath, resolvedConfigPath);
  if (!fs.existsSync(fullConfigPath)) return undefined;

  return fullConfigPath;
}

export function getPlaywrightTestDir(configPath: string): string | undefined {
  try {
    const content = fs.readFileSync(configPath, 'utf8');

    if (configPath.endsWith('.json')) {
      const config = JSON.parse(content);
      return config.testDir;
    }

    // For JS/TS configs, parse testDir
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
    const content = fs.readFileSync(configPath, 'utf8');

    if (configPath.endsWith('.json')) {
      const config = JSON.parse(content);
      return config.e2e?.specPattern || config.specPattern;
    }

    // For JS/TS configs, parse e2e.specPattern or specPattern
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

    // Also check e2e.specPattern
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
