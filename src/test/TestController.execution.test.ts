import * as vscode from 'vscode';
import {
  setupTestController,
  createMockProcess,
  TestItem,
  CancellationToken,
  CancellationTokenSource,
  TestControllerSetup,
} from './testControllerSetup';

jest.mock('child_process');

describe('JestTestController - test execution', () => {
  let setup: TestControllerSetup;
  let mockRun: vscode.TestRun;
  let mockTestItem: TestItem;
  let mockRequest: vscode.TestRunRequest;
  let mockToken: CancellationToken;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();

    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    mockRun = mockTestController.createTestRun();
    mockTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockRequest = { include: [mockTestItem], exclude: [] } as any;
    mockToken = new CancellationToken();
  });

  afterEach(() => {
    setup.controller?.dispose();
    jest.restoreAllMocks();
  });

  it('should create a test run when executing tests', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          numFailedTestSuites: 0,
          numPassedTestSuites: 1,
          success: true,
          testResults: [
            {
              assertionResults: [
                {
                  ancestorTitles: [],
                  title: 'Test 1',
                  status: 'passed',
                },
              ],
            },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(mockTestController.createTestRun).toHaveBeenCalledWith(mockRequest);
  });

  it('should mark tests as started', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [] }],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(mockRun.started).toHaveBeenCalled();
  });

  it('should handle test failures', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: false,
          testResults: [
            {
              assertionResults: [
                {
                  ancestorTitles: [],
                  title: 'Test 1',
                  status: 'failed',
                  failureMessages: ['Expected true to be false'],
                },
              ],
            },
          ],
        }),
      );
      mockProcess.emit('close', 1);
    }, 10);

    await runPromise;

    expect(mockRun.failed).toHaveBeenCalled();
  });

  it('should handle test cancellation', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const tokenSource = new CancellationTokenSource();
    const runPromise = runProfile(mockRequest, tokenSource.token);

    setTimeout(() => {
      tokenSource.cancel();
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(mockProcess.kill).toHaveBeenCalled();
    expect(mockRun.skipped).toHaveBeenCalled();
  });

  it('should respect max buffer size configuration', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    // Need 2 tests to avoid fast mode (which doesn't have buffer limiting)
    const mockTestItem2 = new TestItem(
      'test2',
      'Test 2',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockTestController.items.add(mockTestItem);
    mockTestController.items.add(mockTestItem2);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const multiRequest = { include: [mockTestItem, mockTestItem2], exclude: [] } as any;
    const runPromise = runProfile(multiRequest, mockToken);

    const largeOutput = 'x'.repeat(51 * 1024 * 1024);
    setTimeout(() => {
      mockProcess.stdout.emit('data', largeOutput);
    }, 10);

    await runPromise;

    expect(mockProcess.kill).toHaveBeenCalled();
    expect(mockRun.failed).toHaveBeenCalled();
  });

  it('should handle spawn errors', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.emit('error', new Error('Command not found'));
    }, 10);

    await runPromise;

    expect(mockRun.failed).toHaveBeenCalled();
  });

  it('should parse Jest JSON output correctly', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestItem.label = 'should pass';
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      const jestOutput = JSON.stringify({
        numFailedTestSuites: 0,
        numPassedTestSuites: 1,
        numTotalTests: 1,
        numPassedTests: 1,
        success: true,
        testResults: [
          {
            assertionResults: [
              {
                ancestorTitles: ['Test Suite'],
                title: 'should pass',
                fullName: 'Test Suite should pass',
                status: 'passed',
                duration: 10,
              },
            ],
            name: '/workspace/test.ts',
            status: 'passed',
            message: '',
            startTime: 0,
            endTime: 100,
          },
        ],
        wasInterrupted: false,
      });
      mockProcess.stdout.emit('data', jestOutput);
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(mockRun.passed).toHaveBeenCalled();
  });

  it('should match tests by location when multiple have same name', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    const { VscodeRange, Position } = require('./__mocks__/vscode');

    const test1 = new TestItem(
      'test1',
      'should work',
      vscode.Uri.file('/workspace/test.ts'),
    );
    test1.range = new VscodeRange(new Position(10, 0), new Position(12, 0));

    const test2 = new TestItem(
      'test2',
      'should work',
      vscode.Uri.file('/workspace/test.ts'),
    );
    test2.range = new VscodeRange(new Position(20, 0), new Position(22, 0));

    mockTestController.items.add(test1);
    mockTestController.items.add(test2);

    const request = { include: [test1, test2], exclude: [] } as any;
    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(request, mockToken);

    setTimeout(() => {
      const jestOutput = JSON.stringify({
        success: true,
        testResults: [
          {
            assertionResults: [
              {
                title: 'should work',
                status: 'passed',
                location: { line: 11, column: 2 },
              },
              {
                title: 'should work',
                status: 'failed',
                location: { line: 21, column: 2 },
                failureMessages: ['Error'],
              },
            ],
          },
        ],
      });
      mockProcess.stdout.emit('data', jestOutput);
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(mockRun.passed).toHaveBeenCalled();
    expect(mockRun.failed).toHaveBeenCalled();
  });

  it('should pass additional args for coverage profile', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const coverageProfile = (mockTestController.createRunProfile as jest.Mock)
      .mock.calls[2][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = coverageProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [] }],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(spawn).toHaveBeenCalled();
    const spawnArgs = spawn.mock.calls[0][1];
    expect(spawnArgs).toContain('--coverage');
  });

  it('should handle coverage data processing errors gracefully', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const coverageProfile = (mockTestController.createRunProfile as jest.Mock)
      .mock.calls[2][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const CoverageProvider = require('../coverageProvider').CoverageProvider;
    jest
      .spyOn(CoverageProvider.prototype, 'readCoverageFromFile')
      .mockRejectedValue(new Error('Coverage read error'));

    const runPromise = coverageProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [] }],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(mockRun.end).toHaveBeenCalled();
  });

  it('should handle null coverage map gracefully', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const coverageProfile = (mockTestController.createRunProfile as jest.Mock)
      .mock.calls[2][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const CoverageProvider = require('../coverageProvider').CoverageProvider;
    jest
      .spyOn(CoverageProvider.prototype, 'readCoverageFromFile')
      .mockResolvedValue(null);

    const runPromise = coverageProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [] }],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(mockRun.addCoverage).not.toHaveBeenCalled();
    expect(mockRun.end).toHaveBeenCalled();
  });

  it('should add coverage data when coverage map is available', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const coverageProfile = (mockTestController.createRunProfile as jest.Mock)
      .mock.calls[2][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const mockCoverageMap = {
      '/workspace/test.ts': {
        path: '/workspace/test.ts',
        statementMap: { '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } } },
        fnMap: {},
        branchMap: {},
        s: { '0': 1 },
        f: {},
        b: {},
      },
    };

    const mockFileCoverage = { uri: vscode.Uri.file('/workspace/test.ts') };

    const CoverageProvider = require('../coverageProvider').CoverageProvider;
    jest
      .spyOn(CoverageProvider.prototype, 'readCoverageFromFile')
      .mockResolvedValue(mockCoverageMap);
    jest
      .spyOn(CoverageProvider.prototype, 'convertToVSCodeCoverage')
      .mockReturnValue([mockFileCoverage]);

    const runPromise = coverageProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [] }],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(mockRun.addCoverage).toHaveBeenCalledWith(mockFileCoverage);
    expect(mockRun.end).toHaveBeenCalled();
  });

  it('should pass -u flag for update snapshots profile', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const snapshotProfile = (mockTestController.createRunProfile as jest.Mock)
      .mock.calls[3][2];

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = snapshotProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [] }],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(spawn).toHaveBeenCalled();
    const spawnArgs = spawn.mock.calls[0][1];
    expect(spawnArgs).toContain('-u');
  });

  it('should end run early when cancellation is requested before test execution', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const preCancelledToken = {
      isCancellationRequested: true,
      onCancellationRequested: jest.fn(),
    };

    const { spawn } = require('child_process');

    await runProfile(mockRequest, preCancelledToken);

    expect(spawn).not.toHaveBeenCalled();
    expect(mockRun.end).toHaveBeenCalled();
  });

  it('should end run when no files to test', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    const emptyTestItem = new TestItem('empty', 'Empty', undefined as any);
    const emptyRequest = { include: [emptyTestItem], exclude: [] } as any;

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');

    await runProfile(emptyRequest, mockToken);

    expect(spawn).not.toHaveBeenCalled();
    expect(mockRun.end).toHaveBeenCalled();
  });

  it('should fail tests when workspace folder cannot be determined', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    jest
      .spyOn(vscode.workspace, 'getWorkspaceFolder')
      .mockReturnValue(undefined);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    await runProfile(mockRequest, mockToken);

    expect(mockRun.failed).toHaveBeenCalledWith(
      mockTestItem,
      expect.objectContaining({
        message: 'Could not determine workspace folder',
      }),
    );
    expect(mockRun.end).toHaveBeenCalled();
  });

  it('should handle exception during test execution', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    spawn.mockImplementation(() => {
      throw new Error('Spawn failed');
    });

    await runProfile(mockRequest, mockToken);

    expect(mockRun.failed).toHaveBeenCalledWith(
      mockTestItem,
      expect.objectContaining({
        message: 'Spawn failed',
      }),
    );
    expect(mockRun.end).toHaveBeenCalled();
  });

  it('should handle non-Error exception during test execution', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    spawn.mockImplementation(() => {
      throw 'String error';
    });

    await runProfile(mockRequest, mockToken);

    expect(mockRun.failed).toHaveBeenCalledWith(
      mockTestItem,
      expect.objectContaining({
        message: 'String error',
      }),
    );
    expect(mockRun.end).toHaveBeenCalled();
  });

  it('should handle undefined error during test execution', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    mockTestController.items.add(mockTestItem);

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];

    const { spawn } = require('child_process');
    spawn.mockImplementation(() => {
      throw undefined;
    });

    await runProfile(mockRequest, mockToken);

    expect(mockRun.failed).toHaveBeenCalledWith(
      mockTestItem,
      expect.objectContaining({
        message: 'Test execution failed',
      }),
    );
    expect(mockRun.end).toHaveBeenCalled();
  });
});
