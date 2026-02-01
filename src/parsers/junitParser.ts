import { JestResults, JestAssertionResult, JestFileResult } from '../testResultTypes';

/**
 * Parses JUnit XML output from Bun/Deno into JestResults format.
 * Uses regex to avoid adding XML parser dependencies.
 */
export function parseJUnitXML(xml: string): JestResults | undefined {
    // Basic validation
    if (!xml.includes('<testsuite') && !xml.includes('<testsuites')) {
        return undefined;
    }

    let startTime = Date.now();
    let numTotalTests = 0;
    let numFailedTests = 0;
    let numPassedTests = 0;
    let numPendingTests = 0;

    const resultsByFile = new Map<string, JestFileResult>();

    // Improved regex to handle self-closing tags vs open tags
    // 1. Self-closing: <testcase ... />
    // 2. Open-close:   <testcase ...> ... </testcase>
    // We search globally for both patterns.
    // Note: [\s\S]*? is non-greedy match for content
    const caseRegex = /<testcase\s+([^>]*?)\/>|<testcase\s+([^>]*?)>([\s\S]*?)<\/testcase>/g;
    let caseMatch;

    while ((caseMatch = caseRegex.exec(xml)) !== null) {
        // Group 1: attributes for self-closing
        // Group 2: attributes for open-close
        // Group 3: content for open-close
        const attributesStr = caseMatch[1] || caseMatch[2];
        const content = caseMatch[3] || '';
        const attributes = parseAttributes(attributesStr);

        const name = attributes['name'];
        if (!name) continue;

        const file = attributes['file'] || 'unknown';

        let fileResult = resultsByFile.get(file);
        if (!fileResult) {
            fileResult = {
                status: 'passed',
                startTime,
                endTime: Date.now(),
                name: file,
                assertionResults: [],
                message: '',
                summary: ''
            };
            resultsByFile.set(file, fileResult);
        }

        const duration = parseFloat(attributes['time'] || '0') * 1000;
        let status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo' = 'passed';
        let failureMessages: string[] = [];

        // Check for failure/error/skipped
        if (content.includes('<failure') || content.includes('<error')) {
            status = 'failed';
            fileResult.status = 'failed';

            const messageMatch = /message="([^"]*)"/.exec(content);
            const textMatch = />([^<]*)<\/(failure|error)>/.exec(content);

            const message = messageMatch ? unescapeXml(messageMatch[1]) : '';
            const stack = textMatch ? unescapeXml(textMatch[1]) : '';

            failureMessages.push(message + (stack ? '\n' + stack : ''));
        } else if (content.includes('<skipped') || content.includes('<skipped/>')) {
            status = 'skipped';
        }

        fileResult.assertionResults.push({
            status,
            title: name,
            fullName: name,
            ancestorTitles: [], // We don't have full ancestor path easily in flattened mode
            duration,
            failureMessages,
            location: attributes['line'] ? {
                line: parseInt(attributes['line'], 10),
                column: 0
            } : undefined
        });

        if (status === 'passed') numPassedTests++;
        else if (status === 'failed') numFailedTests++;
        else numPendingTests++;
        numTotalTests++;
    }

    return {
        success: numFailedTests === 0,
        numTotalTestSuites: resultsByFile.size,
        numPassedTests,
        numFailedTests,
        numPendingTests,
        numTotalTests,
        numFailedTestSuites: Array.from(resultsByFile.values()).filter(r => r.status === 'failed').length,
        numPassedTestSuites: Array.from(resultsByFile.values()).filter(r => r.status === 'passed').length,
        numPendingTestSuites: 0,
        testResults: Array.from(resultsByFile.values()),
    };
}

function parseAttributes(attributesStr: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let match;
    while ((match = attrRegex.exec(attributesStr)) !== null) {
        attributes[match[1]] = unescapeXml(match[2]);
    }
    return attributes;
}

function unescapeXml(str: string): string {
    return str
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}
