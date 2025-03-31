import * as path from 'path';
import { execSync } from 'child_process';
import * as mm from 'micromatch';
import * as vscode from 'vscode';
import * as fs from 'fs';

export function getDirName(filePath: string): string {
  return path.dirname(filePath);
}

export function getFileName(filePath: string): string {
  return path.basename(filePath);
}

export function isWindows(): boolean {
  return process.platform.includes('win32');
}

export function normalizePath(path: string): string {
  return isWindows() ? path.replace(/\\/g, '/') : path;
}

export function escapeRegExp(s: string): string {
  const escapedString = s.replace(/[.*+?^${}<>()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  return escapedString.replace(/\\\(\\\.\\\*\\\?\\\)/g, '(.*?)'); // should revert the escaping of match all regex patterns.
}

export function escapeRegExpForPath(s: string): string {
  return s.replace(/[*+?^${}<>()|[\]]/g, '\\$&'); // $& means the whole matched string
}

export function findFullTestName(selectedLine: number, children: any[]): string | undefined {
  if (!children) {
    return;
  }
  for (const element of children) {
    if (element.type === 'describe' && selectedLine === element.start.line) {
      return resolveTestNameStringInterpolation(element.name);
    }
    if (element.type !== 'describe' && selectedLine >= element.start.line && selectedLine <= element.end.line) {
      return resolveTestNameStringInterpolation(element.name);
    }
  }
  for (const element of children) {
    const result = findFullTestName(selectedLine, element.children);
    if (result) {
      return resolveTestNameStringInterpolation(element.name) + ' ' + result;
    }
  }
}

const QUOTES = {
  '"': true,
  "'": true,
  '`': true,
};

function resolveTestNameStringInterpolation(s: string): string {
  const variableRegex = /(\${?[A-Za-z0-9_]+}?|%[psdifjo#%])/gi;
  const matchAny = '(.*?)';
  return s.replace(variableRegex, matchAny);
}

export function escapeSingleQuotes(s: string): string {
  return isWindows() ? s : s.replace(/'/g, "'\\''");
}

export function quote(s: string): string {
  const q = isWindows() ? '"' : `'`;
  return [q, s, q].join('');
}

export function unquote(s: string): string {
  if (QUOTES[s[0]]) {
    s = s.substring(1);
  }

  if (QUOTES[s[s.length - 1]]) {
    s = s.substring(0, s.length - 1);
  }

  return s;
}

export function pushMany<T>(arr: T[], items: T[]): number {
  return Array.prototype.push.apply(arr, items);
}

export type CodeLensOption = 'run' | 'debug' | 'watch' | 'coverage' | 'current-test-coverage';

function isCodeLensOption(option: string): option is CodeLensOption {
  return ['run', 'debug', 'watch', 'coverage', 'current-test-coverage'].includes(option);
}

export function validateCodeLensOptions(maybeCodeLensOptions: string[]): CodeLensOption[] {
  return [...new Set(maybeCodeLensOptions)].filter((value) => isCodeLensOption(value)) as CodeLensOption[];
}

export function isNodeExecuteAbleFile(filepath: string): boolean {
  try {
    execSync(`node ${filepath} --help`);
    return true;
  } catch (err) {
    return false;
  }
}

export function updateTestNameIfUsingProperties(receivedTestName?: string) {
  if (receivedTestName === undefined) {
    return undefined;
  }

  const namePropertyRegex = /(?<=\S)\\.name/g;
  const testNameWithoutNameProperty = receivedTestName.replace(namePropertyRegex, '');

  const prototypePropertyRegex = /\w*\\.prototype\\./g;
  return testNameWithoutNameProperty.replace(prototypePropertyRegex, '');
}

export function resolveConfigPathOrMapping(
  configPathOrMapping: string | Record<string, string> | undefined,
  targetPath: string,
): string | undefined {
  if (['string', 'undefined'].includes(typeof configPathOrMapping)) {
    return configPathOrMapping as string | undefined;
  }
  for (const [key, value] of Object.entries(configPathOrMapping as Record<string, string>)) {
    const isMatch = mm.matcher(key);
    // try the glob against normalized and non-normalized path
    if (isMatch(targetPath) || isMatch(normalizePath(targetPath))) {
      return normalizePath(value);
    }
  }
  if (Object.keys(configPathOrMapping).length > 0) {
    vscode.window.showWarningMessage(
      `None of the glob patterns in the configPath mapping matched the target file. Make sure you're using correct glob pattern syntax. Jest-runner uses the same library (micromatch) for evaluating glob patterns as Jest uses to evaluate it's 'testMatch' configuration.`,
    );
  }

  return undefined;
}

/**
 * Traverse from starting path to and including ancestor path calling the callback function with each path.
 * If the callback function returns a non-falsy value, the traversal will stop and the value will be returned.
 * Returns false if the traversal completes without the callback returning a non-false value.
 * @param ancestorPath
 * @param startingPath
 * @param callback <T>(currentFolderPath: string) => false | T
 */
export function searchPathToParent<T>(
  startingPath: string,
  ancestorPath: string,
  callback: (currentFolderPath: string) => false | undefined | null | 0 | T,
) {
  let currentFolderPath = fs.statSync(startingPath).isDirectory() ? startingPath : path.dirname(startingPath);
  const endPath = path.dirname(ancestorPath);
  const resolvedStart = path.resolve(currentFolderPath);
  const resolvedEnd = path.resolve(endPath);
  // this might occur if you've opened a file outside of the workspace
  if (!resolvedStart.startsWith(resolvedEnd)) {
    return false;
  }

  // prevent edge case of workdir at root path ie, '/' -> '..' -> '/'
  let lastPath: null | string = null;
  do {
    const result = callback(currentFolderPath);
    if (result) {
      return result;
    }
    lastPath = currentFolderPath;
    currentFolderPath = path.dirname(currentFolderPath);
  } while (currentFolderPath !== endPath && currentFolderPath !== lastPath);

  return false;
}
