import { basename, dirname } from 'node:path';
import { matcher } from 'micromatch';
import { logDebug } from './Logger';

const IS_WINDOWS = process.platform.includes('win32');

export function isWindows(): boolean {
	return IS_WINDOWS;
}

export function normalizePath(path: string): string {
	const normalized = IS_WINDOWS ? path.replace(/\\/g, '/') : path;
	return normalizeDriveLetter(normalized);
}

export function normalizeDriveLetter(path: string): string {
	if (IS_WINDOWS && path.match(/^[a-z]:/)) {
		return path.charAt(0).toUpperCase() + path.slice(1);
	}
	return path;
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

const matcherCache = new Map<string, (path: string) => boolean>();

/** Compiling a glob is costly and a run resolves the mapping for every file. */
function getMatcher(glob: string): (path: string) => boolean {
	let isMatch = matcherCache.get(glob);
	if (!isMatch) {
		isMatch = matcher(glob);
		matcherCache.set(glob, isMatch);
	}
	return isMatch;
}

export function resolveConfigPathOrMapping(
	configPathOrMapping: string | Record<string, string> | undefined,
	targetPath: string,
): string | undefined {
	if (typeof configPathOrMapping !== 'object') {
		return configPathOrMapping;
	}
	for (const [key, value] of Object.entries(configPathOrMapping)) {
		const isMatch = getMatcher(key);
		if (isMatch(targetPath) || isMatch(normalizePath(targetPath))) {
			return normalizePath(value);
		}
	}
	if (Object.keys(configPathOrMapping).length > 0) {
		logDebug(`No glob pattern in configPath mapping matched: ${targetPath}`);
	}
	return undefined;
}
