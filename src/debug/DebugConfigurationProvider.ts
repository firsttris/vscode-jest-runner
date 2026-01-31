import * as vscode from 'vscode';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { resolveBinaryPath } from '../utils/ResolverUtils';
import { parseShellCommand } from '../utils/ShellUtils';
import { resolveTestNameStringInterpolation } from '../utils/TestNameUtils';
import { logWarning } from '../utils/Logger';

export class DebugConfigurationProvider {
    /**
     * Generates a debug configuration for the given file and test name.
     * This encapsulates the complexity of configuring Node.js, Jest, or Vitest debugging sessions.
     */
    public getDebugConfiguration(config: TestRunnerConfig, filePath?: string, testName?: string): vscode.DebugConfiguration {
        const framework = config.getTestFramework(filePath);
        const isVitest = framework === 'vitest';
        const isNodeTest = framework === 'node-test';

        const debugConfig: vscode.DebugConfiguration = {
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            name: isNodeTest
                ? 'Debug Node.js Tests'
                : isVitest
                    ? 'Debug Vitest Tests'
                    : 'Debug Jest Tests',
            request: 'launch',
            type: 'node',
            ...(config.changeDirectoryToWorkspaceRoot ? { cwd: config.cwd } : {}),
            ...(isNodeTest
                ? config.nodeTestDebugOptions
                : isVitest
                    ? config.vitestDebugOptions
                    : config.debugOptions),
        };

        if (!isVitest && !isNodeTest && config.enableESM) {
            debugConfig.env = {
                ...debugConfig.env,
                NODE_OPTIONS: '--experimental-vm-modules'
            };
        }

        // Node.js test runner uses node directly with --test flag
        if (isNodeTest) {
            const customCommand = vscode.workspace.getConfiguration().get<string>('jestrunner.nodeTestCommand');
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

        const customCommandKey = isVitest
            ? 'jestrunner.vitestCommand'
            : 'jestrunner.jestCommand';
        const customCommand = vscode.workspace.getConfiguration().get<string>(customCommandKey);

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
