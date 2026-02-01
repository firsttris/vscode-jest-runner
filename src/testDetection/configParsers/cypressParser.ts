import { logError } from '../../utils/Logger';
import {
  getObjectFromProperty,
  getStringArrayFromProperty,
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

    const configObject = parseConfigObject(content);
    if (!configObject) return undefined;

    const topLevel = getStringArrayFromProperty(configObject, 'specPattern');
    if (topLevel) return topLevel;

    const e2eObject = getObjectFromProperty(configObject, 'e2e');
    if (e2eObject) {
      const pattern = getStringArrayFromProperty(e2eObject, 'specPattern');
      if (pattern) return pattern;
    }

    return undefined;
  } catch (error) {
    logError(`Error reading Cypress config file: ${configPath}`, error);
    return undefined;
  }
}
