import { logError } from '../../utils/Logger';
import { extractStringValue, readConfigFile } from './parseUtils';

export function getPlaywrightTestDir(configPath: string): string | undefined {
  try {
    const content = readConfigFile(configPath);
    if (configPath.endsWith('.json')) {
      return JSON.parse(content).testDir;
    }
    return extractStringValue(content, 'testDir');
  } catch (error) {
    logError(`Error reading Playwright config file: ${configPath}`, error);
    return undefined;
  }
}
