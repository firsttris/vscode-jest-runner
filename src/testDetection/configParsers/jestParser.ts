import { dirname, isAbsolute, join } from 'node:path';
import { TestPatterns } from '../frameworkDefinitions';
import { logDebug, logError } from '../../utils/Logger';
import {
  getObjectFromProperty,
  getStringArrayFromProperty,
  getStringFromProperty,
  parseConfigObject,
  readConfigFile,
} from './parseUtils';

const extractTestRegex = (config: any): string[] | undefined => {
  if (!config?.testRegex) return undefined;
  if (typeof config.testRegex === 'string') return [config.testRegex];
  if (Array.isArray(config.testRegex)) return config.testRegex as string[];
  return undefined;
};

const extractArrayProperty = (config: any, key: string): string[] | undefined => {
  const value = config?.[key];
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value : undefined;
};

const parseJsonConfig = (content: string, configPath: string): TestPatterns | undefined => {
  try {
    const config = configPath.endsWith('package.json')
      ? JSON.parse(content).jest
      : JSON.parse(content);

    if (!config) return undefined;

    const rootDir = config.rootDir;
    const roots = extractArrayProperty(config, 'roots');
    const ignorePatterns = extractArrayProperty(config, 'testPathIgnorePatterns');

    if (Array.isArray(config.testMatch)) {
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

const parseJsConfig = (content: string, configPath: string): TestPatterns | undefined => {
  const configObject = parseConfigObject(content);
  if (!configObject) return undefined;

  const rootDirValue = getStringFromProperty(configObject, 'rootDir');
  const rootDir = rootDirValue === '__dirname' ? dirname(configPath) : rootDirValue;
  const roots = getStringArrayFromProperty(configObject, 'roots');
  const ignorePatterns = getStringArrayFromProperty(configObject, 'testPathIgnorePatterns');

  const testMatch = getStringArrayFromProperty(configObject, 'testMatch');
  if (testMatch) {
    return { patterns: testMatch, isRegex: false, rootDir, roots, ignorePatterns };
  }

  const testRegex = getStringArrayFromProperty(configObject, 'testRegex');
  if (testRegex) {
    return { patterns: testRegex, isRegex: true, rootDir, roots, ignorePatterns };
  }

  if (roots || ignorePatterns) {
    return { patterns: [], isRegex: false, rootDir, roots, ignorePatterns };
  }

  return undefined;
};

export function getTestMatchFromJestConfig(configPath: string): TestPatterns | undefined {
  try {
    const content = readConfigFile(configPath);

    const result = configPath.endsWith('.json')
      ? parseJsonConfig(content, configPath)
      : parseJsConfig(content, configPath);

    if (result) {
      logDebug(`Parsed Jest config: ${configPath}. Result: ${JSON.stringify(result)}`);
    }

    return result;
  } catch (error) {
    logError(`Error reading Jest config file: ${configPath}`, error);
    return undefined;
  }
}

const resolveCoverageDirectory = (
  dir: string | undefined,
  root: string | undefined,
  configDir: string,
  configPath: string,
): string | undefined => {
  if (!dir) return undefined;

  const normalizedRoot = root === '__dirname' ? dirname(configPath) : root;
  const baseDir = normalizedRoot
    ? isAbsolute(normalizedRoot)
      ? normalizedRoot
      : join(configDir, normalizedRoot)
    : configDir;

  return isAbsolute(dir) ? dir : join(baseDir, dir);
};

export function parseCoverageDirectory(
  configPath: string,
  framework: 'jest' | 'vitest'
): string | undefined {
  try {
    const content = readConfigFile(configPath);
    const configDir = dirname(configPath);

    if (configPath.endsWith('.json')) {
      const parsed = JSON.parse(content);
      const config = configPath.endsWith('package.json') ? parsed?.jest : parsed;

      if (!config) return undefined;

      if (framework === 'vitest') {
        const testConfig = config.test ?? {};
        const coverageConfig = testConfig.coverage ?? {};
        return resolveCoverageDirectory(coverageConfig.reportsDirectory, config.root, configDir, configPath);
      }

      return resolveCoverageDirectory(config.coverageDirectory, config.rootDir, configDir, configPath);
    }

    const configObject = parseConfigObject(content);
    if (!configObject) return undefined;

    if (framework === 'vitest') {
      const root = getStringFromProperty(configObject, 'root');
      const testObject = getObjectFromProperty(configObject, 'test');
      const coverageObject = testObject ? getObjectFromProperty(testObject, 'coverage') : undefined;
      const reportsDir = coverageObject ? getStringFromProperty(coverageObject, 'reportsDirectory') : undefined;
      return resolveCoverageDirectory(reportsDir, root, configDir, configPath);
    }

    const coverageDir = getStringFromProperty(configObject, 'coverageDirectory');
    const rootDir = getStringFromProperty(configObject, 'rootDir');

    return resolveCoverageDirectory(coverageDir, rootDir, configDir, configPath);
  } catch (error) {
    logError(`Could not parse ${framework} config: ${error}`);
    return undefined;
  }
}
