import { dirname, resolve } from 'node:path';
import { normalizePath } from '../../utils/PathUtils';
import { TestPatterns } from '../frameworkDefinitions';
import { logDebug, logError } from '../../utils/Logger';
import { parseConfigObject, readConfigFile } from './parseUtils';

const normalizeRootDir = (
  rootDir: string | undefined,
  configPath: string,
): string | undefined => {
  if (!rootDir) return undefined;
  return rootDir === '__dirname' ? dirname(configPath) : rootDir;
};

const toStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sanitized = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  );
  return sanitized;
};

const parseVitestConfigContent = (
  config: any,
  configPath: string,
): TestPatterns | undefined => {
  const testConfig = config.test;
  if (!testConfig) return undefined;

  const patterns = toStringArray(testConfig.include);
  const excludePatterns = toStringArray(testConfig.exclude);
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
};

const parseJsonConfig = (
  content: string,
  configPath: string,
): TestPatterns[] | undefined => {
  try {
    const config = JSON.parse(content);

    if (config.test?.projects) {
      return parseProjects(config.test.projects, configPath);
    }

    const result = parseVitestConfigContent(config, configPath);
    return result ? [result] : undefined;
  } catch {
    return undefined;
  }
};

const parseJsConfig = (
  content: string,
  configPath: string,
): TestPatterns[] | undefined => {
  const config = parseConfigObject(content);
  if (!config) return undefined;

  if (config.test?.projects) {
    return parseProjects(config.test.projects, configPath);
  }

  const result = parseVitestConfigContent(config, configPath);
  return result ? [result] : undefined;
};

const parseProjects = (projects: any[], configPath: string): TestPatterns[] => {
  const results: TestPatterns[] = [];
  const configDir = dirname(configPath);

  for (const project of projects) {
    if (typeof project === 'string') {
      try {
        const projectPath = normalizePath(resolve(configDir, project));
        const result = getVitestConfig(projectPath);
        if (result) {
          results.push(...result);
        }
      } catch (e) {
        logError(`Failed to parse project ${project} in ${configPath}`, e);
      }
    } else if (typeof project === 'object') {
      const result = parseVitestConfigContent(project, configPath);
      if (result) results.push(result);
    }
  }
  return results;
};

export function viteConfigHasTestAttribute(configPath: string): boolean {
  try {
    const content = readConfigFile(configPath);

    if (configPath.endsWith('.json')) {
      const parsed = parseJsonConfig(content, configPath);
      return !!parsed && parsed.length > 0;
    }

    const config = parseConfigObject(content);
    if (!config) {
      return content.includes('test =');
    }

    if (config.projects || config.test?.projects) {
      return true;
    }

    return !!config.test;
  } catch (error) {
    logError(`Error reading vite config file: ${configPath}`, error);
    return false;
  }
}

export function getVitestConfig(
  configPath: string,
): TestPatterns[] | undefined {
  try {
    const content = readConfigFile(configPath);

    const result = configPath.endsWith('.json')
      ? parseJsonConfig(content, configPath)
      : parseJsConfig(content, configPath);

    if (result) {
      logDebug(
        `Parsed Vitest config: ${configPath}. Projects found: ${result.length}`,
      );
    }
    return result;
  } catch (error) {
    logError(`Error reading Vitest config file: ${configPath}`, error);
    return undefined;
  }
}

export function getIncludeFromVitestConfig(
  configPath: string,
): string[] | undefined {
  const configs = getVitestConfig(configPath);
  if (!configs || configs.length === 0) return undefined;

  const allPatterns = configs.flatMap((c) => c.patterns);
  return allPatterns.length > 0 ? allPatterns : undefined;
}
