import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { stripAnsi } from '../utils/ShellUtils';
import { logDebug, logInfo } from '../utils/Logger';

/**
 * Fast test execution for single tests - uses exit code instead of JSON parsing.
 * This is significantly faster as it skips JSON serialization/parsing overhead.
 */
export function executeTestCommandFast(
    command: string,
    args: string[],
    token: vscode.CancellationToken,
    test: vscode.TestItem,
    run: vscode.TestRun,
    cwd: string,
    additionalEnv?: Record<string, string>,
): Promise<void> {
    return new Promise((resolve) => {
        const jestProcess = spawn(command, args, {
            cwd,
            env: { ...process.env, FORCE_COLOR: 'true', ...additionalEnv },
            shell: true,
        });

        let stdout = '';
        let stderr = '';

        jestProcess.stdout?.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            // Stream output with colors to the test output panel
            run.appendOutput(chunk.replace(/\n/g, '\r\n'));
        });

        jestProcess.stderr?.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;
            run.appendOutput(chunk.replace(/\n/g, '\r\n'));
        });

        jestProcess.on('error', (error) => {
            run.failed(
                test,
                new vscode.TestMessage(`Failed to execute test runner: ${error.message}`),
            );
            resolve();
        });

        jestProcess.on('close', (code) => {
            cancellationListener.dispose();

            if (token.isCancellationRequested) {
                run.skipped(test);
                resolve();
                return;
            }

            // Exit code 0 = passed, non-zero = failed
            if (code === 0) {
                run.passed(test);
            } else {
                const errorOutput = stderr || stdout || 'Test failed';
                const cleanError = stripAnsi(errorOutput);
                run.failed(test, new vscode.TestMessage(cleanError));
            }
            resolve();
        });

        const cancellationListener = token.onCancellationRequested(() => {
            jestProcess.kill();
            run.skipped(test);
            resolve();
        });
    });
}

export function executeTestCommand(
    command: string,
    args: string[],
    token: vscode.CancellationToken,
    tests: vscode.TestItem[],
    run: vscode.TestRun,
    cwd: string,
    additionalEnv?: Record<string, string>,
): Promise<string | null> {
    return new Promise((resolve) => {
        const maxBufferSize =
            vscode.workspace
                .getConfiguration('jestrunner')
                .get<number>('maxBufferSize', 50) *
            1024 *
            1024;

        const jestProcess = spawn(command, args, {
            cwd,
            env: { ...process.env, FORCE_COLOR: 'true', ...additionalEnv },
            shell: true,
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const checkBufferSize = (
            buffer: string,
            chunk: string,
            errorMsg: string,
        ): boolean => {
            if (buffer.length + chunk.length > maxBufferSize) {
                killed = true;
                jestProcess.kill();
                tests.forEach((test) => run.failed(test, new vscode.TestMessage(errorMsg)));
                resolve(null);
                return true;
            }
            return false;
        };

        jestProcess.stdout?.on('data', (data) => {
            if (killed) return;
            const chunk = data.toString();
            if (!checkBufferSize(stdout, chunk, 'Test output exceeded maximum buffer size')) {
                stdout += chunk;
            }
        });

        jestProcess.stderr?.on('data', (data) => {
            if (killed) return;
            const chunk = data.toString();
            if (!checkBufferSize(stderr, chunk, 'Error output exceeded maximum buffer size')) {
                stderr += chunk;
            }
        });

        jestProcess.on('error', (error) => {
            tests.forEach((test) =>
                run.failed(
                    test,
                    new vscode.TestMessage(`Failed to execute test runner: ${error.message}`),
                ),
            );
            resolve(null);
        });

        jestProcess.on('close', () => {
            cancellationListener.dispose();

            if (token.isCancellationRequested) {
                tests.forEach((test) => run.skipped(test));
                resolve(null);
                return;
            }

            // Parse from stdout/stderr - JSON extraction handles Nx/monorepo prefixed output
            const combinedOutput = stdout + (stderr ? '\n' + stderr : '');

            if (combinedOutput.trim()) {
                const hasJsonInStdout = stdout.includes('"testResults"') || stdout.includes('"numFailedTestSuites"');
                const hasJsonInStderr = stderr.includes('"testResults"') || stderr.includes('"numFailedTestSuites"');

                if (hasJsonInStdout || hasJsonInStderr) {
                    logDebug(`Runner output (stdout): ${stdout.substring(0, 500)}...`);
                    resolve(combinedOutput);
                } else if (stdout) {
                    logDebug(`Runner output (stdout): ${stdout.substring(0, 500)}...`);
                    resolve(combinedOutput);
                } else {
                    logInfo(`Runner stderr: ${stderr}`);
                    tests.forEach((test) =>
                        run.failed(test, new vscode.TestMessage(stderr)),
                    );
                    resolve(null);
                }
            } else {
                tests.forEach((test) =>
                    run.failed(test, new vscode.TestMessage('No output from test runner')),
                );
                resolve(null);
            }
        });

        const cancellationListener = token.onCancellationRequested(() => {
            jestProcess.kill();
            tests.forEach((test) => run.skipped(test));
            resolve(null);
        });
    });
}

export function logTestExecution(
    framework: string,
    command: string,
    args: string[],
    testCount: number,
    fileCount: number,
    isEsm: boolean,
): void {
    logInfo(
        `Running batched ${framework} command: ${command} ${args.join(' ')} (${testCount} tests across ${fileCount} files)${isEsm ? ' [ESM mode]' : ''}`,
    );
}
