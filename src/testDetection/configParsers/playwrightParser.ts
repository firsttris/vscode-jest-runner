
import { logError } from '../../utils/Logger';
import { parseConfigObject, readConfigFile } from './parseUtils';

export function getPlaywrightTestDir(configPath: string): string | undefined {
  try {
    const content = readConfigFile(configPath);

    if (configPath.endsWith('.json')) {
      const parsed = JSON.parse(content);
      return typeof parsed.testDir === 'string' ? parsed.testDir : undefined;
    }

    const config = parseConfigObject(content);
    if (!config) return undefined;

    return typeof config.testDir === 'string' ? config.testDir : undefined;
  } catch (error) {
    logError(`Error reading Playwright config file: ${configPath}`, error);
    return undefined;
  }
}
