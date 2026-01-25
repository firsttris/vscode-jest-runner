
import * as vscode from 'vscode';
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

        expect(run.passed).toHaveBeenCalledWith(testItem1);
        expect(run.failed).toHaveBeenCalledWith(testItem2, expect.any(Object));
    });
});
