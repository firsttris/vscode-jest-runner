import * as vscode from 'vscode';
import { JestAssertionResult } from '../testResultTypes';

export type IndexedResult = { result: JestAssertionResult; index: number };

const TEMPLATE_VAR_REGEX = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/i;

function escapeRegExpWithTemplateVars(testLabel: string): string {
    const templateVarRegex = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/gi;
    const placeholder = '\x00TEMPLATE\x00';
    const templateVars: string[] = [];
    const withPlaceholders = testLabel.replace(templateVarRegex, (match) => {
        templateVars.push(match);
        return placeholder;
    });

    const escaped = withPlaceholders.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let result = escaped;
    for (let i = 0; i < templateVars.length; i++) {
        result = result.replace(placeholder, '(.*?)');
    }

    return result;
}

function matchesTestLabel(resultTitle: string, testLabel: string): boolean {
    if (resultTitle === testLabel) {
        return true;
    }

    const hasTemplateVar = TEMPLATE_VAR_REGEX.test(testLabel);
    if (hasTemplateVar) {
        const pattern = escapeRegExpWithTemplateVars(testLabel);
        try {
            const regex = new RegExp(`^${pattern}$`);
            return regex.test(resultTitle);
        } catch {
            return false;
        }
    }

    return false;
}

export const hasTemplateVariable = (label: string): boolean =>
    TEMPLATE_VAR_REGEX.test(label);

const isOnlyTemplateVar = (label: string): boolean => {
    const trimmed = label.trim();
    return /^(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])$/i.test(trimmed);
};

const getAncestorTitles = (test: vscode.TestItem): string[] => {
    const titles: string[] = [];
    let parent = test.parent;
    while (parent) {
        if (parent.uri && parent.id !== parent.uri.fsPath) {
            titles.unshift(parent.label);
        }
        parent = parent.parent;
    }
    return titles;
};

const matchesByAncestors = (
    r: JestAssertionResult,
    test: vscode.TestItem,
): boolean => {
    const testAncestors = getAncestorTitles(test);
    const resultAncestors = r.ancestorTitles ?? [];

    if (testAncestors.length === 0) {
        return resultAncestors.length === 0;
    }
    if (resultAncestors.length < testAncestors.length) {
        return false;
    }
    const offset = resultAncestors.length - testAncestors.length;
    return testAncestors.every(
        (title, i) => resultAncestors[offset + i] === title,
    );
};

const getTestName = (test: vscode.TestItem): string =>
    test.label.split(' ').pop() || test.label;

const matchesTest = (r: JestAssertionResult, test: vscode.TestItem): boolean => {
    const testName = getTestName(test);
    const fullPath = r.ancestorTitles?.concat(r.title).join(' ') ?? '';

    const matchesWithSuffix = (actual: string, expected: string) => {
        if (!actual.startsWith(expected)) {
            return false;
        }
        const suffix = actual.slice(expected.length);
        return /^ \(\d+\)$/.test(suffix);
    };

    if (isOnlyTemplateVar(test.label)) {
        return matchesByAncestors(r, test);
    }

    const testNameMatches =
        !isOnlyTemplateVar(testName) && matchesTestLabel(r.title, testName);

    return (
        matchesTestLabel(r.title, test.label) ||
        testNameMatches ||
        matchesWithSuffix(r.title, test.label) ||
        matchesWithSuffix(fullPath, test.label) ||
        r.fullName === test.label ||
        matchesTestLabel(fullPath, test.label)
    );
};

export const findPotentialMatches = (
    testResults: JestAssertionResult[],
    test: vscode.TestItem,
): IndexedResult[] =>
    testResults
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => matchesTest(result, test));

export const findBestMatch = (
    matches: IndexedResult[],
    testLine: number | undefined,
    usedIndices: Set<number>,
): IndexedResult | undefined => {
    const isUnused = (m: IndexedResult) => !usedIndices.has(m.index);
    const matchesLine = (m: IndexedResult) =>
        m.result.location?.line === (testLine ?? -1) + 1;

    return (
        matches.find((m) => isUnused(m) && matchesLine(m)) || matches.find(isUnused)
    );
};
