import { processTestResults } from '../testResultProcessor';
import { TestItem, TestRun, Uri } from './__mocks__/vscode';

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
                    assertionResults: [
                        { title: 'test1', status: 'passed' }
                    ]
                },
                {
                    assertionResults: [
                        { title: 'test2', status: 'failed', failureMessages: ['failed'] }
                    ]
                }
            ]
        });

        // Cast to any to bypass strict type check between mock and real vscode types
        processTestResults(output, tests as any, run as any, 'jest');

        expect(run.passed).toHaveBeenCalledWith(testItem1, undefined);
        expect(run.failed).toHaveBeenCalledWith(testItem2, expect.any(Object), undefined);
    });

    it('should correctly match it.each tests with regex special characters', () => {
        // Test with regex special character '+' in the test name template
        const eachTestItem = new TestItem('adds %d + %d', 'adds %d + %d', Uri.file('/test1'));
        const failedTestItem = new TestItem('other test fails', 'other test fails', Uri.file('/test1'));
        const testItems = [eachTestItem, failedTestItem];

        const output = JSON.stringify({
            testResults: [
                {
                    assertionResults: [
                        { title: 'adds 1 + 2', status: 'passed' },
                        { title: 'adds 3 + 4', status: 'passed' },
                        { title: 'other test fails', status: 'failed', failureMessages: ['some error'] }
                    ]
                }
            ]
        });

        const testRun = new TestRun();
        processTestResults(output, testItems as any, testRun as any, 'jest');

        // The it.each test should be passed (all instances passed)
        expect(testRun.passed).toHaveBeenCalledWith(eachTestItem, 0);
        // The other test should be failed
        expect(testRun.failed).toHaveBeenCalledWith(failedTestItem, expect.any(Object), undefined);
    });

    it('should not match unrelated tests due to unescaped regex characters', () => {
        // Test that "adds %d + %d" pattern does NOT match "adds items to cart"
        // This would happen if the '+' is not escaped (it becomes a quantifier)
        const eachTestItem = new TestItem('adds %d + %d', 'adds %d + %d', Uri.file('/test1'));
        const testItems = [eachTestItem];

        const output = JSON.stringify({
            testResults: [
                {
                    assertionResults: [
                        { title: 'adds items to cart', status: 'failed', failureMessages: ['error'] }
                    ]
                }
            ]
        });

        const testRun = new TestRun();
        processTestResults(output, testItems as any, testRun as any, 'jest');

        // The it.each test should NOT match "adds items to cart" and should be skipped
        expect(testRun.skipped).toHaveBeenCalledWith(eachTestItem);
        expect(testRun.failed).not.toHaveBeenCalled();
    });
});
