import { readFileSync } from 'node:fs';
import { TestPatterns } from '../frameworkDefinitions';
import { logDebug, logError } from '../../utils/Logger';
import {
  extractArrayFromText,
  extractStringValue,
  findMatchingBrace,
  readConfigFile,
} from './parseUtils';

export function viteConfigHasTestAttribute(configPath: string): boolean {
  try {
    const content = readFileSync(configPath, 'utf8');
    return /\btest\s*[:=]/.test(content);
  } catch (error) {
    logError(`Error reading vite config file: ${configPath}`, error);
    return false;
  }
}

const extractTestBlockContent = (content: string): string | undefined => {
  const testBlockMatch = content.match(/test\s*:\s*\{/);
  if (!testBlockMatch || testBlockMatch.index === undefined) return undefined;

  const startIndex = testBlockMatch.index + testBlockMatch[0].length;
  const endIndex = findMatchingBrace(content, startIndex);

  return endIndex ? content.substring(startIndex, endIndex) : undefined;
};

export function getVitestConfig(configPath: string): TestPatterns | undefined {
  try {
    const content = readConfigFile(configPath);
    const testBlockContent = extractTestBlockContent(content);

    const rootDir = extractStringValue(content, 'root');
    const patterns = testBlockContent
      ? extractArrayFromText(testBlockContent, 'include')
      : undefined;
    const excludePatterns = testBlockContent
      ? extractArrayFromText(testBlockContent, 'exclude')
      : undefined;
    const dir = testBlockContent ? extractStringValue(testBlockContent, 'dir') : undefined;

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

export function getIncludeFromVitestConfig(configPath: string): string[] | undefined {
  const config = getVitestConfig(configPath);
  return config?.patterns && config.patterns.length > 0 ? config.patterns : undefined;
}
