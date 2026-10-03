import { homedir } from 'node:os';
import { basename } from 'node:path';

/**
 * Replaces the VS Code variables a setting may use (`${workspaceFolder}`,
 * `${env:NAME}`, ...). VS Code only substitutes them in its own files such as
 * launch.json; settings read by an extension come back verbatim.
 * Unknown variables are left as they are.
 */
export function resolveVariables(
	value: string,
	workspaceFolderPath: string,
): string {
	return value.replace(/\$\{([^}]+)\}/g, (match, name: string) => {
		if (name === 'workspaceFolder' || name === 'workspaceRoot') {
			return workspaceFolderPath || match;
		}
		if (name === 'workspaceFolderBasename') {
			return workspaceFolderPath ? basename(workspaceFolderPath) : match;
		}
		if (name === 'userHome') {
			return homedir();
		}
		if (name.startsWith('env:')) {
			return process.env[name.slice('env:'.length)] ?? '';
		}
		return match;
	});
}
