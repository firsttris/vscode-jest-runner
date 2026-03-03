import * as vscode from 'vscode';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { resolveBinaryPath } from '../utils/ResolverUtils';
import { parseShellCommand, parseCommandAndEnv } from '../utils/ShellUtils';
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

        if (framework === 'playwright') {
            return this.getPlaywrightDebugConfig(config, filePath, testName);
        }

        return this.getJestDebugConfig(config, filePath, testName);
    }

    private getBunDebugConfig(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: 'Debug Bun Tests',
            request: 'launch',
            type: 'bun',
            cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
            ...config.bunDebugOptions,
            runtimeArgs: ['test', '--inspect-wait'],
        };

        if (testName) {
            const resolved = resolveTestNameStringInterpolation(testName);
            debugConfig.runtimeArgs.push('-t', resolved);
        }

        if (config.bunRunOptions) {
            debugConfig.runtimeArgs.push(...config.bunRunOptions);
        }

        debugConfig.program = filePath;
        debugConfig.args = [];

        return debugConfig;
    }

    private getDenoDebugConfig(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const runtimeArgs = ['test', '--inspect-brk', '--allow-all'];

        if (testName) {
            const resolved = resolveTestNameStringInterpolation(testName);
            runtimeArgs.push('--filter', resolved);
        }

        if (config.denoRunOptions) {
            runtimeArgs.push(...config.denoRunOptions);
        }

        if (filePath) {
            runtimeArgs.push(filePath);
        }

        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: 'Debug Deno Tests',
            request: 'launch',
            type: 'node',
            port: 9229,
            cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
            ...config.denoDebugOptions,
            runtimeExecutable: 'deno',
            runtimeArgs,
            attachSimplePort: 9229,
            args: [],
        };

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
            const { env, executable, args } = parseCommandAndEnv(customCommand);
            if (executable) {
                debugConfig.runtimeExecutable = executable;
                debugConfig.runtimeArgs = [...args, '--test'];
                if (Object.keys(env).length > 0) {
                    debugConfig.env = { ...debugConfig.env, ...env };
                }
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
            const { env, executable, args } = parseCommandAndEnv(customCommand);
            if (executable) {
                debugConfig.program = executable;
                debugConfig.args = [...args];
                if (Object.keys(env).length > 0) {
                    debugConfig.env = { ...debugConfig.env, ...env };
                }
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

    private getPlaywrightDebugConfig(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: 'Debug Playwright Tests',
            request: 'launch',
            type: 'node',
            cwd: config.changeDirectoryToWorkspaceRoot ? config.cwd : undefined,
            ...config.playwrightDebugOptions,
        };

        const customCommand = Settings.getPlaywrightCommand();
        if (customCommand) {
            const { env, executable, args } = parseCommandAndEnv(customCommand);
            if (executable) {
                debugConfig.program = executable;
                debugConfig.args = [...args];
                if (Object.keys(env).length > 0) {
                    debugConfig.env = { ...debugConfig.env, ...env };
                }
                if (filePath) {
                    const testArgs = config.buildPlaywrightArgs(filePath, testName, false);
                    debugConfig.args.push(...testArgs);
                }
                return debugConfig;
            }
        }

        const testArgs = filePath ? config.buildPlaywrightArgs(filePath, testName, false) : [];
        const binaryPath = resolveBinaryPath('@playwright/test', config.cwd, 'playwright');

        if (binaryPath) {
            debugConfig.program = binaryPath;
            debugConfig.args = [...testArgs, '--workers=1'];
        } else {
            logWarning('Could not resolve playwright binary path, falling back to npx');
            debugConfig.runtimeExecutable = 'npx';
            debugConfig.args = ['--no-install', 'playwright', ...testArgs, '--workers=1'];
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
            const { env, executable, args } = parseCommandAndEnv(customCommand);
            if (executable) {
                debugConfig.program = executable;
                debugConfig.args = [...args];
                if (Object.keys(env).length > 0) {
                    debugConfig.env = { ...debugConfig.env, ...env };
                }
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
