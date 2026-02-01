import * as t from '@babel/types';
import { logError } from '../../utils/Logger';
import { getStringFromProperty, parseConfigObject, readConfigFile } from './parseUtils';

const extractTestDir = (object: t.ObjectExpression): string | undefined => {
  const direct = getStringFromProperty(object, 'testDir');
  if (direct) {
    return direct;
  }

  for (const prop of object.properties) {
    if (!t.isSpreadElement(prop)) {
      continue;
    }

    const argument = prop.argument;

    if (t.isObjectExpression(argument)) {
      const fromSpread = extractTestDir(argument);
      if (fromSpread) {
        return fromSpread;
      }
    }

    if (t.isCallExpression(argument)) {
      for (const arg of argument.arguments) {
        if (t.isSpreadElement(arg)) {
          continue;
        }

        if (t.isObjectExpression(arg)) {
          const fromCallArgument = extractTestDir(arg);
          if (fromCallArgument) {
            return fromCallArgument;
          }
        }
      }
    }
  }

  return undefined;
};

export function getPlaywrightTestDir(configPath: string): string | undefined {
  try {
    const content = readConfigFile(configPath);

    if (configPath.endsWith('.json')) {
      const parsed = JSON.parse(content);
      return typeof parsed.testDir === 'string' ? parsed.testDir : undefined;
    }

    const configObject = parseConfigObject(content);
    if (!configObject) return undefined;

    return extractTestDir(configObject);
  } catch (error) {
    logError(`Error reading Playwright config file: ${configPath}`, error);
    return undefined;
  }
}
