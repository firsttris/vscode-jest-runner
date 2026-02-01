import { logError } from '../../utils/Logger';
import { getStringFromProperty, parseConfigObject, readConfigFile } from './parseUtils';

export function getPlaywrightTestDir(configPath: string): string | undefined {
  try {
    const content = readConfigFile(configPath);

    if (configPath.endsWith('.json')) {
      const parsed = JSON.parse(content);
      return typeof parsed.testDir === 'string' ? parsed.testDir : undefined;
    }

    const configObject = parseConfigObject(content);
    if (!configObject) return undefined;

    return getStringFromProperty(configObject, 'testDir');
  } catch (error) {
    logError(`Error reading Playwright config file: ${configPath}`, error);
    return undefined;
  }
}
