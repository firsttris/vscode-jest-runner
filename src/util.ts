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

