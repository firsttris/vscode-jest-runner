import * as vscode from 'vscode';
import * as parser from '../parser';
import { JestTestController } from '../TestController';
import {
  setupTestController,
  createMockProcess,
  TestItem,
  CancellationToken,
  TestControllerSetup,
} from './testControllerSetup';

jest.mock('child_process');

describe('JestTestController - edge cases', () => {
  let setup: TestControllerSetup;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();
  });

  afterEach(() => {
    setup.controller?.dispose();
    jest.restoreAllMocks();
  });

  it('should handle multiple files in single run', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;

    const test1 = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test1.ts'),
    );
    const test2 = new TestItem(
      'test2',
      'Test 2',
      vscode.Uri.file('/workspace/test2.ts'),
    );

    mockTestController.items.add(test1);
    mockTestController.items.add(test2);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [test1, test2], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [
            { assertionResults: [{ title: 'Test 1', status: 'passed' }] },
            { assertionResults: [{ title: 'Test 2', status: 'passed' }] },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.passed).toHaveBeenCalled();
  });

  it('should handle excluded tests in request', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;

    const test1 = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    const test2 = new TestItem(
      'test2',
      'Test 2',
      vscode.Uri.file('/workspace/test.ts'),
    );

    mockTestController.items.add(test1);
    mockTestController.items.add(test2);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [test1, test2], exclude: [test2] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [
            { assertionResults: [{ title: 'Test 1', status: 'passed' }] },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.started).toHaveBeenCalledTimes(1);
  });

  it('should handle test names with special characters', () => {
    (parser.parse as jest.Mock).mockReturnValue({
      root: {
        children: [
          {
            type: 'test',
            name: 'should handle "quotes" and (parens)',
            start: { line: 1, column: 0 },
            end: { line: 3, column: 0 },
            children: [],
          },
        ],
      },
    } as any);

    const newController = new JestTestController(setup.mockContext);

    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[1].value;

    const onOpenCallback = (vscode.workspace.onDidOpenTextDocument as jest.Mock)
      .mock.calls[1][0];

    (mockTestController.createTestItem as jest.Mock).mockClear();

    const mockDocument = {
      uri: vscode.Uri.file('/workspace/special.test.ts'),
      getText: () => 'it("should handle \\"quotes\\" and (parens)", () => {})',
    };

    onOpenCallback(mockDocument);

    expect(mockTestController.createTestItem).toHaveBeenCalled();

    newController.dispose();
  });

  it('should handle tests with no start location', () => {
    jest.spyOn(parser, 'parse').mockReturnValue({
      root: {
        children: [
          {
            type: 'test',
            name: 'test without location',
            children: [],
          },
        ],
      },
    } as any);

    const newController = new JestTestController(setup.mockContext);

    expect(() => newController).not.toThrow();

    newController.dispose();
  });

  it('should handle empty request (run all tests)', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;

    const test1 = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockTestController.items.add(test1);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: undefined, exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [
            { assertionResults: [{ title: 'Test 1', status: 'passed' }] },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.started).toHaveBeenCalled();
  });
});
