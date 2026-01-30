import { basename, dirname, resolve } from 'node:path';
import { matcher } from 'micromatch';
import { statSync }  from 'node:fs';
import * as vscode from 'vscode';

import type { ParsedNode } from 'jest-editor-support';

const IS_WINDOWS = process.platform.includes('win32');
let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Jest Runner');
  }
  return outputChannel;
}

export function logInfo(message: string): void {
  const timestamp = new Date().toISOString();
  getOutputChannel().appendLine(`[${timestamp}] [INFO] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  const errorDetails =
    error instanceof Error ? error.stack || error.message : String(error);
  getOutputChannel().appendLine(
    `[${timestamp}] [ERROR] ${message}${error ? ': ' + errorDetails : ''}`,
  );
}

export function logWarning(message: string): void {
  const timestamp = new Date().toISOString();
  getOutputChannel().appendLine(`[${timestamp}] [WARN] ${message}`);
}

export function logDebug(message: string): void {
  const config = vscode.workspace.getConfiguration('jestrunner');
  const enableDebugLogs = config.get<boolean>('enableDebugLogs', false);
  if (enableDebugLogs) {
    const timestamp = new Date().toISOString();
    getOutputChannel().appendLine(`[${timestamp}] [DEBUG] ${message}`);
  }
}

export interface TestNode extends ParsedNode {
  name: string;
  children?: TestNode[];
}

export function getDirName(filePath: string): string {
  return dirname(filePath);
}

export function getFileName(filePath: string): string {
  return basename(filePath);
}

export function isWindows(): boolean {
  return IS_WINDOWS;
}

export function normalizePath(path: string): string {
  return IS_WINDOWS ? path.replace(/\\/g, '/') : path;
}

export function escapeRegExp(s: string): string {
  const escapedString = s.replace(/[.*+?^${}<>()|[\]\\]/g, '\\$&');
  return escapedString.replace(/\\\(\\\.\\\*\\\?\\\)/g, '(.*?)');
}

export function escapeRegExpForPath(s: string): string {
  return s.replace(/[.*+?^${}<>()|[\]\\]/g, '\\$&');
}

export function findFullTestName(
  selectedLine: number,
  children: TestNode[],
): string | undefined {
  if (!children) {
    return;
  }
  for (const element of children) {
    if (element.type === 'describe' && selectedLine === element.start.line) {
      return resolveTestNameStringInterpolation(element.name);
    }
    if (
      element.type !== 'describe' &&
      selectedLine >= element.start.line &&
      selectedLine <= element.end.line
    ) {
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

const QUOTES = new Set(['"', "'", '`']);

export function resolveTestNameStringInterpolation(s: string): string {
  const variableRegex = /(\${?[A-Za-z0-9_]+}?|%[psdifjo#%])/gi;
  const matchAny = '(.*?)';
  return s.replace(variableRegex, matchAny);
}

export function escapeSingleQuotes(s: string): string {
  return IS_WINDOWS ? s : s.replace(/'/g, "'\\''");
}

export function quote(s: string): string {
  const q = IS_WINDOWS ? '"' : `'`;
  return `${q}${s}${q}`;
}

export function unquote(s: string): string {
  if (QUOTES.has(s[0])) {
    s = s.substring(1);
  }

  if (QUOTES.has(s[s.length - 1])) {
    s = s.substring(0, s.length - 1);
  }

  return s;
}

export function pushMany<T>(arr: T[], items: T[]): number {
  return Array.prototype.push.apply(arr, items);
}

export type CodeLensOption =
  | 'run'
  | 'debug'
  | 'watch'
  | 'coverage'
  | 'current-test-coverage';

function isCodeLensOption(option: string): option is CodeLensOption {
  return [
    'run',
    'debug',
    'watch',
    'coverage',
    'current-test-coverage',
  ].includes(option);
}

export function validateCodeLensOptions(
  maybeCodeLensOptions: string[],
): CodeLensOption[] {
  return [...new Set(maybeCodeLensOptions)].filter((value) =>
    isCodeLensOption(value),
  ) as CodeLensOption[];
}

export function updateTestNameIfUsingProperties(receivedTestName?: string) {
  if (receivedTestName === undefined) {
    return undefined;
  }

  return receivedTestName
    .replace(/(?<=\S)\\.name/g, '')
    .replace(/\w*\\.prototype\\./g, '');
}

export function resolveConfigPathOrMapping(
  configPathOrMapping: string | Record<string, string> | undefined,
  targetPath: string,
): string | undefined {
  if (['string', 'undefined'].includes(typeof configPathOrMapping)) {
    return configPathOrMapping as string | undefined;
  }
  for (const [key, value] of Object.entries(
    configPathOrMapping as Record<string, string>,
  )) {
    const isMatch = matcher(key);
    if (isMatch(targetPath) || isMatch(normalizePath(targetPath))) {
      return normalizePath(value);
    }
  }
  if (Object.keys(configPathOrMapping).length > 0) {
    logDebug(`No glob pattern in configPath mapping matched: ${targetPath}`);
  }
  return undefined;
}

export function searchPathToParent<T>(
  startingPath: string,
  ancestorPath: string,
  callback: (currentFolderPath: string) => false | undefined | null | 0 | T,
) {
  let currentFolderPath: string;
  try {
    currentFolderPath = statSync(startingPath).isDirectory()
      ? startingPath
      : dirname(startingPath);
  } catch (error) {
    logWarning(
      `Could not access ${startingPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    currentFolderPath = dirname(startingPath);
  }

  const endPath = dirname(ancestorPath);
  const resolvedStart = resolve(currentFolderPath);
  const resolvedEnd = resolve(endPath);
  if (!resolvedStart.startsWith(resolvedEnd)) {
    return false;
  }

  let lastPath: null | string = null;
  do {
    const result = callback(currentFolderPath);
    if (result) {
      return result;
    }
    lastPath = currentFolderPath;
    currentFolderPath = dirname(currentFolderPath);
  } while (currentFolderPath !== endPath && currentFolderPath !== lastPath);

  return false;
}

/**
 * Strip ANSI escape codes from a string (for clean error messages)
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

export function parseShellCommand(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    args.push(current);
  }

  return args;
}
