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

const parseExcludePatterns = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return toStringArray(value);
  }

  if (value && typeof value === 'object' && 'patterns' in value) {
    return toStringArray((value as { patterns?: unknown }).patterns);
  }

  return undefined;
};

const parseRstestConfigContent = (
  config: any,
  configPath: string,
): TestPatterns | undefined => {
  if (!config || typeof config !== 'object') return undefined;

  const patterns = toStringArray(config.include);
  const excludePatterns = parseExcludePatterns(config.exclude);
  const rootDir = normalizeRootDir(
    typeof config.root === 'string' ? config.root : undefined,
    configPath,
  );

  if (!patterns && !excludePatterns && !rootDir) return undefined;

  return {
    patterns: patterns ?? [],
    isRegex: false,
    rootDir,
    excludePatterns,
  };
};

const parseProjects = (projects: any[], configPath: string): TestPatterns[] => {
  const results: TestPatterns[] = [];
  const configDir = dirname(configPath);

  for (const project of projects) {
    if (typeof project === 'string') {
      try {
        const projectPath = normalizePath(resolve(configDir, project));
        const projectResult = getRstestConfig(projectPath);
        if (projectResult) {
          results.push(...projectResult);
        }
      } catch (error) {
        logError(`Failed to parse project ${project} in ${configPath}`, error);
      }
      continue;
    }

    if (typeof project === 'object') {
      const projectResult = parseRstestConfigContent(project, configPath);
      if (projectResult) {
        results.push(projectResult);
      }
    }
  }

  return results;
};

const parseJsonConfig = (
  content: string,
  configPath: string,
): TestPatterns[] | undefined => {
  try {
    const config = JSON.parse(content);
    if (config.projects) {
      return parseProjects(config.projects, configPath);
    }

    const parsed = parseRstestConfigContent(config, configPath);
    return parsed ? [parsed] : undefined;
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

  const parsed = parseRstestConfigContent(config, configPath);
  return parsed ? [parsed] : undefined;
};

export function getRstestConfig(
  configPath: string,
): TestPatterns[] | undefined {
  try {
    const content = readConfigFile(configPath);

    const result = configPath.endsWith('.json')
      ? parseJsonConfig(content, configPath)
      : parseJsConfig(content, configPath);

    if (result) {
      logDebug(
        `Parsed Rstest config: ${configPath}. Projects found: ${result.length}`,
      );
    }

    return result;
  } catch (error) {
    logError(`Error reading Rstest config file: ${configPath}`, error);
    return undefined;
  }
}
