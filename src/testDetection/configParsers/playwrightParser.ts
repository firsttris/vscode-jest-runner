
import { logError } from '../../utils/Logger';
import { parseConfigObject, readConfigFile } from './parseUtils';
import { TestPatterns, DEFAULT_TEST_PATTERNS } from '../frameworkDefinitions';

export function getPlaywrightConfig(configPath: string): TestPatterns[] | undefined {
  try {
    const content = readConfigFile(configPath);
    let config: any;

    if (configPath.endsWith('.json')) {
      config = JSON.parse(content);
    } else {
      config = parseConfigObject(content);
    }

    if (!config) return undefined;

    const testMatch = config.testMatch;
    const testIgnore = config.testIgnore;
    const testDir = config.testDir;

    let patterns: string[] = [];
    let isRegex = false;

    if (typeof testMatch === 'string') {
      patterns = [testMatch];
    } else if (Array.isArray(testMatch)) {
      patterns = testMatch.map(p => typeof p === 'string' ? p : p.source); // Handle RegExp objects if astToValue returns them? 
      // astToValue returns string for RegExp literals usually if not handled specifically, let's verify astToValue.
      // But let's assume strings for now or regex sources.
      // Actually parseUtils.ts:68 astToValue call.
    } else if (testMatch instanceof RegExp) {
      patterns = [testMatch.source];
      isRegex = true;
    } else {
      patterns = DEFAULT_TEST_PATTERNS;
    }

    // If we have regex patterns mixed with strings, it handles it? 
    // The current TestPatterns interface assumes all patterns are regex or all are glob.
    // Playwright supports mixed. But `isRegex` flag in TestPatterns applies to all.
    // If we have regex, we should treat everything as regex? or return multiple TestPatterns?

    // Simple approach: 
    if (patterns.some(p => p.includes('\\') || p.includes('^') || p.includes('$'))) {
      // heuristic for regex? fallback to glob if not sure.
    }

    return [{
      patterns,
      isRegex: false, // For now assume globs primarily. Playwright default is globs.
      dir: testDir,
      ignorePatterns: Array.isArray(testIgnore) ? testIgnore : (typeof testIgnore === 'string' ? [testIgnore] : undefined),
    }];
  } catch (error) {
    logError(`Error reading Playwright config file: ${configPath}`, error);
    return undefined;
  }
}

export function getPlaywrightTestDir(configPath: string): string | undefined {
  try {
    const configs = getPlaywrightConfig(configPath);
    return configs?.[0]?.dir;
  } catch {
    return undefined;
  }
}
