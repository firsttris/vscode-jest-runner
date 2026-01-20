import * as path from 'node:path';
import * as mm from 'micromatch';
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { ParsedNode } from 'jest-editor-support';
import { isTestFile } from './testDetection';

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Jest Runner');
  }
  return outputChannel;
}

export function logInfo(message: string): void {
  getOutputChannel().appendLine(`[INFO] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  const errorDetails =
    error instanceof Error ? error.stack || error.message : String(error);
  getOutputChannel().appendLine(
    `[ERROR] ${message}${error ? ': ' + errorDetails : ''}`,
  );
}

export function logWarning(message: string): void {
  getOutputChannel().appendLine(`[WARN] ${message}`);
}

export function logDebug(message: string): void {
  const config = vscode.workspace.getConfiguration('jestrunner');
  const enableDebugLogs = config.get<boolean>('enableDebugLogs', false);
  if (enableDebugLogs) {
    getOutputChannel().appendLine(`[DEBUG] ${message}`);
  }
}

export interface TestNode extends ParsedNode {
  name: string;
  children?: TestNode[];
}

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

const QUOTES = {
  '"': true,
  "'": true,
  '`': true,
};

export function resolveTestNameStringInterpolation(s: string): string {
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

  const namePropertyRegex = /(?<=\S)\\.name/g;
  const testNameWithoutNameProperty = receivedTestName.replace(
    namePropertyRegex,
    '',
  );

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
  for (const [key, value] of Object.entries(
    configPathOrMapping as Record<string, string>,
  )) {
    const isMatch = mm.matcher(key);
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

export function searchPathToParent<T>(
  startingPath: string,
  ancestorPath: string,
  callback: (currentFolderPath: string) => false | undefined | null | 0 | T,
) {
  let currentFolderPath: string;
  try {
    currentFolderPath = fs.statSync(startingPath).isDirectory()
      ? startingPath
      : path.dirname(startingPath);
  } catch (error) {
    logWarning(
      `Could not access ${startingPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    currentFolderPath = path.dirname(startingPath);
  }

  const endPath = path.dirname(ancestorPath);
  const resolvedStart = path.resolve(currentFolderPath);
  const resolvedEnd = path.resolve(endPath);
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
    currentFolderPath = path.dirname(currentFolderPath);
  } while (currentFolderPath !== endPath && currentFolderPath !== lastPath);

  return false;
}

export function shouldIncludeFile(
	filePath: string,
	workspaceFolderPath: string,
): boolean {
	const config = vscode.workspace.getConfiguration('jestrunner');
	const include = config.get<string[]>('include', []);
	const exclude = config.get<string[]>('exclude', []);

	// If no custom include/exclude patterns are configured, use the framework-based detection
	if (include.length === 0 && exclude.length === 0) {
		return isTestFile(filePath);
	}

	// Custom patterns are configured - use them relative to workspace
	const normalizedPath = normalizePath(filePath);
	const normalizedFolderPath = normalizePath(workspaceFolderPath);

	const relativePath = path.relative(normalizedFolderPath, normalizedPath);

	if (include.length > 0) {
		const includeMatch =
			mm.isMatch(relativePath, include) || mm.isMatch(normalizedPath, include);
		if (!includeMatch) {
			return false;
		}
	}

	if (exclude.length > 0) {
		const excludeMatch =
			mm.isMatch(relativePath, exclude) || mm.isMatch(normalizedPath, exclude);
		if (excludeMatch) {
			return false;
		}
	}

	return true;
}
