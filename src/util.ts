import { execSync } from 'child_process';

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

export function resolveTestNameStringInterpolation(s: string): string {
  const variableRegex = /(\${?[A-Za-z0-9_]+}?|%[psdifjo#%])/gi;
  const matchAny = '(.*?)';
  return s.replace(variableRegex, matchAny);
}

export function exactRegexMatch(s: string): string {
  return ['^', s, '$'].join('');
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

export function escapePlusSign(s: string): string {
  return s.replace(/[+]/g, '\\$&');
}

export type CodeLensOption = 'run' | 'debug' | 'watch';

function isCodeLensOption(option: string): option is CodeLensOption {
  return option === 'run' || option === 'debug' || option === 'watch';
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
