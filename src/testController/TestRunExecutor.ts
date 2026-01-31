import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import { CoverageProvider, DetailedFileCoverage } from '../coverageProvider';
import {
    executeTestCommand,
    executeTestCommandFast,
    collectTestsByFile,
    buildTestArgs,
    buildTestArgsFast,
    canUseFastMode,
    logTestExecution,
} from '../testExecution';
import { processTestResults } from '../testResultProcessor';
import { getTestFrameworkForFile } from '../testDetection/testFileDetection';
import { parseShellCommand } from '../utils/ShellUtils';
import { escapeRegExp, updateTestNameIfUsingProperties } from '../utils/TestNameUtils';
import { logInfo, logError } from '../utils/Logger';

export class TestRunExecutor {
    constructor(
        private readonly testController: vscode.TestController,
        private readonly testRunnerConfig: TestRunnerConfig,
        private readonly coverageProvider: CoverageProvider
    ) { }

    public async runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
        additionalArgs: string[] = []
    ): Promise<void> {
        return this.executeTests(request, token, additionalArgs, false);
    }

    public async coverageHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ): Promise<void> {
        return this.executeTests(request, token, [], true);
    }

    public async loadDetailedCoverage(
        testRun: vscode.TestRun,
        fileCoverage: vscode.FileCoverage,
        token: vscode.CancellationToken
    ): Promise<vscode.FileCoverageDetail[]> {
        if (fileCoverage instanceof DetailedFileCoverage) {
            return this.coverageProvider.loadDetailedCoverage(fileCoverage, token);
        }
        return [];
    }

    private async executeTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
        additionalArgs: string[] = [],
        collectCoverage: boolean = false
    ): Promise<void> {
        const run = this.testController.createTestRun(request);
        const testsByFile = collectTestsByFile(request, this.testController);

        testsByFile.forEach((tests) => {
            tests.forEach((test) => run.started(test));
        });

        if (token.isCancellationRequested) {
            run.end();
            return;
        }

        try {
            const allFiles = Array.from(testsByFile.keys());
            const allTests = Array.from(testsByFile.values()).flat();

            if (allFiles.length === 0) {
                run.end();
                return;
            }

            const workspaceFolder = vscode.workspace.getWorkspaceFolder(
                vscode.Uri.file(allFiles[0])
            )?.uri.fsPath;

            if (!workspaceFolder) {
                allTests.forEach((test) =>
                    run.failed(
                        test,
                        new vscode.TestMessage('Could not determine workspace folder')
                    )
                );
                run.end();
                return;
            }

            const framework = getTestFrameworkForFile(allFiles[0]) || 'jest';
            const isVitest = framework === 'vitest';
            const isNodeTest = framework === 'node-test';

            const configPath = isVitest
                ? this.testRunnerConfig.getVitestConfigPath(allFiles[0])
                : this.testRunnerConfig.getJestConfigPath(allFiles[0]);

            const testCommand = this.testRunnerConfig.getTestCommand(allFiles[0]);
            const commandParts = parseShellCommand(testCommand);
            const command = commandParts[0];

            const esmEnv = isVitest || isNodeTest ? undefined : this.testRunnerConfig.getEnvironmentForRun(allFiles[0]);

            // Fast mode: single test without coverage - skip JSON parsing
            if (canUseFastMode(testsByFile, collectCoverage) && additionalArgs.length === 0) {
                const test = allTests[0];
                const testName = escapeRegExp(updateTestNameIfUsingProperties(test.label));
                const args = buildTestArgsFast(allFiles[0], testName, framework, this.testRunnerConfig);
                const commandArgs = [...commandParts.slice(1), ...args];

                logInfo(`Running fast mode: ${command} ${commandArgs.join(' ')}`);

                await executeTestCommandFast(
                    command,
                    commandArgs,
                    token,
                    test,
                    run,
                    this.testRunnerConfig.cwd,
                    esmEnv
                );

                run.end();
                return;
            }

            // Standard mode: use JSON output for multiple tests or coverage
            const args = buildTestArgs(
                allFiles,
                testsByFile,
                framework,
                additionalArgs,
                collectCoverage,
                this.testRunnerConfig,
                this.testController
            );

            const commandArgs = [...commandParts.slice(1), ...args];

            logTestExecution(
                framework,
                command,
                commandArgs,
                allTests.length,
                allFiles.length,
                !!esmEnv
            );

            const output = await executeTestCommand(
                command,
                commandArgs,
                token,
                allTests,
                run,
                this.testRunnerConfig.cwd,
                esmEnv
            );

            if (output === null) {
                run.end();
                return;
            }

            processTestResults(output, allTests, run, framework);

            if (collectCoverage && workspaceFolder) {
                await this.processCoverageData(
                    run,
                    workspaceFolder,
                    isVitest ? 'vitest' : 'jest',
                    configPath
                );
            }
        } catch (error) {
            const errOutput =
                error instanceof Error
                    ? error.message
                    : error
                        ? String(error)
                        : 'Test execution failed';
            testsByFile.forEach((tests) => {
                tests.forEach((test) =>
                    run.failed(test, new vscode.TestMessage(errOutput))
                );
            });
        }

        run.end();
    }

    private async processCoverageData(
        run: vscode.TestRun,
        workspaceFolder: string,
        framework: 'jest' | 'vitest' = 'jest',
        configPath?: string
    ): Promise<void> {
        try {
            const coverageMap = await this.coverageProvider.readCoverageFromFile(
                workspaceFolder,
                framework,
                configPath
            );

            if (!coverageMap) {
                logInfo(`No coverage data found. Make sure coverageReporters includes "json" in your ${framework} config.`);
                return;
            }

            const fileCoverages = this.coverageProvider.convertToVSCodeCoverage(
                coverageMap,
                workspaceFolder
            );

            logInfo(`Adding coverage for ${fileCoverages.length} files`);

            for (const fileCoverage of fileCoverages) {
                run.addCoverage(fileCoverage);
            }
        } catch (error) {
            logError('Failed to process coverage data', error);
        }
    }
}
