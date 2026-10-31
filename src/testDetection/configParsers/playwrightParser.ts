import { logError } from '../../utils/Logger';
import {
	DEFAULT_TEST_PATTERNS,
	type TestPatterns,
} from '../frameworkDefinitions';
import { parseConfigObject, readConfigFile } from './parseUtils';

const DEFAULT_PLAYWRIGHT_TEST_DIR = 'tests';

const isString = (p: unknown): p is string =>
	typeof p === 'string' && p.length > 0;

const nonEmpty = (list: string[]): string[] | undefined =>
	list.length > 0 ? list : undefined;

export function getPlaywrightConfig(
	configPath: string,
): TestPatterns[] | undefined {
	try {
		const content = readConfigFile(configPath);
		const config = configPath.endsWith('.json')
			? JSON.parse(content)
			: parseConfigObject(content);

		if (!config) return undefined;

		const { testMatch, testIgnore, testDir } = config;

		const patterns =
			typeof testMatch === 'string'
				? [testMatch]
				: Array.isArray(testMatch)
					? testMatch.map((p: any) => (typeof p === 'string' ? p : p.source))
					: testMatch instanceof RegExp
						? [testMatch.source]
						: DEFAULT_TEST_PATTERNS;

		const isRegex = testMatch instanceof RegExp;
		const ignoreList: unknown[] = Array.isArray(testIgnore)
			? testIgnore
			: testIgnore !== undefined
				? [testIgnore]
				: [];

		return [
			{
				patterns,
				isRegex,
				dir:
					typeof testDir === 'string' && testDir.length > 0
						? testDir
						: DEFAULT_PLAYWRIGHT_TEST_DIR,
				// Playwright treats string testIgnore entries as globs and only
				// RegExp entries as regular expressions.
				excludePatterns: nonEmpty(ignoreList.filter(isString)),
				ignorePatterns: nonEmpty(
					ignoreList
						.filter((p): p is RegExp => p instanceof RegExp)
						.map((p) => p.source),
				),
			},
		];
	} catch (error) {
		logError(`Error reading Playwright config file: ${configPath}`, error);
		return undefined;
	}
}

export function getPlaywrightTestDir(configPath: string): string | undefined {
	try {
		const configs = getPlaywrightConfig(configPath);
		if (!configs || configs.length === 0) {
			return undefined;
		}

		return configs[0]?.dir ?? DEFAULT_PLAYWRIGHT_TEST_DIR;
	} catch {
		return undefined;
	}
}
