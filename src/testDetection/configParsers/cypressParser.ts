import { logError } from '../../utils/Logger';
import { extractStringsFromArray, readConfigFile } from './parseUtils';

export function getCypressSpecPattern(configPath: string): string[] | undefined {
  try {
    const content = readConfigFile(configPath);

    if (configPath.endsWith('.json')) {
      const config = JSON.parse(content);
      return config.e2e?.specPattern || config.specPattern;
    }

    const specPatternMatch = content.match(
      /['"]?specPattern['"]?\s*:\s*(['"]([^'"]+)['"]|\[([^\]]+)\])/
    );
    if (specPatternMatch) {
      const value = specPatternMatch[2] || specPatternMatch[3];
      if (value.startsWith('[')) {
        return extractStringsFromArray(value);
      } else {
        return [value];
      }
    }

    const e2eMatch = content.match(
      /e2e\s*:\s*\{[^}]*['"]?specPattern['"]?\s*:\s*(['"]([^'"]+)['"]|\[([^\]]+)\])/
    );
    if (e2eMatch) {
      const value = e2eMatch[2] || e2eMatch[3];
      if (value.startsWith('[')) {
        return extractStringsFromArray(value);
      } else {
        return [value];
      }
    }

    return undefined;
  } catch (error) {
    logError(`Error reading Cypress config file: ${configPath}`, error);
    return undefined;
  }
}
