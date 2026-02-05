import { dirname } from 'node:path';
import { TestPatterns } from '../frameworkDefinitions';
import { logDebug, logError } from '../../utils/Logger';
import {
  parseConfigObject,
  readConfigFile,
} from './parseUtils';

const normalizeRootDir = (rootDir: string | undefined, configPath: string): string | undefined => {
  if (!rootDir) return undefined;
  return rootDir === '__dirname' ? dirname(configPath) : rootDir;
};

const parseJsonConfig = (content: string, configPath: string): TestPatterns | undefined => {
  try {
    const config = JSON.parse(content);
    const testConfig = config.test;
    if (!testConfig) return undefined;

    const patterns = Array.isArray(testConfig.include) ? testConfig.include : undefined;
    const excludePatterns = Array.isArray(testConfig.exclude) ? testConfig.exclude : undefined;
    const dir = typeof testConfig.dir === 'string' ? testConfig.dir : undefined;
    const rootDir = normalizeRootDir(
      typeof config.root === 'string' ? config.root : undefined,
      configPath,
    );

    if (!patterns && !excludePatterns && !dir && !rootDir) return undefined;

    return {
      patterns: patterns ?? [],
      isRegex: false,
      rootDir,
      excludePatterns,
      dir,
    };
  } catch {
    return undefined;
  }
};

const parseJsConfig = (content: string, configPath: string): TestPatterns | undefined => {
  const config = parseConfigObject(content);
  if (!config) return undefined;

  const rootDir = normalizeRootDir(
    typeof config.root === 'string' ? config.root : undefined,
    configPath,
  );
  const testObject = config.test;
  if (!testObject) return undefined;

  const patterns = Array.isArray(testObject.include) ? testObject.include : undefined;
  const excludePatterns = Array.isArray(testObject.exclude) ? testObject.exclude : undefined;
  const dir = typeof testObject.dir === 'string' ? testObject.dir : undefined;

  if (!patterns && !excludePatterns && !dir && !rootDir) return undefined;

  const result = {
    patterns: patterns ?? [],
    isRegex: false,
    rootDir,
    excludePatterns,
    dir,
  };

  logDebug(`Parsed Vitest config: ${configPath}. Result: ${JSON.stringify(result)}`);
  return result;
};

export function viteConfigHasTestAttribute(configPath: string): boolean {
  try {
    const content = readConfigFile(configPath);

    if (configPath.endsWith('.json')) {
      const parsed = parseJsonConfig(content, configPath);
      return !!parsed;
    }

    const config = parseConfigObject(content);
    if (!config) {
      // Fallback for malformed configs that still contain a test block assignment
      return content.includes('test =');
    }
    return !!config.test;
  } catch (error) {
    logError(`Error reading vite config file: ${configPath}`, error);
    return false;
  }
}

export function getVitestConfig(configPath: string): TestPatterns | undefined {
  try {
    const content = readConfigFile(configPath);

    return configPath.endsWith('.json')
      ? parseJsonConfig(content, configPath)
      : parseJsConfig(content, configPath);
  } catch (error) {
    logError(`Error reading Vitest config file: ${configPath}`, error);
    return undefined;
  }
}

export function getIncludeFromVitestConfig(configPath: string): string[] | undefined {
  const config = getVitestConfig(configPath);
  return config?.patterns && config.patterns.length > 0 ? config.patterns : undefined;
}
