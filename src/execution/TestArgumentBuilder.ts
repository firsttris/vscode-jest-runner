import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import { escapeRegExp, escapeSingleQuotes, quote, updateTestNameIfUsingProperties } from '../utils/TestNameUtils';
import { normalizePath } from '../utils/PathUtils';
import { getReporterPaths } from '../reporters/reporterPaths';

interface TestArgumentStrategy {
    build(
        allFiles: string[],
        testsByFile: Map<string, vscode.TestItem[]>,
        additionalArgs: string[],
        collectCoverage: boolean
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
        'bun': new BunTestStrategy(),
        'deno': new DenoTestStrategy(),
        'vitest': new VitestStrategy(jestConfig, testController),
        'jest': new JestStrategy(jestConfig, testController),
    };

    const strategy = strategies[framework];
    if (!strategy) {
        throw new Error(`Unsupported framework: ${framework}`);
    }

    return strategy.build(allFiles, testsByFile, additionalArgs, collectCoverage);
}

abstract class BaseStrategy {
    protected getTests(testsByFile: Map<string, vscode.TestItem[]>): vscode.TestItem[] {
        return Array.from(testsByFile.values()).flat();
    }

    protected getTestNamePattern(tests: vscode.TestItem[]): string | undefined {
        if (tests.length === 0) return undefined;
        return tests.length > 1
            ? `(${tests.map((test) => escapeRegExp(updateTestNameIfUsingProperties(test.label))).join('|')})`
            : escapeRegExp(updateTestNameIfUsingProperties(tests[0].label));
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
        collectCoverage: boolean
    ): string[] {
        const reporters = getReporterPaths();
        const args = ['--test'];
        const tests = this.getTests(testsByFile);
        const testName = this.getTestNamePattern(tests);

        args.push('--test-reporter', reporters.node);
        args.push('--test-reporter-destination', 'stdout');

        if (collectCoverage) {
            args.push('--test-reporter', 'lcov');
            args.push('--test-reporter-destination', 'lcov.info');
            args.push('--experimental-test-coverage');
        }

        if (testName) {
            args.push('--test-name-pattern', quote(escapeSingleQuotes(testName)));
        }

        const filteredArgs = additionalArgs.filter(arg => arg !== '--coverage');
        args.push(...filteredArgs);

        args.push(...this.getNormalizedFiles(allFiles));
        return args;
    }
}

class BunTestStrategy extends BaseStrategy implements TestArgumentStrategy {
    build(
        allFiles: string[],
        testsByFile: Map<string, vscode.TestItem[]>,
        additionalArgs: string[],
        collectCoverage: boolean
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

class DenoTestStrategy extends BaseStrategy implements TestArgumentStrategy {
    build(
        allFiles: string[],
        testsByFile: Map<string, vscode.TestItem[]>,
        additionalArgs: string[],
        collectCoverage: boolean
    ): string[] {
        const args = ['test', '--allow-all'];
        const tests = this.getTests(testsByFile);
        const testName = this.getTestNamePattern(tests);

        if (testName) {
            args.push('--filter', quote(escapeSingleQuotes(testName)));
        }

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

abstract class JestLikeStrategy extends BaseStrategy {
    constructor(
        protected jestConfig: TestRunnerConfig,
        protected testController: vscode.TestController
    ) {
        super();
    }

    protected isPartialRun(allFiles: string[], testsByFile: Map<string, vscode.TestItem[]>): boolean {
        if (allFiles.length !== 1) return false;

        const fileItem = this.testController.items.get(allFiles[0]);
        const totalTestsInFile = fileItem?.children.size ?? 0;
        const tests = testsByFile.get(allFiles[0]);

        return !!tests && tests.length < totalTestsInFile;
    }
}

class VitestStrategy extends JestLikeStrategy implements TestArgumentStrategy {
    build(
        allFiles: string[],
        testsByFile: Map<string, vscode.TestItem[]>,
        additionalArgs: string[],
        collectCoverage: boolean
    ): string[] {
        const reporters = getReporterPaths();

        if (this.isPartialRun(allFiles, testsByFile)) {
            const tests = testsByFile.get(allFiles[0])!;
            const testNamePattern = this.getTestNamePattern(tests)!;

            const extraArgs = [
                ...additionalArgs,
                '--reporter=json', '--reporter=default', `--reporter=${reporters.vitest}`
            ];

            if (collectCoverage) {
                extraArgs.push('--coverage', '--coverage.reporter', 'json');
            }

            return this.jestConfig.buildVitestArgs(allFiles[0], testNamePattern, true, extraArgs);
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
        collectCoverage: boolean
    ): string[] {
        const reporters = getReporterPaths();

        if (this.isPartialRun(allFiles, testsByFile)) {
            const tests = testsByFile.get(allFiles[0])!;
            const testNamePattern = this.getTestNamePattern(tests)!;

            const extraArgs = [
                ...additionalArgs,
                '--json', '--reporters', 'default', '--reporters', reporters.jest
            ];

            if (collectCoverage) {
                extraArgs.push('--coverage', '--coverageReporters=json');
            }

            return this.jestConfig.buildJestArgs(allFiles[0], testNamePattern, true, extraArgs);
        }

        const configPath = this.jestConfig.getJestConfigPath(allFiles[0]);
        const normalizedFiles = this.getNormalizedFiles(allFiles);

        const args = [
            ...normalizedFiles,
            '--json',
            '--reporters',
            'default',
            '--reporters',
            reporters.jest,
        ];

        if (configPath) {
            args.push('-c', configPath);
        }

        args.push(...additionalArgs);

        if (collectCoverage) {
            args.push('--coverage', '--coverageReporters=json');
        }

        return args;
    }
}


export function buildTestArgsFast(
    filePath: string,
    testName: string,
    _framework: TestFrameworkName,
    jestConfig: TestRunnerConfig,
): string[] {
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
