import { pathToFileURL } from 'node:url';
import type * as vscode from 'vscode';
import { getReporterPaths } from '../reporters/reporterPaths';
import type { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { isWindows, normalizePath } from '../utils/PathUtils';
import {
  escapeSingleQuotes,
  quote,
  toTestItemNamePattern,
} from '../utils/TestNameUtils';

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
      args.push('--test-name-pattern', quote(escapeSingleQuotes(testName)));
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
    if (allFiles.length !== 1) return false;

    const fileItem = this.testController.items.get(allFiles[0]);
    const totalTestsInFile = fileItem?.children.size ?? 0;
    const tests = testsByFile.get(allFiles[0]);

    return !!tests && tests.length < totalTestsInFile;
  }
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

    // Only add filter for partial runs (specific tests selected)
    if (testName && this.isPartialRun(allFiles, testsByFile)) {
      args.push('--filter', quote(escapeSingleQuotes(testName)));
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
