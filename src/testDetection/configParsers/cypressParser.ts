import * as t from '@babel/types';
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

const extractSpecPattern = (object: t.ObjectExpression): string[] | undefined => {
  const topLevel = getStringArrayFromProperty(object, 'specPattern');
  if (topLevel) {
    return topLevel;
  }

  const e2eObject = getObjectFromProperty(object, 'e2e');
  if (e2eObject) {
    const e2ePattern = getStringArrayFromProperty(e2eObject, 'specPattern');
    if (e2ePattern) {
      return e2ePattern;
    }
  }

  for (const prop of object.properties) {
    if (!t.isSpreadElement(prop)) {
      continue;
    }

    const argument = prop.argument;

    if (t.isObjectExpression(argument)) {
      const fromSpread = extractSpecPattern(argument);
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
          const fromCallArg = extractSpecPattern(arg);
          if (fromCallArg) {
            return fromCallArg;
          }
        }
      }
    }
  }

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

    return extractSpecPattern(configObject);
  } catch (error) {
    logError(`Error reading Cypress config file: ${configPath}`, error);
    return undefined;
  }
}
