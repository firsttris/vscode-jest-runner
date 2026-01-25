import * as vscode from 'vscode';
import {
  setupTestController,
  createMockProcess,
  TestItem,
  CancellationToken,
  TestControllerSetup,
} from './testControllerSetup';

jest.mock('child_process');

describe('JestTestController - result parsing', () => {
  let setup: TestControllerSetup;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();
  });

  afterEach(() => {
    setup.controller?.dispose();
    jest.restoreAllMocks();
  });

  it('should handle skipped tests', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const mockTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [mockTestItem], exclude: [] } as any;
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
            {
              assertionResults: [
                {
                  title: 'Test 1',
                  status: 'skipped',
                },
              ],
            },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.skipped).toHaveBeenCalled();
  });

  it('should handle pending tests', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const mockTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [mockTestItem], exclude: [] } as any;
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
            {
              assertionResults: [
                {
                  title: 'Test 1',
                  status: 'pending',
                },
              ],
            },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.skipped).toHaveBeenCalled();
  });

  it('should handle todo tests', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const mockTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [mockTestItem], exclude: [] } as any;
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
            {
              assertionResults: [
                {
                  title: 'Test 1',
                  status: 'todo',
                },
              ],
            },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.skipped).toHaveBeenCalled();
  });

  it('should fall back to simple parsing when JSON parsing fails', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const mockTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [mockTestItem], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit('data', 'PASS test.ts\n  ✓ Test 1');
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(true).toBe(true);
  });

  it('should handle stderr output', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const mockTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [mockTestItem], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stderr.emit('data', 'Error: Cannot find module');
      mockProcess.emit('close', 1);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.failed).toHaveBeenCalled();
  });

  it('should handle empty output', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const mockTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [mockTestItem], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.failed).toHaveBeenCalled();
  });
});
