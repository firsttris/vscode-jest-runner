import * as vscode from 'vscode';
import {
  setupTestController,
  createMockProcess,
  TestItem,
  CancellationToken,
  TestControllerSetup,
} from './testControllerSetup';

jest.mock('child_process');

describe('JestTestController - it.each parameterized tests', () => {
  let setup: TestControllerSetup;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();
  });

  afterEach(() => {
    setup.controller?.dispose();
    jest.restoreAllMocks();
  });

  it('should match it.each tests with $variable template', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;

    const testItem = new TestItem(
      'test1',
      '$description',
      vscode.Uri.file('/workspace/test.ts'),
    );
    testItem.uri = vscode.Uri.file('/workspace/test.ts');
    mockTestController.items.add(testItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [testItem], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      const jestOutput = JSON.stringify({
        success: true,
        testResults: [
          {
            assertionResults: [
              {
                title: 'should exclude lowercase',
                status: 'passed',
                ancestorTitles: [],
              },
              {
                title: 'should exclude uppercase',
                status: 'passed',
                ancestorTitles: [],
              },
              {
                title: 'should keep other tags',
                status: 'passed',
                ancestorTitles: [],
              },
            ],
          },
        ],
      });
      mockProcess.stdout.emit('data', jestOutput);
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.passed).toHaveBeenCalled();
  });

  it('should aggregate it.each results - all pass', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;

    const testItem = new TestItem(
      'test1',
      '$case',
      vscode.Uri.file('/workspace/test.ts'),
    );
    testItem.uri = vscode.Uri.file('/workspace/test.ts');
    mockTestController.items.add(testItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [testItem], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      const jestOutput = JSON.stringify({
        success: true,
        testResults: [
          {
            assertionResults: [
              { title: 'case 1', status: 'passed', ancestorTitles: [] },
              { title: 'case 2', status: 'passed', ancestorTitles: [] },
              { title: 'case 3', status: 'passed', ancestorTitles: [] },
            ],
          },
        ],
      });
      mockProcess.stdout.emit('data', jestOutput);
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.passed).toHaveBeenCalled();
    expect(mockRun.failed).not.toHaveBeenCalled();
  });

  it('should aggregate it.each results - some fail', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;

    const testItem = new TestItem(
      'test1',
      '$case',
      vscode.Uri.file('/workspace/test.ts'),
    );
    testItem.uri = vscode.Uri.file('/workspace/test.ts');
    mockTestController.items.add(testItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [testItem], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      const jestOutput = JSON.stringify({
        success: false,
        testResults: [
          {
            assertionResults: [
              { title: 'case 1', status: 'passed', ancestorTitles: [] },
              {
                title: 'case 2',
                status: 'failed',
                failureMessages: ['Expected 1 to be 2'],
                ancestorTitles: [],
              },
              { title: 'case 3', status: 'passed', ancestorTitles: [] },
            ],
          },
        ],
      });
      mockProcess.stdout.emit('data', jestOutput);
      mockProcess.emit('close', 1);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.failed).toHaveBeenCalled();
  });

  it('should handle %s and %p template variables', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;

    const testItem = new TestItem(
      'test1',
      'should handle %s with %p',
      vscode.Uri.file('/workspace/test.ts'),
    );
    testItem.uri = vscode.Uri.file('/workspace/test.ts');
    mockTestController.items.add(testItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [testItem], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      const jestOutput = JSON.stringify({
        success: true,
        testResults: [
          {
            assertionResults: [
              {
                title: 'should handle string with 123',
                status: 'passed',
                ancestorTitles: [],
              },
              {
                title: 'should handle array with [1, 2]',
                status: 'passed',
                ancestorTitles: [],
              },
            ],
          },
        ],
      });
      mockProcess.stdout.emit('data', jestOutput);
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.passed).toHaveBeenCalled();
  });

  it('should handle nested describe with it.each', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;

    const fileItem = new TestItem(
      '/workspace/test.ts',
      'test.ts',
      vscode.Uri.file('/workspace/test.ts'),
    );
    fileItem.uri = vscode.Uri.file('/workspace/test.ts');

    const describeItem = new TestItem(
      'describe1',
      'testTagsFilter',
      vscode.Uri.file('/workspace/test.ts'),
    );
    describeItem.uri = vscode.Uri.file('/workspace/test.ts');
    describeItem.parent = fileItem;

    const testItem = new TestItem(
      'test1',
      '$description',
      vscode.Uri.file('/workspace/test.ts'),
    );
    testItem.uri = vscode.Uri.file('/workspace/test.ts');
    testItem.parent = describeItem;

    describeItem.children.add(testItem);
    fileItem.children.add(describeItem);
    mockTestController.items.add(fileItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [testItem], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      const jestOutput = JSON.stringify({
        success: true,
        testResults: [
          {
            assertionResults: [
              {
                title: 'should exclude tags with testzugang (lowercase)',
                status: 'passed',
                ancestorTitles: ['testTagsFilter'],
              },
              {
                title: 'should exclude tags with testzugang (uppercase)',
                status: 'passed',
                ancestorTitles: ['testTagsFilter'],
              },
              {
                title: 'should keep tags with other values',
                status: 'passed',
                ancestorTitles: ['testTagsFilter'],
              },
            ],
          },
        ],
      });
      mockProcess.stdout.emit('data', jestOutput);
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.passed).toHaveBeenCalled();
  });
});
