import * as vscode from 'vscode';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import {
    normalizePath,
    resolveConfigPathOrMapping,
    searchPathToParent,
    logDebug,
} from './util';
import { TestFrameworkName, testFrameworks } from './testDetection/frameworkDefinitions';

export interface ConfigResolutionContext {
    currentWorkspaceFolderPath: string;
    projectPathFromConfig?: string;
    useNearestConfig?: boolean;
}

export class ConfigResolver {

    public resolveConfigPath(
        targetPath: string,
        configKey: string,
        context: ConfigResolutionContext,
        framework?: TestFrameworkName,
    ): string {
        const configPathOrMapping = vscode.workspace.getConfiguration().get<string | Record<string, string>>(configKey);

        const configPath = resolveConfigPathOrMapping(
            configPathOrMapping,
            targetPath,
        );

        // If useNearestConfig is enabled, try to find config relative to the test file first
        if (!configPath || context.useNearestConfig) {
            const foundPath = this.findConfigPath(targetPath, context, configPath, framework);
            if (foundPath) {
                logDebug(`Found config path using findConfigPath: ${foundPath}`);
                return foundPath;
            }
        }

        if (configPath) {
            // Resolve path relative to workspace or project path
            const resolvedPath = normalizePath(
                resolve(
                    context.currentWorkspaceFolderPath,
                    context.projectPathFromConfig || '',
                    configPath,
                ),
            );

            if (existsSync(resolvedPath)) {
                return resolvedPath;
            }

            const foundPath = this.findConfigPath(targetPath, context, undefined, framework);
            if (foundPath) {
                logDebug(`Found config path (fallback) using findConfigPath: ${foundPath}`);
                return foundPath;
            }

            logDebug(`Using resolved config path from settings: ${resolvedPath}`);
            return resolvedPath;
        }

        return '';
    }

    public findConfigPath(
        targetPath: string | undefined, // made optional to match previous logic but generally should be string
        context: ConfigResolutionContext,
        targetConfigFilename?: string,
        framework?: TestFrameworkName,
    ): string | undefined {
        let configFiles: readonly string[];
        if (targetConfigFilename) {
            configFiles = [targetConfigFilename];
        } else if (framework) {
            const frameworkDef = testFrameworks.find(f => f.name === framework);
            configFiles = frameworkDef ? frameworkDef.configFiles : [];
        } else {
            configFiles = testFrameworks.flatMap(f => f.configFiles);
        }

        const currentWorkspaceFolderPath = context.currentWorkspaceFolderPath;
        const startPath = targetPath ||
            dirname(vscode.window.activeTextEditor?.document.uri.fsPath || '');

        if (!startPath) {
            return undefined;
        }

        const foundPath = searchPathToParent<string>(
            startPath,
            currentWorkspaceFolderPath,
            (currentFolderPath: string) => {
                for (const configFilename of configFiles) {
                    const currentFolderConfigPath = join(
                        currentFolderPath,
                        configFilename,
                    );
                    if (existsSync(currentFolderConfigPath)) {
                        return currentFolderConfigPath;
                    }
                }
            },
        );
        const result = foundPath ? normalizePath(foundPath) : undefined;
        if (result) {
            logDebug(`findConfigPath found: ${result}`);
        } else {
            logDebug(`findConfigPath failed to find config in: ${targetPath}`);
        }
        return result;
    }
}
