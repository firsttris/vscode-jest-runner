import * as vscode from 'vscode';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { resolveBinaryPath } from '../utils/ResolverUtils';
import { parseShellCommand } from '../utils/ShellUtils';
import { resolveTestNameStringInterpolation } from '../utils/TestNameUtils';
import { logWarning } from '../utils/Logger';
import * as Settings from '../config/Settings';

export class DebugConfigurationProvider {

    public getDebugConfiguration(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const framework = config.getTestFramework(filePath);

        if (framework === 'bun') {
            return this.getBunDebugConfig(config, filePath, testName);
        }

        if (framework === 'deno') {
            return this.getDenoDebugConfig(config, filePath, testName);
        }

        if (framework === 'node-test') {
            return this.getNodeTestDebugConfig(config, filePath, testName);
        }

        if (framework === 'vitest') {
            return this.getVitestDebugConfig(config, filePath, testName);
        }

        return this.getJestDebugConfig(config, filePath, testName);
    }

    private getBunDebugConfig(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: 'Debug Bun Tests',
            request: 'launch',
            type: 'pwa-node',
            cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
            ...config.bunDebugOptions,
            runtimeExecutable: 'bun',
            runtimeArgs: ['test'],
        };

        if (testName) {
            const resolved = resolveTestNameStringInterpolation(testName);
            debugConfig.runtimeArgs.push('-t', resolved);
        }

        if (config.bunRunOptions) {
            debugConfig.runtimeArgs.push(...config.bunRunOptions);
        }

        debugConfig.program = undefined;
        debugConfig.args = [filePath || ''];

        return debugConfig;
    }

    private getDenoDebugConfig(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: 'Debug Deno Tests',
            request: 'launch',
            type: 'pwa-node',
            cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
            ...config.denoDebugOptions,
            runtimeExecutable: 'deno',
            runtimeArgs: ['test', '--inspect-brk', '--allow-all'],
        };

        if (testName) {
            const resolved = resolveTestNameStringInterpolation(testName);
            debugConfig.runtimeArgs.push('--filter', resolved);
        }

        if (config.denoRunOptions) {
            debugConfig.runtimeArgs.push(...config.denoRunOptions);
        }

        debugConfig.program = undefined;
        debugConfig.args = [filePath || ''];

        return debugConfig;
    }

    private getNodeTestDebugConfig(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: 'Debug Node.js Tests',
            request: 'launch',
            type: 'node',
            cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
            ...config.nodeTestDebugOptions,
        };

        const customCommand = Settings.getNodeTestCommand();
        if (customCommand) {
            const parts = parseShellCommand(customCommand);
            if (parts.length > 0) {
                debugConfig.runtimeExecutable = parts[0];
                debugConfig.runtimeArgs = [...parts.slice(1), '--test'];
            }
        } else {
            debugConfig.runtimeArgs = ['--test'];
        }

        if (testName) {
            let resolvedTestName = testName;
            if (testName.includes('%')) {
                resolvedTestName = resolveTestNameStringInterpolation(testName);
            }
            debugConfig.runtimeArgs.push('--test-name-pattern', resolvedTestName);
        }

        if (config.nodeTestRunOptions) {
            debugConfig.runtimeArgs.push(...config.nodeTestRunOptions);
        }

        debugConfig.program = filePath || '';
        debugConfig.args = [];

        return debugConfig;
    }

    private getVitestDebugConfig(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: 'Debug Vitest Tests',
            request: 'launch',
            type: 'node',
            cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
            ...config.vitestDebugOptions,
        };

        const customCommand = Settings.getVitestCommand();
        if (customCommand && typeof customCommand === 'string') {
            const parts = parseShellCommand(customCommand);
            if (parts.length > 0) {
                debugConfig.program = parts[0];
                debugConfig.args = [...parts.slice(1)];
                if (filePath) {
                    const testArgs = config.buildVitestArgs(filePath, testName, false);
                    debugConfig.args.push(...testArgs);
                }
                return debugConfig;
            }
        }

        const testArgs = filePath ? config.buildVitestArgs(filePath, testName, false) : [];
        const binaryPath = resolveBinaryPath('vitest', config.cwd);

        if (binaryPath) {
            debugConfig.program = binaryPath;
            debugConfig.args = ['run', ...testArgs];
        } else {
            logWarning('Could not resolve vitest binary path, falling back to npx');
            debugConfig.runtimeExecutable = 'npx';
            debugConfig.args = ['--no-install', 'vitest', 'run', ...testArgs];
        }

        return debugConfig;
    }

    private getJestDebugConfig(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: 'Debug Jest Tests',
            request: 'launch',
            type: 'node',
            cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
            ...config.debugOptions,
        };

        if (config.enableESM) {
            debugConfig.env = {
                ...debugConfig.env,
                NODE_OPTIONS: '--experimental-vm-modules'
            };
        }

        const customCommand = Settings.getJestCommand();
        if (customCommand && typeof customCommand === 'string') {
            const parts = parseShellCommand(customCommand);
            if (parts.length > 0) {
                debugConfig.program = parts[0];
                debugConfig.args = [...parts.slice(1)];
                if (filePath) {
                    const testArgs = config.buildJestArgs(filePath, testName, false);
                    debugConfig.args.push(...testArgs);
                }
                return debugConfig;
            }
        }

        const testArgs = filePath ? config.buildJestArgs(filePath, testName, false) : [];
        const binaryPath = resolveBinaryPath('jest', config.cwd);

        if (binaryPath) {
            debugConfig.program = binaryPath;
            debugConfig.args = ['--runInBand', ...testArgs];
        } else {
            logWarning('Could not resolve jest binary path, falling back to npx');
            debugConfig.runtimeExecutable = 'npx';
            debugConfig.args = ['--no-install', 'jest', '--runInBand', ...testArgs];
        }

        return debugConfig;
    }
}
