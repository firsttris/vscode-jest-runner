import * as path from 'path';
import { CommandBuilder } from '../../commandBuilder';
import { IJestRunnerCommandBuilderConfig } from '../../jestRunnerConfig';
import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { Shell, getArgsForShell, getCommandPrefix, getFileExtension } from './shellHandler';

const jestRunnerConfig: IJestRunnerCommandBuilderConfig = {
  jestCommand: 'node "node_modules/jest/bin/jest.js"',
  getJestConfigPath: function (filePath: string): string {
    return '';
  },
};
const testFileName = path.resolve(__dirname, '..', '..', '..', 'examples', 'examples.test.ts');
const packageJsonDirectory = getPackageJsonDirectory();

export async function runJestCommand(shell: Shell, tempDir: string, testName: string) {
  const commandBuilder = new CommandBuilder(jestRunnerConfig);
  const command = commandBuilder.buildJestCommand(testFileName, testName, ['--json']);
  const testFilePath = path.resolve(tempDir, 'mytest' + getFileExtension(shell));
  writeFileSync(testFilePath, getCommandPrefix(shell) + command);
  const result = spawnSync(shell, getArgsForShell(shell, testFilePath), { cwd: packageJsonDirectory });

  const stdOutString = result.stdout.toString();
  const stdErrString = result.stderr.toString();

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}). command: ${command}.
  STDERR:
  ${stdErrString}
  
  STDOUT:
  ${stdOutString}`
    );
  }

  return parseJsonFromStdout(command, stdOutString);
}

function parseJsonFromStdout(command: string, stdOutString: string) {
  let outputJSON;
  try {
    outputJSON = JSON.parse(stdOutString);
  } catch (e) {
    throw new Error(`Failed to parse output: ${stdOutString}. Command: \`${command}\`\n. Error: ${e}`);
  }

  const passedTests = new Array<string>();
  for (const testResult of outputJSON.testResults) {
    for (const assertionResult of testResult.assertionResults) {
      if (assertionResult.status === 'passed') {
        passedTests.push(assertionResult.title);
      }
    }
  }

  return {
    numPassedTests: outputJSON.numPassedTests,
    numFailedTests: outputJSON.numFailedTests,
    numPendingTests: outputJSON.numPendingTests,
    passedTests,
  };
}

function getPackageJsonDirectory() {
  const packageJsonDir = path.dirname(require.resolve('../../../package.json'));
  return packageJsonDir;
}
