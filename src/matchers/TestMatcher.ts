import * as vscode from 'vscode';
import { JestAssertionResult } from '../testResultTypes';

export type IndexedResult = { result: JestAssertionResult; index: number };

const TEMPLATE_VAR_REGEX = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/i;

/**
 * Escapes regex special characters in the test label while preserving
 * template variable patterns which get replaced with (.*?)
 */
function escapeRegExpWithTemplateVars(testLabel: string): string {
    const templateVarRegex = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/gi;
    const placeholder = '\x00TEMPLATE\x00';
    const templateVars: string[] = [];

    // Replace template vars with placeholders
    const withPlaceholders = testLabel.replace(templateVarRegex, (match) => {
        templateVars.push(match);
        return placeholder;
    });

    // Escape regex special characters in the non-template parts
    const escaped = withPlaceholders.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Replace placeholders back with (.*?)
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

/**
 * Checks if the string is ONLY a template variable (e.g., "%d", "$foo")
 * which would result in a regex that matches everything.
 */
const isOnlyTemplateVar = (label: string): boolean => {
    const trimmed = label.trim();
    return /^(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])$/i.test(trimmed);
};

/**
 * Gets the ancestor titles (parent describe blocks) from a TestItem's hierarchy.
 */
const getAncestorTitles = (test: vscode.TestItem): string[] => {
    const titles: string[] = [];
    let parent = test.parent;
    while (parent) {
        // Skip file-level items (they have a URI that matches their id)
        if (parent.uri && parent.id !== parent.uri.fsPath) {
            titles.unshift(parent.label);
        }
        parent = parent.parent;
    }
    return titles;
};

/**
 * Checks if the result's ancestorTitles match the test's ancestor hierarchy.
 * Used for template-only labels where we can't match by test name.
 */
const matchesByAncestors = (
    r: JestAssertionResult,
    test: vscode.TestItem,
): boolean => {
    const testAncestors = getAncestorTitles(test);
    const resultAncestors = r.ancestorTitles ?? [];

    // If test has no ancestors, only match if result also has no ancestors
    // (single test at file level)
    if (testAncestors.length === 0) {
        return resultAncestors.length === 0;
    }

    // Check if result ancestors end with the test ancestors
    // This handles nested describes where result might have more ancestors
    if (resultAncestors.length < testAncestors.length) {
        return false;
    }

    // Compare from the end (most specific ancestor)
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

    // For template-only labels (e.g., "$description"), match by ancestor titles
    // instead of by regex which would match everything
    if (isOnlyTemplateVar(test.label)) {
        return matchesByAncestors(r, test);
    }

    // Skip testName matching if it's only a template variable (would match everything)
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
