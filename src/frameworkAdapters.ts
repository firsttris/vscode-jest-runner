import { TestFrameworkName } from './testDetection/frameworkDefinitions';
import { escapeRegExpForPath, normalizePath, isWindows } from './utils/PathUtils';
import { escapeSingleQuotes, quote, resolveTestNameStringInterpolation } from './utils/TestNameUtils';
import { getReporterPaths } from './reporters/reporterPaths';
import { pathToFileURL } from 'node:url';

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

  if (options.includes('--jtr-structured') || options.includes('--coverage')) {
    const reporters = getReporterPaths();
    const reporterPath = isWindows() ? pathToFileURL(reporters.node).href : reporters.node;
    args.push('--test-reporter', quote(reporterPath), '--test-reporter-destination', 'stdout');

    const jtrIndex = options.indexOf('--jtr-structured');
    if (jtrIndex !== -1) {
      options.splice(jtrIndex, 1);
    }
  }

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
    const coverageIndex = allOptions.indexOf('--coverage');
    if (coverageIndex > -1) {
      allOptions.splice(coverageIndex, 1);
    }
  }

  return [...args, ...allOptions, q(normalizePath(filePath))];
};

const buildBunArgs: BuildArgsFn = (filePath, testName, withQuotes, options, _configPath, runOptions) => {
  const q = withQuotes ? quote : (s: string) => s;
  const args = ['test'];


  if (options.includes('--coverage')) {
    args.push('--coverage');
    args.push('--coverage-reporter=lcov');
    const coverageIndex = options.indexOf('--coverage');
    if (coverageIndex !== -1) {
      options.splice(coverageIndex, 1);
    }
  }

  const resolved = prepareTestName(testName, withQuotes);
  if (resolved) {
    args.push('-t', resolved);
  }

  return [...args, ...mergeOptions(options, runOptions), q(normalizePath(filePath))];
};

const buildDenoArgs: BuildArgsFn = (filePath, testName, withQuotes, options, _configPath, runOptions) => {
  const q = withQuotes ? quote : (s: string) => s;
  const args = ['test', '--allow-all'];
  const resolved = prepareTestName(testName, withQuotes);
  if (resolved) {
    args.push('--filter', resolved);
  }

  args.push('--junit-path=.deno-report.xml');

  if (options.includes('--coverage')) {
    args.push('--coverage=coverage');
    const coverageIndex = options.indexOf('--coverage');
    if (coverageIndex !== -1) {
      options.splice(coverageIndex, 1);
    }
  }

  return [...args, ...mergeOptions(options, runOptions), q(normalizePath(filePath))];
};

const buildPlaywrightArgs: BuildArgsFn = (filePath, testName, withQuotes, options, _configPath, runOptions) => {
  const q = withQuotes ? quote : (s: string) => s;
  const args = ['test'];

  const resolved = prepareTestName(testName, withQuotes);
  if (resolved) {

    if (testName) {
      const rawName = testName.includes('%') ? resolveTestNameStringInterpolation(testName) : testName;
      const final = withQuotes ? quote(escapeSingleQuotes(rawName)) : rawName;
      args.push('-g', final);
    }
  }

  return [...args, ...mergeOptions(options, runOptions), q(normalizePath(filePath))];
};

const adapters: Record<TestFrameworkName, BuildArgsFn> = {
  'jest': buildJestArgs,
  'vitest': buildVitestArgs,
  'node-test': buildNodeTestArgs,
  'bun': buildBunArgs,
  'deno': buildDenoArgs,
  'playwright': buildPlaywrightArgs,
};

export const getFrameworkAdapter = (framework: TestFrameworkName) => ({
  buildArgs: adapters[framework],
});
