import { JestResults } from '../testResultTypes';
import { logError, logWarning } from '../utils/Logger';

/**
 * Validates that a parsed object looks like Jest test results
 */
function isJestResults(obj: unknown): obj is JestResults {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        'testResults' in obj &&
        Array.isArray((obj as JestResults).testResults)
    );
}

/**
 * Extract JSON from mixed stdout output.
 * Nx/monorepo wrappers often prepend log messages before Jest's JSON output.
 * This function finds and extracts the JSON object from the output.
 */
function extractJsonFromOutput(output: string): string | undefined {
    // Try to find the start of Jest JSON output
    // Jest JSON always starts with {"numFailedTestSuites": or {"testResults":
    const jsonPatterns = [
        '{"numFailedTestSuites"',
        '{"testResults"',
        '{"numTotalTestSuites"',
    ];

    for (const pattern of jsonPatterns) {
        const startIndex = output.indexOf(pattern);
        if (startIndex !== -1) {
            // Find the matching closing brace by counting braces
            let braceCount = 0;
            let inString = false;
            let escapeNext = false;

            for (let i = startIndex; i < output.length; i++) {
                const char = output[i];

                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }

                if (char === '\\' && inString) {
                    escapeNext = true;
                    continue;
                }

                if (char === '"' && !escapeNext) {
                    inString = !inString;
                    continue;
                }

                if (!inString) {
                    if (char === '{') braceCount++;
                    else if (char === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            return output.slice(startIndex, i + 1);
                        }
                    }
                }
            }
        }
    }

    return undefined;
}

/**
 * Parse Jest JSON output.
 * Handles both clean JSON and mixed output with prepended log messages.
 */
export function parseJestOutput(output: string): JestResults | undefined {
    // First try to parse the whole output as JSON (fast path)
    try {
        const trimmed = output.trim();
        const parsed = JSON.parse(trimmed);
        if (isJestResults(parsed)) {
            return parsed;
        }
    } catch {
        // Not valid JSON, try to extract it
    }

    // Try to extract JSON from mixed output (Nx/monorepo case)
    const extracted = extractJsonFromOutput(output);
    if (extracted) {
        try {
            const parsed = JSON.parse(extracted);
            if (isJestResults(parsed)) {
                return parsed;
            }
        } catch (e) {
            logError(`Failed to parse extracted Jest JSON: ${e}`);
        }
    }

    logWarning('Could not find valid Jest JSON in output');
    return undefined;
}

export function convertVitestToJestResults(vitestOutput: any): JestResults {
    if (vitestOutput.numFailedTestSuites !== undefined) {
        return vitestOutput as JestResults;
    }

    const results: JestResults = {
        numFailedTestSuites: vitestOutput.numFailedTestSuites || 0,
        numFailedTests: vitestOutput.numFailedTests || 0,
        numPassedTestSuites: vitestOutput.numPassedTestSuites || 0,
        numPassedTests: vitestOutput.numPassedTests || 0,
        numPendingTestSuites: vitestOutput.numPendingTestSuites || 0,
        numPendingTests: vitestOutput.numPendingTests || 0,
        numTotalTestSuites: vitestOutput.numTotalTestSuites || 0,
        numTotalTests: vitestOutput.numTotalTests || 0,
        success: vitestOutput.success ?? vitestOutput.numFailedTests === 0,
        testResults: vitestOutput.testResults || [],
    };

    return results;
}

/**
 * Parse Vitest JSON output.
 * Handles both clean JSON and mixed output with prepended log messages.
 */
export function parseVitestOutput(output: string): JestResults | undefined {
    // First try to parse the whole output as JSON (fast path)
    try {
        const trimmed = output.trim();
        const parsed = JSON.parse(trimmed);
        return convertVitestToJestResults(parsed);
    } catch {
        // Not valid JSON, try to extract it
    }

    // Try to extract JSON from mixed output (Nx/monorepo case)
    const extracted = extractJsonFromOutput(output);
    if (extracted) {
        try {
            const parsed = JSON.parse(extracted);
            return convertVitestToJestResults(parsed);
        } catch (e) {
            logError(`Failed to parse extracted Vitest JSON: ${e}`);
        }
    }

    logWarning('Could not find valid Vitest JSON in output');
    return undefined;
}
