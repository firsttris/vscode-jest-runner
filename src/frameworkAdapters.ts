import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getReporterPaths } from './reporters/reporterPaths';
import type { TestFrameworkName } from './testDetection/frameworkDefinitions';
import { UniqueArgument } from './utils/ArgUtils';
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

	const args = new UniqueArgument();

	const filePathArg = q(escapeRegExpForPath(normalizePath(filePath)));
	args.append(filePathArg);

	if (configPath) {
		args.append('-c', q(normalizePath(configPath)));
	}

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.append('-t', resolved);
	}

	args.append(options, runOptions);

	return args.toArray();
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

	const args = new UniqueArgument();

	if (!hasWatchMode) {
		args.append('run');
	}

	const filePathArg = [q(normalizePath(resolve(filePath)))];
	args.append(filePathArg);

	if (configPath) {
		args.append('--config', q(normalizePath(configPath)));
	}

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.append('-t', resolved);
	}

	args.append(normalizeVitestOptions(options, hasWatchMode));

	if (runOptions) {
		args.append(normalizeVitestOptions(runOptions, hasWatchMode));
	}

	return args.toArray();
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

	const args = new UniqueArgument('--test');

	if (options.includes('--jtr-structured') || options.includes('--coverage')) {
		const reporters = getReporterPaths();
		const reporterPath = isWindows()
			? pathToFileURL(reporters.node).href
			: reporters.node;

		args.append(
			'--test-reporter',
			quote(reporterPath),
			'--test-reporter-destination',
			'stdout',
		);

		const jtrIndex = options.indexOf('--jtr-structured');
		if (jtrIndex !== -1) {
			options.splice(jtrIndex, 1);
		}
	}

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.append('--test-name-pattern', resolved);
	}

	args.append(options, runOptions);

	if (args.includes('--coverage')) {
		args.append('--experimental-test-coverage');
		args.append('--test-reporter', 'tap');
		args.append('--test-reporter-destination', 'stdout');
		args.append('--test-reporter', 'lcov');
		args.append('--test-reporter-destination', 'lcov.info');

		args.remove('--coverage');
	}

	args.append(q(normalizePath(filePath)));

	return args.toArray();
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

	const args = new UniqueArgument('test');

	if (options.includes('--coverage')) {
		args.append('--coverage');
		args.append('--coverage-reporter=lcov');
		args.remove('--coverage');
	}

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.append('-t', resolved);
	}

	args.append(options, runOptions);

	args.append(q(normalizePath(filePath)));

	return args.toArray();
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

	const args = new UniqueArgument('test', '--allow-all');

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.append('--filter', resolved);
	}

	args.append('--junit-path=.deno-report.xml');

	args.append(options, runOptions);

	if (args.includes('--coverage')) {
		args.append('--coverage=coverage');
		args.remove('--coverage');
	}

	args.append(q(normalizePath(filePath)));

	return args.toArray();
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
	const args = new UniqueArgument('test');

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		if (testName) {
			const rawName = testName.includes('%')
				? resolveTestNameStringInterpolation(testName)
				: testName;
			const final = withQuotes ? quote(escapeSingleQuotes(rawName)) : rawName;
			args.append('-g', final);
		}
	}

	args.append(options, runOptions);
	args.append(q(normalizePath(filePath)));

	return args.toArray();
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
	const args = new UniqueArgument();

	if (configPath) {
		args.append('--config', q(normalizePath(configPath)));
	}

	args.append(q(normalizePath(filePath)));

	const resolved = prepareTestName(testName, withQuotes);
	if (resolved) {
		args.append('-t', resolved);
	}

	args.append(options, runOptions);

	return args.toArray();
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
