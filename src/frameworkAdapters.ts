import { TestFrameworkName } from './testDetection/frameworkDefinitions';
import { escapeRegExpForPath, normalizePath } from './utils/PathUtils';
import { escapeSingleQuotes, quote, resolveTestNameStringInterpolation } from './utils/TestNameUtils';
import { getReporterPaths } from './reporters/reporterPaths';

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

  // Add the structured reporter if we're in "batch mode" (multiple tests or need JSON output)
  // or if coverage is requested (we need structured output to report results)
  if (options.includes('--jtr-structured') || options.includes('--coverage')) {
    const reporters = getReporterPaths();
    args.push('--test-reporter', reporters.node, '--test-reporter-destination', 'stdout');

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
    // Remove --coverage from args as it's not a native node flag (it's our internal flag)
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

  // Add coverage flags if requested
  if (options.includes('--coverage')) {
    args.push('--coverage');
    // Bun defaults to lcov when --coverage is used, but specifying it explicitly ensures lcov.info is generated
    // However, Bun v1.0.0+ might need specific flags. 
    // Bun docs: bun test --coverage. Defaults to printing to stdout.
    // To generate lcov.info, we might need configuration or specific flags. 
    // Wait, bun test --coverage generates detailed capability. 
    // The user mentioned LCOV is the way.
    // Looking at Bun docs (or common knowledge): `bun test --coverage --coverage-reporter=lcov` works.
    args.push('--coverage-reporter=lcov');

    // Remove --coverage from options to avoiding dupes if it was passed via options
    // Actually options usually contains --coverage if passed from TestArgumentBuilder
    const coverageIndex = options.indexOf('--coverage');
    if (coverageIndex !== -1) {
      // We keep it in args above, but remove from options merged below?
      // mergeOptions does a Set merge.
      // It's cleaner to remove it from the options array we pass to mergeOptions if we handled it manually.
      // options is passed by reference? No, usually a copy in caller or we splice it.
      // Let's safe-splice a copy.
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
  const args = ['test', '--allow-all']; // Deno needs permissions, allow-all is a safe default for local tests

  // Use TAP reporter for Deno to make it compatible with existing parsers if possible, 
  // or we can rely on standard output if we write a parser. 
  // For now, let's stick to default or user provided options.
  // Actually, implementation plan said use tap.
  // args.push('--reporter=tap'); // Removed to let user control via runOptions or default, but we might enforce it later if parsing depends on it.

  const resolved = prepareTestName(testName, withQuotes);
  if (resolved) {
    args.push('--filter', resolved);
  }

  return [...args, ...mergeOptions(options, runOptions), q(normalizePath(filePath))];
};

const adapters: Record<TestFrameworkName, BuildArgsFn> = {
  'jest': buildJestArgs,
  'vitest': buildVitestArgs,
  'node-test': buildNodeTestArgs,
  'bun': buildBunArgs,
  'deno': buildDenoArgs,
};

export const getFrameworkAdapter = (framework: TestFrameworkName) => ({
  buildArgs: adapters[framework],
});
