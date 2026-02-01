import { createRequire } from 'module';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { isWindows, normalizePath } from './PathUtils';
import { logDebug, logWarning } from './Logger';

/**
 * Resolve the absolute path to a binary using Node's require.resolve.
 * This recursively searches parent directories, just like npx does.
 */
export function resolveBinaryPath(binaryName: string, cwd: string): string | undefined {
    try {
        // Create a require function with the cwd as the base path
        // This allows require.resolve to search from the project directory upwards
        const requireFromCwd = createRequire(join(cwd, 'package.json'));

        // Strategy 1: On non-Windows, try node_modules/.bin symlink (most reliable)
        // These are executable symlinks created by npm/yarn/pnpm
        if (!isWindows()) {
            try {
                const pkgJsonPath = requireFromCwd.resolve(`${binaryName}/package.json`);
                // Extract the base node_modules path (works for normal, scoped, and pnpm layouts)
                const nodeModulesMatch = pkgJsonPath.split(/[/\\]node_modules[/\\]/);
                if (nodeModulesMatch.length > 1) {
                    const binPath = join(nodeModulesMatch[0], 'node_modules', '.bin', binaryName);
                    if (existsSync(binPath)) {
                        logDebug(`Resolved binary via node_modules/.bin for ${binaryName}: ${binPath}`);
                        return normalizePath(binPath);
                    }
                }
            } catch {
                // .bin approach failed, try other strategies
            }
        }

        // Strategy 2: Resolve via package.json and bin field
        // Works for packages that don't export their bin (e.g., vitest)
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
            // Package.json approach also failed
        }
    } catch (error) {
        logWarning(`Failed to resolve binary path for ${binaryName}: ${error}`);
    }
    return undefined;
}

/**
 * Resolve the absolute path to a configuration file by searching parent directories.
 */
export function resolveConfigPath(
    configNames: string[],
    cwd: string,
    stopPath?: string
): string | undefined {
    let currentDir = normalizePath(cwd);
    const stopDir = stopPath ? normalizePath(stopPath) : undefined;

    // Safety check to prevent infinite loops (though path parsing usually prevents this)
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

        // Stop if we reached the top or the specific stop path
        if (stopDir && currentDir === stopDir) {
            break;
        }

        const parentDir = dirname(currentDir);
        if (parentDir === currentDir) {
            // Reached root
            break;
        }
        currentDir = parentDir;
        depth++;
    }

    return undefined;
}
