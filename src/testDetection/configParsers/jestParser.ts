import { dirname, isAbsolute, join, resolve } from 'node:path';
import { normalizePath } from '../../utils/PathUtils';
import { TestPatterns, TestFrameworkName } from '../frameworkDefinitions';
import { logDebug, logError } from '../../utils/Logger';
import { parseConfigObject, readConfigFile } from './parseUtils';

const extractTestRegex = (config: any): string[] | undefined => {
  if (!config?.testRegex) return undefined;
  if (typeof config.testRegex === 'string') return [config.testRegex];
  if (Array.isArray(config.testRegex)) return config.testRegex as string[];
  return undefined;
};

const extractArrayProperty = (
  config: any,
  key: string,
): string[] | undefined => {
  const value = config?.[key];
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value : undefined;
};

const parseJestConfigContent = (
  config: any,
  configPath: string,
  rootDirOverride?: string,
): TestPatterns | undefined => {
  if (!config) return undefined;

  const rootDirValue = config.rootDir;
  const resolvedRootDir =
    rootDirOverride ??
    (rootDirValue
      ? rootDirValue === '__dirname'
        ? dirname(configPath)
        : resolve(dirname(configPath), rootDirValue)
      : undefined);

  const roots = extractArrayProperty(config, 'roots');
  const ignorePatterns = extractArrayProperty(config, 'testPathIgnorePatterns');

  const createResult = (
    patterns: string[],
    isRegex: boolean,
  ): TestPatterns => ({
    patterns,
    isRegex,
    rootDir: resolvedRootDir,
    roots,
    ignorePatterns,
  });

  if (Array.isArray(config.testMatch)) {
    return createResult(config.testMatch, false);
  }

  const regexPatterns = extractTestRegex(config);
  if (regexPatterns) {
    return createResult(regexPatterns, true);
  }

  if (roots || ignorePatterns) {
    return createResult([], false);
  }

  return undefined;
};

const parseJsonConfig = (
  content: string,
  configPath: string,
): TestPatterns[] | undefined => {
  try {
    const config = configPath.endsWith('package.json')
      ? JSON.parse(content).jest
      : JSON.parse(content);

    if (!config) return undefined;

    if (config.projects) {
      return parseProjects(config.projects, configPath);
    }

    const result = parseJestConfigContent(config, configPath);
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

  if (config.projects) {
    return parseProjects(config.projects, configPath);
  }

  const result = parseJestConfigContent(config, configPath);
  return result ? [result] : undefined;
};

const parseProjects = (projects: any[], configPath: string): TestPatterns[] => {
  const results: TestPatterns[] = [];
  const configDir = dirname(configPath);

  for (const project of projects) {
    if (typeof project === 'string') {
      try {
        const projectPath = normalizePath(resolve(configDir, project));
        const result = getTestMatchFromJestConfig(projectPath);
        if (result) {
          results.push(...result);
        }
      } catch (e) {
        logError(`Failed to parse project ${project} in ${configPath}`, e);
      }
    } else if (typeof project === 'object') {
      const result = parseJestConfigContent(project, configPath);
      if (result) results.push(result);
    }
  }
  return results;
};

export function getTestMatchFromJestConfig(
  configPath: string,
): TestPatterns[] | undefined {
  try {
    const content = readConfigFile(configPath);

    const result = configPath.endsWith('.json')
      ? parseJsonConfig(content, configPath)
      : parseJsConfig(content, configPath);

    if (result) {
      logDebug(
        `Parsed Jest config: ${configPath}. Projects found: ${result.length}`,
      );
    }

    return result;
  } catch (error) {
    logDebug(
      `Error reading Jest config file or project path: ${configPath}. Error: ${error}`,
    );
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
  framework: TestFrameworkName,
): string | undefined {
  try {
    const content = readConfigFile(configPath);
    const configDir = dirname(configPath);

    if (configPath.endsWith('.json')) {
      const parsed = JSON.parse(content);
      const config = configPath.endsWith('package.json')
        ? parsed?.jest
        : parsed;

      if (!config) return undefined;

      if (framework === 'vitest') {
        const testConfig = config.test ?? {};
        const coverageConfig = testConfig.coverage ?? {};
        return resolveCoverageDirectory(
          coverageConfig.reportsDirectory,
          config.root,
          configDir,
          configPath,
        );
      }

      return resolveCoverageDirectory(
        config.coverageDirectory,
        config.rootDir,
        configDir,
        configPath,
      );
    }

    const config = parseConfigObject(content);
    if (!config) return undefined;

    if (framework === 'vitest') {
      const root = config.root;
      const testConfig = config.test ?? {};
      const coverageConfig = testConfig.coverage ?? {};
      return resolveCoverageDirectory(
        coverageConfig.reportsDirectory,
        root,
        configDir,
        configPath,
      );
    }

    const coverageDir = config.coverageDirectory;
    const rootDir = config.rootDir;

    return resolveCoverageDirectory(
      coverageDir,
      rootDir,
      configDir,
      configPath,
    );
  } catch (error) {
    logError(`Could not parse ${framework} config: ${error}`);
    return undefined;
  }
}
