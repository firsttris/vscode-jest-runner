import { createRequire } from 'module';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { normalizePath } from './PathUtils';
import { logDebug, logWarning } from './Logger';

export function resolveBinaryPath(binaryName: string, cwd: string): string | undefined {
    try {
        const requireFromCwd = createRequire(join(cwd, 'package.json'));
        try {
            const pkgJsonPath = requireFromCwd.resolve(`${binaryName}/package.json`);
            const pkgDir = dirname(pkgJsonPath);
            const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
            const binEntry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[binaryName];
            if (binEntry) {
                const binPath = join(pkgDir, binEntry);
                if (existsSync(binPath)) {
                    logDebug(`Resolved binary via package.json for ${binaryName}: ${binPath}`);
                    return normalizePath(binPath);
                }
            }
        } catch {
        }
    } catch (error) {
        logWarning(`Failed to resolve binary path for ${binaryName}: ${error}`);
    }
    return undefined;
}

export function resolveConfigPath(
    configNames: string[],
    cwd: string,
    stopPath?: string
): string | undefined {
    let currentDir = normalizePath(cwd);
    const stopDir = stopPath ? normalizePath(stopPath) : undefined;

    const MAX_DEPTH = 50;
    let depth = 0;

    while (depth < MAX_DEPTH) {
        for (const configName of configNames) {
            const configPath = join(currentDir, configName);
            if (existsSync(configPath)) {
                logDebug(`Found config ${configName} at: ${configPath}`);
                return normalizePath(configPath);
            }
        }

        if (stopDir && currentDir === stopDir) {
            break;
        }

        const parentDir = dirname(currentDir);
        if (parentDir === currentDir) {
            break;
        }
        currentDir = parentDir;
        depth++;
    }

    return undefined;
}
