import * as vscode from 'vscode';
import { relative } from 'node:path';
import { TestRunnerConfig } from '../testRunnerConfig';
import { CoverageProvider, DetailedFileCoverage } from '../coverageProvider';
import {
    collectTestsByFile,
} from '../execution/TestCollector';
import {
    buildTestArgs,
    buildTestArgsFast,
    canUseFastMode,
} from '../execution/TestArgumentBuilder';
import {
    executeTestCommand,
    executeTestCommandFast,
    logTestExecution,
} from '../execution/TestProcessRunner';
import { processTestResults } from '../testResultProcessor';
import { getTestFrameworkForFile } from '../testDetection/testFileDetection';
import { parseShellCommand } from '../utils/ShellUtils';
import { escapeRegExp, updateTestNameIfUsingProperties } from '../utils/TestNameUtils';
import { logInfo, logError } from '../utils/Logger';
import { findTestFiles, parseTestsInFile } from '../testDiscovery';

export class TestRunExecutor {
    constructor(
        private readonly testController: vscode.TestController,
        private readonly testRunnerConfig: TestRunnerConfig,
        private readonly coverageProvider: CoverageProvider
    ) { }

    /**
     * Ensures all test files in the relevant directories are discovered before running tests.
     * This fixes the bug where tests in unopened files are not found when running coverage on a folder.
     */
    private async ensureTestsDiscovered(request: vscode.TestRunRequest): Promise<void> {
        const pathsToScan = new Set<string>();

        if (request.include && request.include.length > 0) {
            // Collect paths from included test items
            for (const item of request.include) {
                if (item.uri) {
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(item.uri);
                    if (workspaceFolder) {
                        pathsToScan.add(workspaceFolder.uri.fsPath);
                    }
                }
            }
        } else {
            // No specific include - scan all workspace folders
            for (const folder of vscode.workspace.workspaceFolders || []) {
                pathsToScan.add(folder.uri.fsPath);
            }
        }

        // Discover test files in each path
        for (const folderPath of pathsToScan) {
            const testFiles = await findTestFiles(folderPath, this.testRunnerConfig);

            for (const filePath of testFiles) {
                // Skip if already in test controller
                if (this.testController.items.get(filePath)) {
                    continue;
                }

                // Add the test file to the controller
                const workspaceFolder = vscode.workspace.workspaceFolders?.find(
                    (f) => filePath.startsWith(f.uri.fsPath)
                );
                if (workspaceFolder) {
                    const relativePath = relative(workspaceFolder.uri.fsPath, filePath);
                    const fileUri = vscode.Uri.file(filePath);
                    const testItem = this.testController.createTestItem(filePath, relativePath, fileUri);
                    this.testController.items.add(testItem);
                    parseTestsInFile(filePath, testItem, this.testController);
                }
            }
        }
    }

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
        // Ensure all test files are discovered before collecting tests
        await this.ensureTestsDiscovered(request);

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
                    framework,
                    configPath,
                    allFiles.length > 0 ? allFiles[0] : undefined
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
        framework: 'jest' | 'vitest' | 'node-test' = 'jest',
        configPath?: string,
        testFilePath?: string
    ): Promise<void> {
        try {
            const coverageMap = await this.coverageProvider.readCoverageFromFile(
                workspaceFolder,
                framework,
                configPath,
                testFilePath
            );

            if (!coverageMap) {
                logInfo(`No coverage data found. Make sure coverageReporters includes "json" in your ${framework} config.`);
                return;
            }

            const fileCoverages = this.coverageProvider.convertToVSCodeCoverage(
                coverageMap
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
