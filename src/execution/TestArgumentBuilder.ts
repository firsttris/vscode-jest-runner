import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import { escapeRegExp, escapeSingleQuotes, quote, updateTestNameIfUsingProperties } from '../utils/TestNameUtils';
import { normalizePath } from '../utils/PathUtils';
import { getReporterPaths } from '../reporters/reporterPaths';

export function buildTestArgs(
    allFiles: string[],
    testsByFile: Map<string, vscode.TestItem[]>,
    framework: TestFrameworkName,
    additionalArgs: string[],
    collectCoverage: boolean,
    jestConfig: TestRunnerConfig,
    testController: vscode.TestController,
): string[] {
    const isVitest = framework === 'vitest';
    const isNodeTest = framework === 'node-test';
    const reporters = getReporterPaths();

    // Node.js test runner has simpler argument handling
    if (isNodeTest) {
        const args = ['--test'];

        const tests = Array.from(testsByFile.values()).flat();
        let testName: string | undefined;

        if (tests.length > 0) {
            testName = tests.length > 1
                ? `(${tests.map((test) => escapeRegExp(updateTestNameIfUsingProperties(test.label))).join('|')})`
                : escapeRegExp(updateTestNameIfUsingProperties(tests[0].label));
        }

        args.push('--test-reporter', reporters.node);
        args.push('--test-reporter-destination', 'stdout');

        if (collectCoverage) {
            args.push('--test-reporter', 'lcov');
            args.push('--test-reporter-destination', 'lcov.info');
            args.push('--experimental-test-coverage');
        }

        if (testName) {
            // Pattern must be single-quote escaped for the quote() function if it uses single quotes
            args.push('--test-name-pattern', quote(escapeSingleQuotes(testName)));
        }

        args.push(...additionalArgs);

        // Remove --coverage if it was passed in additionalArgs (as node doesn't support it)
        const coverageIndex = args.indexOf('--coverage');
        if (coverageIndex > -1) {
            args.splice(coverageIndex, 1);
        }

        // Files come LAST
        args.push(...allFiles.map(normalizePath));
        return args;
    }

    const fileItem =
        allFiles.length === 1
            ? testController.items.get(allFiles[0])
            : undefined;
    const totalTestsInFile = fileItem?.children.size ?? 0;
    const isPartialRun =
        allFiles.length === 1 &&
        testsByFile.get(allFiles[0])!.length < totalTestsInFile;

    if (isPartialRun) {
        const tests = testsByFile.get(allFiles[0])!;
        const testNamePattern =
            tests.length > 1
                ? `(${tests.map((test) => escapeRegExp(updateTestNameIfUsingProperties(test.label))).join('|')})`
                : escapeRegExp(updateTestNameIfUsingProperties(tests[0].label));

        const extraArgs = [
            ...additionalArgs,
            ...(isVitest
                ? ['--reporter=json', '--reporter=default', `--reporter=${reporters.vitest}`]
                : ['--json', '--reporters', 'default', '--reporters', reporters.jest]),
        ];

        if (collectCoverage) {
            extraArgs.push(
                '--coverage',
                isVitest ? '--coverage.reporter' : '--coverageReporters=json',
                ...(isVitest ? ['json'] : []),
            );
        }

        if (isVitest) {
            return jestConfig.buildVitestArgs(allFiles[0], testNamePattern, true, extraArgs);
        }

        return jestConfig.buildJestArgs(allFiles[0], testNamePattern, true, extraArgs);
    }

    // Full file run
    const configPath = isVitest
        ? jestConfig.getVitestConfigPath(allFiles[0])
        : jestConfig.getJestConfigPath(allFiles[0]);

    // Normalize paths for Windows compatibility (backslashes -> forward slashes)
    const normalizedFiles = allFiles.map(normalizePath);

    const args = isVitest
        ? [
            'run',
            ...normalizedFiles,
            '--reporter=json',
            '--reporter=default',
            `--reporter=${reporters.vitest}`,
        ]
        : [
            ...normalizedFiles,
            '--json',
            '--reporters',
            'default',
            '--reporters',
            reporters.jest,
        ];

    if (configPath) {
        args.push(isVitest ? '--config' : '-c', configPath);
    }

    args.push(...additionalArgs);

    if (collectCoverage) {
        if (isVitest) {
            args.push('--coverage', '--coverage.reporter', 'json');
        } else {
            args.push('--coverage', '--coverageReporters=json');
        }
    }

    return args;
}

/**
 * Build test args for fast single-test execution (no JSON output).
 * This is used when running a single test to avoid JSON serialization overhead.
 */
export function buildTestArgsFast(
    filePath: string,
    testName: string,
    _framework: TestFrameworkName,
    jestConfig: TestRunnerConfig,
): string[] {
    return jestConfig.buildTestArgs(filePath, testName, true, []);
}

/**
 * Check if a test run qualifies for fast mode (single test, no coverage).
 */
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
