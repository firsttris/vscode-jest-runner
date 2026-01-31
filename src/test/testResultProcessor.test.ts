import {
    processTestResults,
    parseJestOutput,
    parseVitestOutput,
    convertVitestToJestResults,
} from '../testResultProcessor';
import { TestItem, TestRun, Uri } from './__mocks__/vscode';

describe('testResultProcessor', () => {
    describe('parseJestOutput', () => {
        it('should parse valid Jest JSON output', () => {
            const output = JSON.stringify({
                numFailedTestSuites: 0,
                numFailedTests: 0,
                numPassedTestSuites: 1,
                numPassedTests: 2,
                numPendingTestSuites: 0,
                numPendingTests: 0,
                numTotalTestSuites: 1,
                numTotalTests: 2,
                success: true,
                testResults: [
                    {
                        assertionResults: [
                            { title: 'test1', status: 'passed' },
                            { title: 'test2', status: 'passed' },
                        ],
                    },
                ],
            });

            const result = parseJestOutput(output);

            expect(result).toBeDefined();
            expect(result!.numPassedTests).toBe(2);
            expect(result!.success).toBe(true);
        });

        it('should handle whitespace around valid JSON', () => {
            const output = `
            ${JSON.stringify({
                testResults: [{ assertionResults: [] }],
            })}
            `;

            const result = parseJestOutput(output);

            expect(result).toBeDefined();
        });

        it('should extract JSON from mixed output with Nx logs', () => {
            const output = `> nx run myproject:test
> jest --passWithNoTests
{"numFailedTestSuites":0,"numPassedTestSuites":1,"testResults":[{"assertionResults":[]}]}`;

            const result = parseJestOutput(output);

            expect(result).toBeDefined();
            expect(result!.numFailedTestSuites).toBe(0);
        });

        it('should extract JSON starting with testResults', () => {
            const output = `Some log output
{"testResults":[{"assertionResults":[{"title":"test","status":"passed"}]}]}
More log output`;

            const result = parseJestOutput(output);

            expect(result).toBeDefined();
        });

        it('should extract JSON starting with numTotalTestSuites', () => {
            const output = `prefix {"numTotalTestSuites":1,"testResults":[]} suffix`;

            const result = parseJestOutput(output);

            expect(result).toBeDefined();
        });

        it('should return undefined for invalid JSON', () => {
            const output = 'not valid json at all';

            const result = parseJestOutput(output);

            expect(result).toBeUndefined();
        });

        it('should return undefined for JSON that is not Jest results', () => {
            const output = JSON.stringify({ foo: 'bar', baz: 123 });

            const result = parseJestOutput(output);

            expect(result).toBeUndefined();
        });

        it('should handle nested braces in strings correctly', () => {
            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            {
                                title: 'test with { braces }',
                                status: 'passed',
                            },
                        ],
                    },
                ],
            });

            const result = parseJestOutput(output);

            expect(result).toBeDefined();
            expect(result!.testResults[0].assertionResults[0].title).toBe('test with { braces }');
        });

        it('should handle escaped quotes in strings', () => {
            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            {
                                title: 'test with "quotes"',
                                status: 'passed',
                            },
                        ],
                    },
                ],
            });

            const result = parseJestOutput(output);

            expect(result).toBeDefined();
        });
    });

    describe('parseVitestOutput', () => {
        it('should parse valid Vitest JSON output', () => {
            const output = JSON.stringify({
                numFailedTestSuites: 0,
                numPassedTestSuites: 1,
                testResults: [
                    {
                        assertionResults: [{ title: 'test', status: 'passed' }],
                    },
                ],
            });

            const result = parseVitestOutput(output);

            expect(result).toBeDefined();
        });

        it('should extract JSON from mixed Vitest output', () => {
            const output = `stdout | test.spec.ts > suite > test
console output
{"numFailedTestSuites":0,"testResults":[{"assertionResults":[]}]}`;

            const result = parseVitestOutput(output);

            expect(result).toBeDefined();
        });

        it('should return undefined for invalid JSON', () => {
            const output = 'not json';

            const result = parseVitestOutput(output);

            expect(result).toBeUndefined();
        });
    });

    describe('convertVitestToJestResults', () => {
        it('should return already-formatted Jest results unchanged', () => {
            const vitestOutput = {
                numFailedTestSuites: 1,
                numFailedTests: 2,
                numPassedTestSuites: 0,
                numPassedTests: 0,
                numPendingTestSuites: 0,
                numPendingTests: 0,
                numTotalTestSuites: 1,
                numTotalTests: 2,
                success: false,
                testResults: [],
            };

            const result = convertVitestToJestResults(vitestOutput);

            expect(result).toEqual(vitestOutput);
        });

        it('should convert partial Vitest output with defaults', () => {
            const vitestOutput = {
                testResults: [{ assertionResults: [] }],
            };

            const result = convertVitestToJestResults(vitestOutput);

            expect(result.numFailedTestSuites).toBe(0);
            expect(result.numPassedTestSuites).toBe(0);
            expect(result.numPendingTests).toBe(0);
            expect(result.testResults).toEqual([{ assertionResults: [] }]);
        });

        it('should infer success from numFailedTests when not provided', () => {
            const vitestOutput = {
                numFailedTests: 0,
                testResults: [],
            };

            const result = convertVitestToJestResults(vitestOutput);

            expect(result.success).toBe(true);
        });

        it('should use provided success value', () => {
            const vitestOutput = {
                success: false,
                numFailedTests: 0,
                testResults: [],
            };

            const result = convertVitestToJestResults(vitestOutput);

            expect(result.success).toBe(false);
        });
    });

    describe('processTestResults', () => {
        let run: TestRun;
        let tests: TestItem[];
        let testItem1: TestItem;
        let testItem2: TestItem;

        beforeEach(() => {
            run = new TestRun();
            testItem1 = new TestItem('test1', 'test1', Uri.file('/test1'));
            testItem2 = new TestItem('test2', 'test2', Uri.file('/test2'));
            tests = [testItem1, testItem2];
        });

        it('should process results from multiple files', () => {
            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [{ title: 'test1', status: 'passed' }],
                    },
                    {
                        assertionResults: [
                            { title: 'test2', status: 'failed', failureMessages: ['failed'] },
                        ],
                    },
                ],
            });

            processTestResults(output, tests as any, run as any, 'jest');

            expect(run.passed).toHaveBeenCalledWith(testItem1, undefined);
            expect(run.failed).toHaveBeenCalledWith(testItem2, expect.any(Object), undefined);
        });

        it('should correctly match it.each tests with regex special characters', () => {
            const eachTestItem = new TestItem('adds %d + %d', 'adds %d + %d', Uri.file('/test1'));
            const failedTestItem = new TestItem(
                'other test fails',
                'other test fails',
                Uri.file('/test1'),
            );
            const testItems = [eachTestItem, failedTestItem];

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            { title: 'adds 1 + 2', status: 'passed' },
                            { title: 'adds 3 + 4', status: 'passed' },
                            { title: 'other test fails', status: 'failed', failureMessages: ['some error'] },
                        ],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, testItems as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalledWith(eachTestItem, 0);
            expect(testRun.failed).toHaveBeenCalledWith(failedTestItem, expect.any(Object), undefined);
        });

        it('should not match unrelated tests due to unescaped regex characters', () => {
            const eachTestItem = new TestItem('adds %d + %d', 'adds %d + %d', Uri.file('/test1'));
            const testItems = [eachTestItem];

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            { title: 'adds items to cart', status: 'failed', failureMessages: ['error'] },
                        ],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, testItems as any, testRun as any, 'jest');

            expect(testRun.skipped).toHaveBeenCalledWith(eachTestItem);
            expect(testRun.failed).not.toHaveBeenCalled();
        });

        it('should handle Vitest framework', () => {
            const testItem = new TestItem('vitest test', 'vitest test', Uri.file('/test.ts'));

            const output = JSON.stringify({
                numFailedTestSuites: 0,
                testResults: [
                    {
                        assertionResults: [{ title: 'vitest test', status: 'passed' }],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'vitest');

            expect(testRun.passed).toHaveBeenCalledWith(testItem, undefined);
        });

        it('should handle node-test framework with TAP output', () => {
            const testItem = new TestItem('node test', 'node test', Uri.file('/test.js'));

            const output = `TAP version 14
# Subtest: node test
ok 1 - node test
1..1`;

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'node-test');

            expect(testRun.passed).toHaveBeenCalled();
        });

        it('should mark tests as skipped when no assertion results found', () => {
            const output = JSON.stringify({
                testResults: [],
            });

            const testRun = new TestRun();
            processTestResults(output, tests as any, testRun as any, 'jest');

            expect(testRun.skipped).toHaveBeenCalledWith(testItem1);
            expect(testRun.skipped).toHaveBeenCalledWith(testItem2);
        });

        it('should handle skipped test status', () => {
            const testItem = new TestItem('skipped test', 'skipped test', Uri.file('/test.ts'));

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [{ title: 'skipped test', status: 'skipped' }],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.skipped).toHaveBeenCalledWith(testItem);
        });

        it('should match by fullName', () => {
            const testItem = new TestItem(
                'describe block test name',
                'describe block test name',
                Uri.file('/test.ts'),
            );

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            {
                                title: 'test name',
                                fullName: 'describe block test name',
                                ancestorTitles: ['describe block'],
                                status: 'passed',
                            },
                        ],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalledWith(testItem, undefined);
        });

        it('should set failure location when available', () => {
            const testItem = new TestItem('failing test', 'failing test', Uri.file('/test.ts'));

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            {
                                title: 'failing test',
                                status: 'failed',
                                failureMessages: ['Error'],
                                location: { line: 10, column: 5 },
                            },
                        ],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.failed).toHaveBeenCalled();
            const failedCall = (testRun.failed as jest.Mock).mock.calls[0];
            expect(failedCall[1].location).toBeDefined();
        });

        it('should include duration in passed tests', () => {
            const testItem = new TestItem('timed test', 'timed test', Uri.file('/test.ts'));

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            {
                                title: 'timed test',
                                status: 'passed',
                                duration: 123,
                            },
                        ],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalledWith(testItem, 123);
        });

        it('should match test by short name when last word matches', () => {
            const testItem = new TestItem('describe shortName', 'describe shortName', Uri.file('/test.ts'));

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            {
                                title: 'shortName',
                                status: 'passed',
                            },
                        ],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalledWith(testItem, undefined);
        });
    });

    describe('processTestResults fallback', () => {
        it('should mark as passed when PASS indicator is present', () => {
            const testItem = new TestItem('test', 'test', Uri.file('/test.ts'));
            const output = 'PASS src/test.spec.ts\n  ✓ test (5 ms)';

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalledWith(testItem);
        });

        it('should mark as failed when FAIL indicator with test name is present', () => {
            const testItem = new TestItem('failing test', 'failing test', Uri.file('/test.ts'));
            const output = `FAIL src/test.spec.ts
  ● failing test
    Error: expected true to be false`;

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.failed).toHaveBeenCalled();
        });

        it('should mark as errored when no pass/fail indicators found', () => {
            const testItem = new TestItem('test', 'test', Uri.file('/test.ts'));
            const output = 'some random output without indicators';

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.errored).toHaveBeenCalled();
        });

        it('should handle checkmark pass indicator', () => {
            const testItem = new TestItem('test', 'test', Uri.file('/test.ts'));
            const output = '✓ test passed';

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalledWith(testItem);
        });

        it('should handle X failure indicator', () => {
            const testItem = new TestItem('failing', 'failing', Uri.file('/test.ts'));
            const output = '✗ failing test\nError: assertion failed';

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.failed).toHaveBeenCalled();
        });
    });

    describe('template variable matching', () => {
        it('should match %s placeholder', () => {
            const testItem = new TestItem('test %s value', 'test %s value', Uri.file('/test.ts'));

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            { title: 'test hello value', status: 'passed' },
                            { title: 'test world value', status: 'passed' },
                        ],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalled();
        });

        it('should match $variable placeholder', () => {
            const testItem = new TestItem('test $value', 'test $value', Uri.file('/test.ts'));

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [{ title: 'test 42', status: 'passed' }],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalled();
        });

        it('should match ${variable} placeholder', () => {
            const testItem = new TestItem('test ${name}', 'test ${name}', Uri.file('/test.ts'));

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [{ title: 'test John', status: 'passed' }],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalled();
        });

        it('should aggregate multiple template test results', () => {
            const testItem = new TestItem('test %d', 'test %d', Uri.file('/test.ts'));

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [
                            { title: 'test 1', status: 'passed', duration: 10 },
                            { title: 'test 2', status: 'passed', duration: 20 },
                            { title: 'test 3', status: 'failed', failureMessages: ['error'] },
                        ],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.failed).toHaveBeenCalled();
        });

        it('should match tests with parenthesis suffix (retry numbering)', () => {
            const testItem = new TestItem('my test', 'my test', Uri.file('/test.ts'));

            const output = JSON.stringify({
                testResults: [
                    {
                        assertionResults: [{ title: 'my test (1)', status: 'passed' }],
                    },
                ],
            });

            const testRun = new TestRun();
            processTestResults(output, [testItem] as any, testRun as any, 'jest');

            expect(testRun.passed).toHaveBeenCalled();
        });
    });
});
