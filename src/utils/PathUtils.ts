import { basename, dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { matcher } from 'micromatch';
import { logDebug, logWarning } from './Logger';

const IS_WINDOWS = process.platform.includes('win32');

export function isWindows(): boolean {
    return IS_WINDOWS;
}

export function normalizePath(path: string): string {
    return IS_WINDOWS ? path.replace(/\\/g, '/') : path;
}

export function getDirName(filePath: string): string {
    return dirname(filePath);
}

export function getFileName(filePath: string): string {
    return basename(filePath);
}

export function escapeRegExpForPath(s: string): string {
    return s.replace(/[.*+?^${}<>()|[\]\\]/g, '\\$&');
}

export function resolveConfigPathOrMapping(
    configPathOrMapping: string | Record<string, string> | undefined,
    targetPath: string,
): string | undefined {
    if (['string', 'undefined'].includes(typeof configPathOrMapping)) {
        return configPathOrMapping as string | undefined;
    }
    for (const [key, value] of Object.entries(
        configPathOrMapping as Record<string, string>,
    )) {
        const isMatch = matcher(key);
        if (isMatch(targetPath) || isMatch(normalizePath(targetPath))) {
            return normalizePath(value);
        }
    }
    if (Object.keys(configPathOrMapping).length > 0) {
        logDebug(`No glob pattern in configPath mapping matched: ${targetPath}`);
    }
    return undefined;
}

export function searchPathToParent<T>(
    startingPath: string,
    ancestorPath: string,
    callback: (currentFolderPath: string) => false | undefined | null | 0 | T,
) {
    let currentFolderPath: string;
    try {
        currentFolderPath = statSync(startingPath).isDirectory()
            ? startingPath
            : dirname(startingPath);
    } catch (error) {
        logWarning(
            `Could not access ${startingPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
        currentFolderPath = dirname(startingPath);
    }

    const endPath = dirname(ancestorPath);
    const resolvedStart = resolve(currentFolderPath);
    const resolvedEnd = resolve(endPath);
    if (!resolvedStart.startsWith(resolvedEnd)) {
        return false;
    }

    let lastPath: null | string = null;
    do {
        const result = callback(currentFolderPath);
        if (result) {
            return result;
        }
        lastPath = currentFolderPath;
        currentFolderPath = dirname(currentFolderPath);
    } while (currentFolderPath !== endPath && currentFolderPath !== lastPath);

    return false;
}
