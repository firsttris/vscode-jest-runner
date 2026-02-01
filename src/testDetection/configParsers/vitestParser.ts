import { TestPatterns } from '../frameworkDefinitions';
import { logDebug, logError } from '../../utils/Logger';
import {
  getObjectFromProperty,
  getStringArrayFromProperty,
  getStringFromProperty,
  hasProperty,
  parseConfigObject,
  readConfigFile,
} from './parseUtils';

const parseJsonConfig = (content: string): TestPatterns | undefined => {
  try {
    const config = JSON.parse(content);
    const testConfig = config.test;
    if (!testConfig) return undefined;

    const patterns = Array.isArray(testConfig.include) ? testConfig.include : undefined;
    const excludePatterns = Array.isArray(testConfig.exclude) ? testConfig.exclude : undefined;
    const dir = typeof testConfig.dir === 'string' ? testConfig.dir : undefined;
    const rootDir = typeof config.root === 'string' ? config.root : undefined;

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
  const configObject = parseConfigObject(content);
  if (!configObject) return undefined;

  const rootDir = getStringFromProperty(configObject, 'root');
  const testObject = getObjectFromProperty(configObject, 'test');
  if (!testObject) return undefined;

  const patterns = getStringArrayFromProperty(testObject, 'include');
  const excludePatterns = getStringArrayFromProperty(testObject, 'exclude');
  const dir = getStringFromProperty(testObject, 'dir');

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
      const parsed = parseJsonConfig(content);
      return !!parsed;
    }

    const configObject = parseConfigObject(content);
    if (!configObject) {
      // Fallback for malformed configs that still contain a test block assignment
      return content.includes('test =');
    }
    return hasProperty(configObject, 'test');
  } catch (error) {
    logError(`Error reading vite config file: ${configPath}`, error);
    return false;
  }
}

export function getVitestConfig(configPath: string): TestPatterns | undefined {
  try {
    const content = readConfigFile(configPath);

    return configPath.endsWith('.json')
      ? parseJsonConfig(content)
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
