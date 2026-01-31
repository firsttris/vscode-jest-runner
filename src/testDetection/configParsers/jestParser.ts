import { dirname, isAbsolute, join } from 'node:path';
import { TestPatterns } from '../frameworkDefinitions';
import { logDebug, logError } from '../../utils/Logger';
import {
  extractArrayFromText,
  extractArrayProperty,
  extractStringValue,
  readConfigFile,
} from './parseUtils';

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

const parseJsonConfig = (content: string, configPath: string): TestPatterns | undefined => {
  try {
    const config = configPath.endsWith('package.json')
      ? JSON.parse(content).jest
      : JSON.parse(content);

    if (!config) return undefined;
    const rootDir = config.rootDir;
    const roots = extractArrayProperty(config, 'roots');
    const ignorePatterns = extractArrayProperty(config, 'testPathIgnorePatterns');
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
  rootDir: string | undefined
): TestPatterns | undefined => {
  const patterns = extractArrayFromText(content, 'testMatch');
  if (!patterns) return undefined;
  return { patterns, isRegex: false, rootDir };
};

const parseTestRegexFromText = (
  content: string,
  rootDir: string | undefined
): TestPatterns | undefined => {
  const regex = extractStringValue(content, 'testRegex');
  if (!regex) return undefined;
  return { patterns: [regex.replace(/\\\\/g, '\\')], isRegex: true, rootDir };
};

const parseJsConfig = (content: string, configPath: string): TestPatterns | undefined => {
  const rootDir = extractRootDir(content, configPath);
  const roots = extractArrayFromText(content, 'roots');
  const ignorePatterns = extractArrayFromText(content, 'testPathIgnorePatterns');
  const baseResult =
    parseTestMatchFromText(content, rootDir) ?? parseTestRegexFromText(content, rootDir);

  if (baseResult) {
    return { ...baseResult, roots, ignorePatterns };
  }

  if (roots || ignorePatterns) {
    return { patterns: [], isRegex: false, rootDir, roots, ignorePatterns };
  }

  return undefined;
};

export function getTestMatchFromJestConfig(configPath: string): TestPatterns | undefined {
  try {
    const content = readConfigFile(configPath);

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

export function parseCoverageDirectory(
  configPath: string,
  framework: 'jest' | 'vitest'
): string | undefined {
  try {
    const content = readConfigFile(configPath);
    const configDir = dirname(configPath);

    const pattern =
      framework === 'vitest'
        ? /reportsDirectory\s*[=:]\s*["']([^"']+)["']/
        : /["']?coverageDirectory["']?\s*[=:]\s*["']([^"']+)["']/;

    const match = content.match(pattern);

    if (match) {
      const dir = match[1];

      if (framework === 'jest') {
        const rootDirMatch = content.match(/["']?rootDir["']?\s*:\s*["']([^"']+)["']/);
        const rootDir = rootDirMatch ? rootDirMatch[1] : '.';
        const rootDirPath = isAbsolute(rootDir) ? rootDir : join(configDir, rootDir);
        return isAbsolute(dir) ? dir : join(rootDirPath, dir);
      } else {
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
