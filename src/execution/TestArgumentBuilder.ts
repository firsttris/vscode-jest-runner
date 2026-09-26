import { pathToFileURL } from 'node:url';
import type * as vscode from 'vscode';
import { buildTestNameFilter } from '../frameworkAdapters';
import { getReporterPaths } from '../reporters/reporterPaths';
import type { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import type { TestRunnerConfig } from '../testRunnerConfig';
import {
	escapeRegExpForPath,
	isWindows,
	normalizePath,
} from '../utils/PathUtils';
import { quote, toTestItemNamePattern } from '../utils/TestNameUtils';

interface TestArgumentStrategy {
	build(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
		additionalArgs: string[],
		collectCoverage: boolean,
	): string[];
}

export function buildTestArgs(
	allFiles: string[],
	testsByFile: Map<string, vscode.TestItem[]>,
	framework: TestFrameworkName,
	additionalArgs: string[],
	collectCoverage: boolean,
	jestConfig: TestRunnerConfig,
	testController: vscode.TestController,
): string[] {
	const strategies: Record<TestFrameworkName, TestArgumentStrategy> = {
		'node-test': new NodeTestStrategy(),
		bun: new BunTestStrategy(),
		deno: new DenoTestStrategy(jestConfig, testController),
		vitest: new VitestStrategy(jestConfig, testController),
		jest: new JestStrategy(jestConfig, testController),
		playwright: new PlaywrightStrategy(jestConfig, testController),
		rstest: new RstestStrategy(jestConfig, testController),
	};

	const strategy = strategies[framework];
	if (!strategy) {
		throw new Error(`Unsupported framework: ${framework}`);
	}

	return strategy.build(allFiles, testsByFile, additionalArgs, collectCoverage);
}

abstract class BaseStrategy {
	protected getTests(
		testsByFile: Map<string, vscode.TestItem[]>,
	): vscode.TestItem[] {
		return Array.from(testsByFile.values()).flat();
	}

	protected getTestNamePattern(tests: vscode.TestItem[]): string | undefined {
		if (tests.length === 0) return undefined;

		return tests.length > 1
			? `(${tests.map((test) => toTestItemNamePattern(test)).join('|')})`
			: toTestItemNamePattern(tests[0]);
	}

	protected getNormalizedFiles(allFiles: string[]): string[] {
		return allFiles.map(normalizePath);
	}
}

class NodeTestStrategy extends BaseStrategy implements TestArgumentStrategy {
	build(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
		additionalArgs: string[],
		collectCoverage: boolean,
	): string[] {
		const reporters = getReporterPaths();
		const args = ['--test'];
		const tests = this.getTests(testsByFile);
		const testName = this.getTestNamePattern(tests);

		const reporterPath = isWindows()
			? pathToFileURL(reporters.node).href
			: reporters.node;
		args.push('--test-reporter', quote(reporterPath));
		args.push('--test-reporter-destination', 'stdout');

		if (collectCoverage) {
			args.push('--test-reporter', 'lcov');
			args.push('--test-reporter-destination', 'lcov.info');
			args.push('--experimental-test-coverage');
		}

		if (testName) {
			args.push('--test-name-pattern', quote(testName));
		}

		const filteredArgs = additionalArgs.filter((arg) => arg !== '--coverage');
		args.push(...filteredArgs);

		args.push(...this.getNormalizedFiles(allFiles).map(quote));
		return args;
	}
}

class BunTestStrategy extends BaseStrategy implements TestArgumentStrategy {
	build(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
		additionalArgs: string[],
		collectCoverage: boolean,
	): string[] {
		const args = ['test'];
		const tests = this.getTests(testsByFile);
		const testName = this.getTestNamePattern(tests);

		if (testName) {
			args.push('-t', quote(testName));
		}

		args.push('--reporter=junit');
		args.push('--reporter-outfile=.bun-report.xml');

		if (collectCoverage) {
			args.push('--coverage');
			args.push('--coverage-reporter=lcov');
		}

		args.push(...additionalArgs);

		if (allFiles.length > 0) {
			args.push(...this.getNormalizedFiles(allFiles));
		}

		return args;
	}
}

abstract class JestLikeStrategy extends BaseStrategy {
	constructor(
		protected jestConfig: TestRunnerConfig,
		protected testController: vscode.TestController,
	) {
		super();
	}

	protected isPartialRun(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
	): boolean {
		return (
			allFiles.length === 1 &&
			this.isPartiallySelected(allFiles[0], testsByFile.get(allFiles[0]))
		);
	}

	/**
	 * Name filter for a batched run, needed as soon as any file is only
	 * partially selected. Fully selected files still match, since all of
	 * their tests are part of the pattern.
	 */
	protected getBatchTestNameFilter(
		framework: TestFrameworkName,
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
	): string | undefined {
		if (!this.hasPartialSelection(allFiles, testsByFile)) return undefined;

		return buildTestNameFilter(
			framework,
			this.getTestNamePattern(this.getTests(testsByFile)),
		);
	}

	protected hasPartialSelection(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
	): boolean {
		return allFiles.some((file) =>
			this.isPartiallySelected(file, testsByFile.get(file)),
		);
	}

	private isPartiallySelected(
		filePath: string,
		tests: vscode.TestItem[] | undefined,
	): boolean {
		if (!tests || tests.length === 0) return false;

		const fileItem = this.findFileItem(filePath, tests[0]);
		if (!fileItem) return false;

		// testsByFile holds leaf tests, so compare against the file's leaves,
		// not its top-level children (which may be describe blocks).
		return tests.length < countLeafTests(fileItem);
	}

	private findFileItem(
		filePath: string,
		test: vscode.TestItem,
	): vscode.TestItem | undefined {
		// File items are nested under folder items, so walk up from the test
		// instead of looking them up at the controller root.
		for (let item = test.parent; item; item = item.parent) {
			if (item.id === filePath) return item;
		}
		return this.testController.items.get(filePath);
	}
}

function countLeafTests(item: vscode.TestItem): number {
	if (item.children.size === 0) return 1;

	let count = 0;
	item.children.forEach((child) => {
		count += countLeafTests(child);
	});
	return count;
}

class RstestStrategy extends JestLikeStrategy implements TestArgumentStrategy {
	build(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
		additionalArgs: string[],
		collectCoverage: boolean,
	): string[] {
		const coverageArgs = collectCoverage ? ['--coverage'] : [];
		const extraArgs = [...additionalArgs, ...coverageArgs, '--reporter=junit'];
		const configPath = this.jestConfig.getRstestConfigPath(allFiles[0]);

		if (this.isPartialRun(allFiles, testsByFile)) {
			const tests = testsByFile.get(allFiles[0])!;
			const testNamePattern = this.getTestNamePattern(tests)!;

			return this.jestConfig.buildRstestArgs(
				allFiles[0],
				testNamePattern,
				false,
				extraArgs,
			);
		}

		const normalizedFiles = this.getNormalizedFiles(allFiles);
		const args = [
			...normalizedFiles,
			...extraArgs,
			...(this.jestConfig.rstestRunOptions ?? []),
		];

		if (configPath) {
			args.push('--config', configPath);
		}

		const nameFilter = this.getBatchTestNameFilter(
			'rstest',
			allFiles,
			testsByFile,
		);
		if (nameFilter) {
			args.push('-t', nameFilter);
		}

		return args;
	}
}

class DenoTestStrategy
	extends JestLikeStrategy
	implements TestArgumentStrategy
{
	build(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
		additionalArgs: string[],
		collectCoverage: boolean,
	): string[] {
		const args = ['test', '--allow-all'];
		const tests = this.getTests(testsByFile);
		const testName = this.getTestNamePattern(tests);

		// Only filter when some file is not fully selected
		if (testName && this.hasPartialSelection(allFiles, testsByFile)) {
			args.push('--filter', quote(testName));
		}

		args.push('--junit-path=.deno-report.xml');

		if (collectCoverage) {
			args.push('--coverage=coverage');
		}

		args.push(...additionalArgs);

		if (allFiles.length > 0) {
			args.push(...this.getNormalizedFiles(allFiles));
		}

		return args;
	}
}

class VitestStrategy extends JestLikeStrategy implements TestArgumentStrategy {
	build(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
		additionalArgs: string[],
		collectCoverage: boolean,
	): string[] {
		const reporters = getReporterPaths();

		if (this.isPartialRun(allFiles, testsByFile)) {
			const tests = testsByFile.get(allFiles[0])!;
			const testNamePattern = this.getTestNamePattern(tests)!;

			const extraArgs = [
				...additionalArgs,
				'--reporter=json',
				'--reporter=default',
				`--reporter=${reporters.vitest}`,
			];

			if (collectCoverage) {
				extraArgs.push('--coverage', '--coverage.reporter', 'json');
			}

			return this.jestConfig.buildVitestArgs(
				allFiles[0],
				testNamePattern,
				true,
				extraArgs,
			);
		}

		const configPath = this.jestConfig.getVitestConfigPath(allFiles[0]);
		const normalizedFiles = this.getNormalizedFiles(allFiles);

		const args = [
			'run',
			...normalizedFiles,
			'--reporter=json',
			'--reporter=default',
			`--reporter=${reporters.vitest}`,
		];

		if (configPath) {
			args.push('--config', configPath);
		}

		const nameFilter = this.getBatchTestNameFilter(
			'vitest',
			allFiles,
			testsByFile,
		);
		if (nameFilter) {
			args.push('-t', nameFilter);
		}

		args.push(...additionalArgs);

		if (collectCoverage) {
			args.push('--coverage', '--coverage.reporter', 'json');
		}

		return args;
	}
}

class JestStrategy extends JestLikeStrategy implements TestArgumentStrategy {
	build(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
		additionalArgs: string[],
		collectCoverage: boolean,
	): string[] {
		const reporters = getReporterPaths();

		if (this.isPartialRun(allFiles, testsByFile)) {
			const tests = testsByFile.get(allFiles[0])!;
			const testNamePattern = this.getTestNamePattern(tests)!;

			const extraArgs = [
				...additionalArgs,
				'--json',
				'--reporters',
				'default',
				'--reporters',
				reporters.jest,
			];

			if (collectCoverage) {
				extraArgs.push('--coverage', '--coverageReporters=json');
			}

			return this.jestConfig.buildJestArgs(
				allFiles[0],
				testNamePattern,
				true,
				extraArgs,
			);
		}

		const configPath = this.jestConfig.getJestConfigPath(allFiles[0]);
		const jestPathPatterns = this.getNormalizedFiles(allFiles).map((f) =>
			escapeRegExpForPath(f),
		);

		const args = [
			...jestPathPatterns,
			'--json',
			'--reporters',
			'default',
			'--reporters',
			reporters.jest,
		];

		if (configPath) {
			args.push('-c', configPath);
		}

		const nameFilter = this.getBatchTestNameFilter(
			'jest',
			allFiles,
			testsByFile,
		);
		if (nameFilter) {
			args.push('-t', nameFilter);
		}

		args.push(...additionalArgs);

		if (collectCoverage) {
			args.push('--coverage', '--coverageReporters=json');
		}

		return args;
	}
}

class PlaywrightStrategy
	extends JestLikeStrategy
	implements TestArgumentStrategy
{
	build(
		allFiles: string[],
		testsByFile: Map<string, vscode.TestItem[]>,
		additionalArgs: string[],
		collectCoverage: boolean,
	): string[] {
		if (this.isPartialRun(allFiles, testsByFile)) {
			const tests = testsByFile.get(allFiles[0])!;
			const testNamePattern = this.getTestNamePattern(tests)!;
			return this.jestConfig.buildPlaywrightArgs(
				allFiles[0],
				testNamePattern,
				true,
				additionalArgs,
			);
		}

		const normalizedFiles = this.getNormalizedFiles(allFiles);
		const tests = this.getTests(testsByFile);
		let testNamePattern: string | undefined;
		if (tests.length > 0) {
			testNamePattern = this.getTestNamePattern(tests);
		}

		// Use buildPlaywrightArgs to get the base arguments
		// We pass the first file as a dummy to satisfy the signature
		const baseArgs = this.jestConfig.buildPlaywrightArgs(
			allFiles[0] || '',
			testNamePattern,
			true,
			additionalArgs,
		);

		// Remove the file path from the end
		baseArgs.pop();

		// Add all files
		baseArgs.push(...normalizedFiles.map((f) => quote(f)));

		return baseArgs;
	}
}

export function buildTestArgsFast(
	filePath: string,
	testName: string | undefined,
	framework: TestFrameworkName,
	jestConfig: TestRunnerConfig,
): string[] {
	if (framework === 'rstest') {
		return jestConfig.buildRstestArgs(filePath, testName, false, []);
	}

	return jestConfig.buildTestArgs(filePath, testName, true, []);
}

export function canUseFastMode(
	testsByFile: Map<string, vscode.TestItem[]>,
	collectCoverage: boolean,
): boolean {
	if (collectCoverage) return false;

	const files = Array.from(testsByFile.keys());
	if (files.length !== 1) return false;

	const tests = testsByFile.get(files[0])!;
	return tests.length === 1;
}
