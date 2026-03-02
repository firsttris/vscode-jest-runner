import { logError } from '../../utils/Logger';
import { parseConfigObject, readConfigFile } from './parseUtils';
import { TestPatterns, DEFAULT_TEST_PATTERNS } from '../frameworkDefinitions';

export function getPlaywrightConfig(
  configPath: string,
): TestPatterns[] | undefined {
  try {
    const content = readConfigFile(configPath);
    const config = configPath.endsWith('.json')
      ? JSON.parse(content)
      : parseConfigObject(content);

    if (!config) return undefined;

    const { testMatch, testIgnore, testDir } = config;

    const patterns =
      typeof testMatch === 'string'
        ? [testMatch]
        : Array.isArray(testMatch)
          ? testMatch.map((p: any) => (typeof p === 'string' ? p : p.source))
          : testMatch instanceof RegExp
            ? [testMatch.source]
            : DEFAULT_TEST_PATTERNS;

    const isRegex = testMatch instanceof RegExp;

    return [
      {
        patterns,
        isRegex,
        dir: testDir,
        ignorePatterns: Array.isArray(testIgnore)
          ? testIgnore
          : typeof testIgnore === 'string'
            ? [testIgnore]
            : undefined,
      },
    ];
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
