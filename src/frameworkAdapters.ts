import { TestFrameworkName } from './testDetection/frameworkDefinitions';
import { escapeRegExpForPath, normalizePath } from './utils/PathUtils';
import { escapeSingleQuotes, quote, resolveTestNameStringInterpolation } from './utils/TestNameUtils';

type BuildArgsFn = (
  filePath: string,
  testName: string | undefined,
  withQuotes: boolean,
  options: string[],
  configPath: string,
  runOptions: string[] | null,
) => string[];

const prepareTestName = (
  testName: string | undefined,
  withQuotes: boolean,
): string | undefined => {
  if (!testName) return undefined;

  const resolved = testName.includes('%')
    ? resolveTestNameStringInterpolation(testName)
    : testName;

  return withQuotes ? quote(escapeSingleQuotes(resolved)) : resolved;
};

const mergeOptions = (options: string[], runOptions: string[] | null): string[] => {
  const set = new Set(options);
  runOptions?.forEach((opt) => set.add(opt));
  return [...set];
};

const buildJestArgs: BuildArgsFn = (filePath, testName, withQuotes, options, configPath, runOptions) => {
  const q = withQuotes ? quote : (s: string) => s;
  const args = [q(escapeRegExpForPath(normalizePath(filePath)))];

  if (configPath) {
    args.push('-c', q(normalizePath(configPath)));
  }

  const resolved = prepareTestName(testName, withQuotes);
  if (resolved) {
    args.push('-t', resolved);
  }

  return [...args, ...mergeOptions(options, runOptions)];
};

const buildVitestArgs: BuildArgsFn = (filePath, testName, withQuotes, options, configPath, runOptions) => {
  const q = withQuotes ? quote : (s: string) => s;
  const args = ['run', q(normalizePath(filePath))];

  if (configPath) {
    args.push('--config', q(normalizePath(configPath)));
  }

  const resolved = prepareTestName(testName, withQuotes);
  if (resolved) {
    args.push('-t', resolved);
  }

  return [...args, ...mergeOptions(options, runOptions)];
};

const buildNodeTestArgs: BuildArgsFn = (filePath, testName, withQuotes, options, _configPath, runOptions) => {
  const q = withQuotes ? quote : (s: string) => s;
  const args = ['--test'];

  const resolved = prepareTestName(testName, withQuotes);
  if (resolved) {
    args.push('--test-name-pattern', resolved);
  }

  const allOptions = mergeOptions(options, runOptions);

  if (allOptions.includes('--coverage')) {
    args.push('--experimental-test-coverage');
    args.push('--test-reporter', 'tap');
    args.push('--test-reporter-destination', 'stdout');
    args.push('--test-reporter', 'lcov');
    args.push('--test-reporter-destination', 'lcov.info');
    // Remove --coverage from args as it's not a native node flag (it's our internal flag)
    const coverageIndex = allOptions.indexOf('--coverage');
    if (coverageIndex > -1) {
      allOptions.splice(coverageIndex, 1);
    }
  }

  return [...args, ...allOptions, q(normalizePath(filePath))];
};

const adapters: Record<TestFrameworkName, BuildArgsFn> = {
  'jest': buildJestArgs,
  'vitest': buildVitestArgs,
  'node-test': buildNodeTestArgs,
};

export const getFrameworkAdapter = (framework: TestFrameworkName) => ({
  buildArgs: adapters[framework],
});
