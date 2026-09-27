import { existsSync } from 'node:fs';
import { win32 } from 'node:path';
import { parse } from 'shell-quote';

export function stripAnsi(str: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ESC character is the point
	return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

export function parseShellCommand(command: string): string[] {
	const entries = parse(command);
	const args: string[] = [];

	for (const entry of entries) {
		if (typeof entry === 'string') {
			args.push(entry);
		} else if ('op' in entry) {
			if (entry.op === 'glob') {
				args.push(entry.pattern);
			} else {
				args.push(entry.op);
			}
		}
	}
	return args;
}

export function parseCommandAndEnv(command: string): {
	env: Record<string, string>;
	executable: string;
	args: string[];
} {
	const parts = parseShellCommand(command);
	const env: Record<string, string> = {};
	let executable = '';
	const args: string[] = [];

	let i = 0;
	// Consume leading env vars
	for (; i < parts.length; i++) {
		const part = parts[i];
		const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
		if (match) {
			env[match[1]] = match[2];
		} else {
			break;
		}
	}

	if (i < parts.length) {
		executable = parts[i];
		i++;
	}

	// Remaining parts are args
	for (; i < parts.length; i++) {
		args.push(parts[i]);
	}

	return { env, executable, args };
}

function unquoteShellArg(arg: string): string {
	if (arg.length < 2) {
		return arg;
	}

	const first = arg[0];
	const last = arg[arg.length - 1];
	if ((first !== '"' && first !== "'" && first !== '`') || first !== last) {
		return arg;
	}

	let inner = arg.substring(1, arg.length - 1);

	if (first === '"') {
		inner = inner.replace(/""/g, '"');
	}

	if (first === "'") {
		inner = inner.replace(/'\\''/g, "'");
	}

	return inner;
}

export function normalizeArgsForNonShellSpawn(args: string[]): string[] {
	return args.map(unquoteShellArg);
}

const WINDOWS_DIRECT_EXTENSIONS = ['.com', '.exe'];
const WINDOWS_SCRIPT_EXTENSIONS = ['.cmd', '.bat'];

/**
 * Whether `executable` has to be started through cmd.exe on Windows.
 *
 * Without a shell, Windows only finds .exe and .com files, so npm-style shims
 * such as npx.cmd, yarn.cmd or pnpm.cmd fail with ENOENT (and Node >= 20.12
 * refuses to spawn .cmd/.bat files without a shell at all).
 *
 * Deliberately conservative: only a .cmd/.bat that is found while no
 * .exe/.com is switches to the shell. Anything else is spawned directly,
 * exactly as before, so commands that already worked keep their behavior.
 */
export function needsWindowsShell(
	executable: string,
	env: NodeJS.ProcessEnv,
	cwd: string,
): boolean {
	const extension = win32.extname(executable).toLowerCase();
	if (extension) {
		return WINDOWS_SCRIPT_EXTENSIONS.includes(extension);
	}

	// A copied env may hold the path under several spellings (Path, PATH),
	// and entries may be quoted.
	const pathDirs = Object.keys(env)
		.filter((key) => key.toUpperCase() === 'PATH')
		.flatMap((key) => (env[key] ?? '').split(';'))
		.map((dir) => dir.trim().replace(/^"(.*)"$/, '$1'))
		.filter(Boolean);
	const searchDirs = /[\\/]/.test(executable) ? [''] : ['', ...pathDirs];

	const existsWith = (extensions: string[]) =>
		searchDirs.some((dir) =>
			extensions.some((ext) =>
				existsSync(win32.resolve(cwd, dir, `${executable}${ext}`)),
			),
		);

	return (
		!existsWith(WINDOWS_DIRECT_EXTENSIONS) &&
		existsWith(WINDOWS_SCRIPT_EXTENSIONS)
	);
}

/**
 * Quotes `arg` as one word of a cmd.exe command line that is then split into
 * argv by the C runtime of the started program.
 *
 * - Backslashes before a quote (the closing one or an escaped inner one) are
 *   doubled, or the C runtime would read `\"` as a literal quote and merge
 *   the following arguments into this one.
 * - cmd.exe expands `%VAR%` even inside quotes, so each `%` is written
 *   outside the quotes as `^%`: the caret makes the variable name invalid
 *   during expansion and is removed afterwards, leaving a plain `%`.
 */
export function quoteForCmd(arg: string): string {
	if (/^[\w\-.:\\/=@+,]+$/.test(arg)) {
		return arg;
	}

	const quoteSegment = (segment: string) =>
		`"${segment.replace(/(\\*)"/g, '$1$1""').replace(/(\\+)$/, '$1$1')}"`;
	return arg.split('%').map(quoteSegment).join('^%');
}
