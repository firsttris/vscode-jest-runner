import * as vscode from 'vscode';
import { relative, join } from 'node:path';
import { spawn } from 'node:child_process';
import { TestRunnerConfig } from '../testRunnerConfig';
import { TestFrameworkName } from '../testDetection/frameworkDefinitions';
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
import { escapeRegExp, updateTestNameIfUsingProperties, quote } from '../utils/TestNameUtils';
import { logInfo, logError } from '../utils/Logger';
import { randomUUID } from 'node:crypto';

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
            const sessionId = randomUUID();

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

            const result = await executeTestCommand(
                command,
                commandArgs,
                token,
                allTests,
                run,
                this.testRunnerConfig.cwd,
                { ...(esmEnv ?? {}), JSTR_SESSION_ID: sessionId },
                sessionId
            );

            if (result === null) {
                run.end();
                return;
            }

            // Only process results if not already processed via structured output
            if (!result.structuredResultsProcessed) {
                if (framework === 'bun') {
                    // Bun JUnit reporter writes to file, read it and inject into output
                    const bunReportPath = join(this.testRunnerConfig.cwd, '.bun-report.xml');
                    try {
                        const fs = require('fs');
                        if (fs.existsSync(bunReportPath)) {
                            const reportContent = fs.readFileSync(bunReportPath, 'utf8');
                            result.output += '\n' + reportContent;
                            fs.unlinkSync(bunReportPath);
                        }
                    } catch (e) {
                        logError('Failed to read Bun report file', e);
                    }
                }
                processTestResults(result.output, allTests, run, framework, sessionId);
            }

            if (framework === 'deno' && collectCoverage && workspaceFolder) {
                try {
                    const coverageCommand = `deno coverage coverage --lcov > ${quote(join(workspaceFolder, 'lcov.info'))}`;
                    await new Promise<void>((resolve, reject) => {
                        const cp = spawn(coverageCommand, {
                            shell: true,
                            cwd: this.testRunnerConfig.cwd
                        });
                        cp.on('close', (code) => {
                            if (code === 0) resolve();
                            else reject(new Error(`Deno coverage conversion failed with code ${code}`));
                        });
                        cp.on('error', reject);
                    });
                } catch (e) {
                    logError('Failed to convert Deno coverage', e);
                }
            }

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
        framework: TestFrameworkName = 'jest',
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
