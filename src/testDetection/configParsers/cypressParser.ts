
import { logError } from '../../utils/Logger';
import {
  parseConfigObject,
  readConfigFile,
} from './parseUtils';

const normalizeSpecPattern = (value: unknown): string[] | undefined => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return undefined;
};

export function getCypressSpecPattern(configPath: string): string[] | undefined {
  try {
    const content = readConfigFile(configPath);

    if (configPath.endsWith('.json')) {
      const config = JSON.parse(content);
      const jsonSpec = config.e2e?.specPattern ?? config.specPattern;
      return normalizeSpecPattern(jsonSpec);
    }

    const config = parseConfigObject(content);
    if (!config) return undefined;

    const topLevel = normalizeSpecPattern(config.specPattern);
    if (topLevel) {
      return topLevel;
    }

    if (config.e2e) {
      const e2ePattern = normalizeSpecPattern(config.e2e.specPattern);
      if (e2ePattern) {
        return e2ePattern;
      }
    }

    // Spread properties are handled by parseConfigObject (via astToValue)

    return undefined;
  } catch (error) {
    logError(`Error reading Cypress config file: ${configPath}`, error);
    return undefined;
  }
}
