import { createRequire } from 'module';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { normalizePath, normalizeDriveLetter } from './PathUtils';
import { logDebug, logWarning } from './Logger';

export function resolveBinaryPath(
  packageName: string,
  cwd: string,
  binName?: string,
): string | undefined {
  try {
    const requireFromCwd = createRequire(join(cwd, 'package.json'));
    try {
      const pkgJsonPath = requireFromCwd.resolve(`${packageName}/package.json`);
      const pkgDir = dirname(pkgJsonPath);
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const lookupName = binName || packageName;
      const binEntry =
        typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[lookupName];
      if (binEntry) {
        const binPath = join(pkgDir, binEntry);
        if (existsSync(binPath)) {
          logDebug(
            `Resolved binary via package.json for ${lookupName}: ${binPath}`,
          );
          return normalizePath(binPath);
        }
      }
    } catch {}
  } catch (error) {
    logWarning(`Failed to resolve binary path for ${packageName}: ${error}`);
  }
  return undefined;
}

export function resolveConfigPath(
  configNames: string[],
  cwd: string,
  stopPath?: string,
  validator?: (path: string) => boolean,
): string | undefined {
  let currentDir = normalizePath(cwd);
  const stopDir = stopPath ? normalizePath(stopPath) : undefined;

  const MAX_DEPTH = 50;
  let depth = 0;

  while (depth < MAX_DEPTH) {
    for (const configName of configNames) {
      const configPath = join(currentDir, configName);
      if (existsSync(configPath)) {
        if (validator && !validator(configPath)) {
          continue;
        }
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
