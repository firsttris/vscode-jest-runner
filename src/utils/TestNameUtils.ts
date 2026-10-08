import { isWindows } from './PathUtils';

const QUOTES = new Set(['"', "'", '`']);

export interface TestNode {
	type: string;
	name?: string;
	start?: { line: number; column: number };
	end?: { line: number; column: number };
	children?: TestNode[];
}

export function escapeRegExp(s: string): string {
	const escapedString = s.replace(/[.*+?^${}<>()|[\]\\]/g, '\\$&');
	return escapedString.replace(/\\\(\\\.\\\*\\\?\\\)/g, '(.*?)');
}

export function resolveTestNameStringInterpolation(s: string): string {
	const variableRegex =
		/((?:\\)?\$\{[^}]+\}|(?:\\)?\$[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*|%[psdifjo#%])/gi;
	const matchAny = '(.*?)';
	return s.replace(variableRegex, matchAny);
}

export function toTestNamePattern(
	receivedTestName?: string,
): string | undefined {
	if (receivedTestName === undefined) {
		return undefined;
	}

	const cleaned = updateTestNameIfUsingProperties(receivedTestName);
	return escapeRegExp(resolveTestNameStringInterpolation(cleaned));
}

export function toTestItemNamePattern(test: {
	id?: string;
	label: string;
}): string {
	const testId = test.id;
	const idMatch = testId?.match(/.*:(?:describe|it):\d+:(.*)$/);
	if (idMatch?.[1]) {
		return toTestNamePattern(idMatch[1]) || '';
	}

	return toTestNamePattern(test.label) || '';
}

/** Name pattern that matches any of `tests`. */
export function toTestItemsNamePattern(
	tests: { id?: string; label: string }[],
): string | undefined {
	if (tests.length === 0) return undefined;

	return tests.length > 1
		? `(${tests.map((test) => toTestItemNamePattern(test)).join('|')})`
		: toTestItemNamePattern(tests[0]);
}

export function updateTestNameIfUsingProperties(
	receivedTestName: string,
): string;
export function updateTestNameIfUsingProperties(
	receivedTestName?: string,
): string | undefined;
export function updateTestNameIfUsingProperties(
	receivedTestName?: string,
): string | undefined {
	if (receivedTestName === undefined) {
		return undefined;
	}

	return receivedTestName
		.replace(/(?<=\S)\\.name/g, '')
		.replace(/\w*\\.prototype\\./g, '');
}

export function findFullTestName(
	selectedLine: number,
	children: TestNode[],
): string | undefined {
	if (!children) {
		return;
	}
	for (const element of children) {
		const startLine = element.start?.line;
		const endLine = element.end?.line;
		if (element.type === 'describe' && selectedLine === startLine) {
			return resolveTestNameStringInterpolation(element.name ?? '');
		}
		if (
			element.type !== 'describe' &&
			startLine !== undefined &&
			endLine !== undefined &&
			selectedLine >= startLine &&
			selectedLine <= endLine
		) {
			const name = resolveTestNameStringInterpolation(element.name ?? '');
			return updateTestNameIfUsingProperties(name);
		}
	}
	for (const element of children) {
		const result = findFullTestName(selectedLine, element.children || []);
		if (result) {
			const parentName = resolveTestNameStringInterpolation(element.name ?? '');
			const cleanParentName = updateTestNameIfUsingProperties(parentName);
			return `${cleanParentName || parentName} ${result}`;
		}
	}
}

export function escapeSingleQuotes(s: string): string {
	return isWindows() ? s : s.replace(/'/g, "'\\''");
}

/**
 * Quotes `s` as a single shell word. Callers must pass the raw value; it is
 * escaped here, so never pre-escape it.
 */
export function quote(s: string): string {
	if (isWindows()) {
		const escaped = s.replace(/"/g, '""');
		return `"${escaped}"`;
	}

	return `'${escapeSingleQuotes(s)}'`;
}

export function unquote(s: string): string {
	if (QUOTES.has(s[0])) {
		s = s.substring(1);
	}

	if (QUOTES.has(s[s.length - 1])) {
		s = s.substring(0, s.length - 1);
	}

	return s;
}
