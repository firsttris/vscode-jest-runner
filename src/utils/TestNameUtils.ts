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
    const variableRegex = /(\${?[A-Za-z0-9_]+}?|%[psdifjo#%])/gi;
    const matchAny = '(.*?)';
    return s.replace(variableRegex, matchAny);
}

export function updateTestNameIfUsingProperties(receivedTestName?: string): string | undefined {
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
        if (element.type === 'describe' && selectedLine === element.start.line) {
            return resolveTestNameStringInterpolation(element.name);
        }
        if (
            element.type !== 'describe' &&
            selectedLine >= element.start.line &&
            selectedLine <= element.end.line
        ) {
            const name = resolveTestNameStringInterpolation(element.name);
            return updateTestNameIfUsingProperties(name);
        }
    }
    for (const element of children) {
        const result = findFullTestName(selectedLine, element.children || []);
        if (result) {
            const parentName = resolveTestNameStringInterpolation(element.name);
            const cleanParentName = updateTestNameIfUsingProperties(parentName);
            return (cleanParentName || parentName) + ' ' + result;
        }
    }
}

export function escapeSingleQuotes(s: string): string {
    return isWindows() ? s : s.replace(/'/g, "'\\''");
}

export function quote(s: string): string {
    const q = isWindows() ? '"' : `'`;
    return `${q}${s}${q}`;
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
