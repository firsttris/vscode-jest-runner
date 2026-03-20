import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getReporterPaths } from './reporters/reporterPaths';
import type { TestFrameworkName } from './testDetection/frameworkDefinitions';
import {
	appendUniqueArgs,
	prependUniqueArgs,
} from './utils/ArgUtils';
import {
	escapeRegExpForPath,
	isWindows,
	normalizePath,
} from './utils/PathUtils';
import {
	escapeSingleQuotes,
	quote,
	resolveTestNameStringInterpolation,
} from './utils/TestNameUtils';

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

const isVitestWatchOption = (option: string): boolean =>
	option === '--watch' || option === '-w' || option.startsWith('--watch=');

const normalizeVitestOptions = (
	options: string[],
	hasWatchMode: boolean,
): string[] =>
	hasWatchMode ? options.filter((option) => option !== 'run') : options;

const buildJestArgs: BuildArgsFn = (
	filePath,
	testName,
	withQuotes,
	options,
	configPath,
	runOptions,
) => {
	const q = withQuotes ? quote : (s: string) => s;
	const args = [q(escapeRegExpForPath(normalizePath(filePath)))];

	if (configPath) {
		args.push('-c', q(normalizePath(configPath)));
	}

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.push('-t', resolved);
	}

	return appendUniqueArgs(args, options, runOptions);
};

const buildVitestArgs: BuildArgsFn = (
	filePath,
	testName,
	withQuotes,
	options,
	configPath,
	runOptions,
) => {
	const q = withQuotes ? quote : (s: string) => s;
	const hasWatchMode =
		options.some(isVitestWatchOption) ||
		(runOptions?.some(isVitestWatchOption) ?? false);
	const allOptions = appendUniqueArgs(
		normalizeVitestOptions(options, hasWatchMode),
		runOptions ? normalizeVitestOptions(runOptions, hasWatchMode) : null,
	);
	const args = [q(normalizePath(resolve(filePath)))];
	const maybeRunArgs = hasWatchMode
		? args
		: prependUniqueArgs(args, ['run']);

	if (configPath) {
		maybeRunArgs.push('--config', q(normalizePath(configPath)));
	}

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		maybeRunArgs.push('-t', resolved);
	}

	return appendUniqueArgs(maybeRunArgs, allOptions);
};

const buildNodeTestArgs: BuildArgsFn = (
	filePath,
	testName,
	withQuotes,
	options,
	_configPath,
	runOptions,
) => {
	const q = withQuotes ? quote : (s: string) => s;
	const args = ['--test'];
	const withStructuredOutput =
		options.includes('--jtr-structured') || options.includes('--coverage');

	if (withStructuredOutput) {
		const reporters = getReporterPaths();
		const reporterPath = isWindows()
			? pathToFileURL(reporters.node).href
			: reporters.node;

		args.push(
			'--test-reporter',
			quote(reporterPath),
			'--test-reporter-destination',
			'stdout',
		);
	}

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.push('--test-name-pattern', resolved);
	}

	const allOptions = appendUniqueArgs(
		options.filter((option) => option !== '--jtr-structured'),
		runOptions,
	);
	const hasCoverage = allOptions.includes('--coverage');
	const withoutCoverage = allOptions.filter((option) => option !== '--coverage');
	const withOptions = appendUniqueArgs(args, withoutCoverage);
	const withCoverage = hasCoverage
		? appendUniqueArgs(withOptions, [
				'--experimental-test-coverage',
				'--test-reporter',
				'tap',
				'--test-reporter-destination',
				'stdout',
				'--test-reporter',
				'lcov',
				'--test-reporter-destination',
				'lcov.info',
			])
		: withOptions;

	return [...withCoverage, q(normalizePath(filePath))];
};

const buildBunArgs: BuildArgsFn = (
	filePath,
	testName,
	withQuotes,
	options,
	_configPath,
	runOptions,
) => {
	const q = withQuotes ? quote : (s: string) => s;
	const args = ['test'];
	const hasCoverage = options.includes('--coverage');

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.push('-t', resolved);
	}

	const withCoverage = hasCoverage
		? appendUniqueArgs(args, ['--coverage', '--coverage-reporter=lcov'])
		: args;
	const merged = appendUniqueArgs(
		withCoverage,
		options.filter((option) => option !== '--coverage'),
		runOptions,
	);

	return [...merged, q(normalizePath(filePath))];
};

const buildDenoArgs: BuildArgsFn = (
	filePath,
	testName,
	withQuotes,
	options,
	_configPath,
	runOptions,
) => {
	const q = withQuotes ? quote : (s: string) => s;
	const args = ['test', '--allow-all'];

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.push('--filter', resolved);
	}
	const base = appendUniqueArgs(args, ['--junit-path=.deno-report.xml']);
	const merged = appendUniqueArgs(
		base,
		options.filter((option) => option !== '--coverage'),
		runOptions,
	);
	const finalArgs = appendUniqueArgs(
		merged,
		options.includes('--coverage') || (runOptions?.includes('--coverage') ?? false)
			? ['--coverage=coverage']
			: null,
	);

	return [...finalArgs, q(normalizePath(filePath))];
};

const buildPlaywrightArgs: BuildArgsFn = (
	filePath,
	testName,
	withQuotes,
	options,
	_configPath,
	runOptions,
) => {
	const q = withQuotes ? quote : (s: string) => s;
	const args = ['test'];

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		if (testName) {
			const rawName = testName.includes('%')
				? resolveTestNameStringInterpolation(testName)
				: testName;
			const final = withQuotes ? quote(escapeSingleQuotes(rawName)) : rawName;
			args.push('-g', final);
		}
	}

	return [
		...appendUniqueArgs(args, options, runOptions),
		q(normalizePath(filePath)),
	];
};

const buildRstestArgs: BuildArgsFn = (
	filePath,
	testName,
	withQuotes,
	options,
	configPath,
	runOptions,
) => {
	const q = withQuotes ? quote : (s: string) => s;
	const args: string[] = [];

	if (configPath) {
		args.push('--config', q(normalizePath(configPath)));
	}

	args.push(q(normalizePath(filePath)));

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.push('-t', resolved);
	}

	return appendUniqueArgs(args, options, runOptions);
};

const adapters: Record<TestFrameworkName, BuildArgsFn> = {
	jest: buildJestArgs,
	vitest: buildVitestArgs,
	'node-test': buildNodeTestArgs,
	bun: buildBunArgs,
	deno: buildDenoArgs,
	playwright: buildPlaywrightArgs,
	rstest: buildRstestArgs,
};

export const getFrameworkAdapter = (framework: TestFrameworkName) => ({
	buildArgs: adapters[framework],
});
