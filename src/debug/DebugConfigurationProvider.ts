import * as vscode from 'vscode';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { resolveBinaryPath } from '../utils/ResolverUtils';
import { parseShellCommand } from '../utils/ShellUtils';
import { resolveTestNameStringInterpolation } from '../utils/TestNameUtils';
import { logWarning } from '../utils/Logger';
import * as Settings from '../config/Settings';

export class DebugConfigurationProvider {
    /**
     * Generates a debug configuration for the given file and test name.
     * This encapsulates the complexity of configuring Node.js, Jest, or Vitest debugging sessions.
     */
    public getDebugConfiguration(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const framework = config.getTestFramework(filePath);
        const isVitest = framework === 'vitest';
        const isNodeTest = framework === 'node-test';
        const isBun = framework === 'bun';
        const isDeno = framework === 'deno';

        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: isNodeTest
                ? 'Debug Node.js Tests'
                : isVitest
                    ? 'Debug Vitest Tests'
                    : isBun
                        ? 'Debug Bun Tests'
                        : isDeno
                            ? 'Debug Deno Tests'
                            : 'Debug Jest Tests',
            request: 'launch',
            type: isBun ? 'bun' : 'node', // Use 'bun' type if available (user needs Bun extension), otherwise getting 'node' + runtimeExecutable might work
            ...(config.changeDirectoryToWorkspaceRoot ? { cwd: config.cwd } : {}),
            ...(isNodeTest
                ? config.nodeTestDebugOptions
                : isVitest
                    ? config.vitestDebugOptions
                    : isBun
                        ? config.bunDebugOptions
                        : isDeno
                            ? config.denoDebugOptions
                            : config.debugOptions),
        };

        // Fallback for Bun if 'bun' debug type is not available? 
        // For now, let's assume if they want to debug Bun they have the extension or we treat it as node with runtimeExecutable.
        // Actually, vscode-bun extension uses 'bun' type. 
        // If we want to be safe, we can use 'pwa-node' and runtimeExecutable 'bun'.
        if (isBun) {
            debugConfig.type = 'pwa-node';
            debugConfig.runtimeExecutable = 'bun';
            debugConfig.runtimeArgs = ['test'];

            if (testName) {
                const resolved = resolveTestNameStringInterpolation(testName);
                debugConfig.runtimeArgs.push('-t', resolved);
            }

            if (config.bunRunOptions) {
                debugConfig.runtimeArgs.push(...config.bunRunOptions);
            }

            debugConfig.program = filePath || '';
            // Bun runs files directly
            debugConfig.args = [];
            debugConfig.args.push(filePath || '');

            // Clean up: bun test [args] [file]
            // runtimeArgs gets prepended to program? No.
            // With pwa-node: 
            // runtimeExecutable: bun
            // runtimeArgs: [test, ...args]
            // program: [file] -> this gets added as last arg usually.
            // Actually, usually program is the script to run.
            // Let's rely on constructing args manually.

            debugConfig.program = undefined; // Don't use program, just args.
            debugConfig.args = [filePath || ''];

            return debugConfig;
        }

        if (isDeno) {
            debugConfig.type = 'pwa-node';
            debugConfig.runtimeExecutable = 'deno';
            debugConfig.runtimeArgs = ['test', '--inspect-brk', '--allow-all'];

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

        if (!isVitest && !isNodeTest && config.enableESM) {
            debugConfig.env = {
                ...debugConfig.env,
                NODE_OPTIONS: '--experimental-vm-modules'
            };
        }

        // Node.js test runner uses node directly with --test flag
        if (isNodeTest) {
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

            // Add test name pattern if specified
            if (testName) {
                let resolvedTestName = testName;
                if (testName.includes('%')) {
                    resolvedTestName = resolveTestNameStringInterpolation(testName);
                }
                debugConfig.runtimeArgs.push('--test-name-pattern', resolvedTestName);
            }

            // Add user-configured run options
            if (config.nodeTestRunOptions) {
                debugConfig.runtimeArgs.push(...config.nodeTestRunOptions);
            }

            debugConfig.program = filePath || '';
            debugConfig.args = [];
            return debugConfig;
        }

        // Jest/Vitest: build test args and add to config (only if filePath is provided)
        const testArgs = filePath
            ? (isVitest
                ? config.buildVitestArgs(filePath, testName, false)
                : config.buildJestArgs(filePath, testName, false))
            : [];

        const customCommand = isVitest
            ? Settings.getVitestCommand()
            : Settings.getJestCommand();

        if (customCommand && typeof customCommand === 'string') {
            const parts = parseShellCommand(customCommand);
            if (parts.length > 0) {
                debugConfig.program = parts[0];
                debugConfig.args = [...parts.slice(1), ...testArgs];
            }
            return debugConfig;
        }

        // Use npx to resolve the binary path and execute it directly
        const binaryName = isVitest ? 'vitest' : 'jest';
        const binaryPath = resolveBinaryPath(binaryName, config.cwd);

        if (binaryPath) {
            debugConfig.program = binaryPath;
            debugConfig.args = isVitest ? ['run', ...testArgs] : ['--runInBand', ...testArgs];
        } else {
            // Fallback to npx if binary path cannot be resolved
            logWarning(`Could not resolve ${binaryName} binary path, falling back to npx`);
            debugConfig.runtimeExecutable = 'npx';
            debugConfig.args = isVitest
                ? ['--no-install', 'vitest', 'run', ...testArgs]
                : ['--no-install', 'jest', '--runInBand', ...testArgs];
        }

        return debugConfig;
    }
}
