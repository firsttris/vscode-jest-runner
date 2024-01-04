import { IJestRunnerCommandBuilderConfig } from './jestRunnerConfig';
import {
  escapeRegExp,
  escapeRegExpForPath,
  escapeQuotesInTestName,
  normalizePath,
  quote,
  resolveTestNameStringInterpolation,
  updateTestNameIfUsingProperties,
} from './util';

export class CommandBuilder {
  constructor(private readonly config: IJestRunnerCommandBuilderConfig) {}

  buildJestCommand(filePath: string, testName?: string, options?: string[]): string {
    const args = this.buildJestArgs(filePath, testName, options);
    return `${this.config.jestCommand} ${args.join(' ')}`;
  }

  buildJestArgs(filePath: string, testName: string | undefined, options: string[] = []): string[] {
    const args: string[] = [];

    args.push(quote(escapeRegExpForPath(normalizePath(filePath))));

    const jestConfigPath = this.config.getJestConfigPath(filePath);
    if (jestConfigPath) {
      args.push('-c');
      args.push(quote(normalizePath(jestConfigPath)));
    }

    if (testName) {
      args.push('-t');
      testName = resolveTestName(testName);
      args.push(quote(testName));
    }

    const setOptions = new Set(options);

    if (this.config.runOptions) {
      this.config.runOptions.forEach((option) => setOptions.add(option));
    }

    args.push(...setOptions);

    return args;
  }
}

function resolveTestName(testName: string): string {
  testName = updateTestNameIfUsingProperties(testName);
  testName = resolveTestNameStringInterpolation(testName);
  testName = escapeRegExp(testName);
  testName = escapeQuotesInTestName(testName);
  testName = testName.replace(/\n/g, '\\n');
  testName = testName.replace(/\r/g, '\\r');
  return testName;
}
