import * as vscode from 'vscode';
import {
  setupTestController,
  createMockProcess,
  TestItem,
  CancellationToken,
  TestControllerSetup,
} from './testControllerSetup';
import * as testDetection from '../testDetection/testFileDetection';

jest.mock('child_process');

describe('JestTestController - Vitest support', () => {
  let setup: TestControllerSetup;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();
  });

  afterEach(() => {
    setup.controller?.dispose();
    jest.restoreAllMocks();
  });

  it('should detect and use vitest command for vitest projects', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    const test1 = new TestItem(
      'test1',
      'Vitest Test',
      vscode.Uri.file('/workspace/vitest-project/test.ts'),
    );
    test1.uri = vscode.Uri.file('/workspace/vitest-project/test.ts');
    mockTestController.items.add(test1);

    jest
      .spyOn(testDetection, 'getTestFrameworkForFile')
      .mockReturnValue('vitest');

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [test1], exclude: [] } as any;
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
          numPassedTests: 1,
          numFailedTests: 0,
          testResults: [
            {
              assertionResults: [
                {
                  title: 'Vitest Test',
                  status: 'passed',
                  ancestorTitles: [],
                },
              ],
            },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(spawn).toHaveBeenCalled();
    const spawnCall = spawn.mock.calls[spawn.mock.calls.length - 1];
    expect(
      spawnCall[1].some(
        (arg: string) => arg.includes('run') || arg.includes('reporter'),
      ),
    ).toBe(true);
  });

  it('should parse Vitest JSON output correctly', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    const test1 = new TestItem(
      'test1',
      'should pass',
      vscode.Uri.file('/workspace/test.ts'),
    );
    const test2 = new TestItem(
      'test2',
      'should fail',
      vscode.Uri.file('/workspace/test.ts'),
    );
    test1.uri = vscode.Uri.file('/workspace/test.ts');
    test2.uri = vscode.Uri.file('/workspace/test.ts');
    mockTestController.items.add(test1);
    mockTestController.items.add(test2);

    jest
      .spyOn(testDetection, 'getTestFrameworkForFile')
      .mockReturnValue('vitest');

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [test1, test2], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    const vitestOutput = JSON.stringify({
      numFailedTestSuites: 0,
      numFailedTests: 1,
      numPassedTestSuites: 1,
      numPassedTests: 1,
      numTotalTestSuites: 1,
      numTotalTests: 2,
      success: false,
      testResults: [
        {
          name: '/workspace/test.ts',
          status: 'failed',
          assertionResults: [
            {
              title: 'should pass',
              status: 'passed',
              ancestorTitles: [],
              fullName: 'should pass',
            },
            {
              title: 'should fail',
              status: 'failed',
              ancestorTitles: [],
              fullName: 'should fail',
              failureMessages: ['Expected true but got false'],
            },
          ],
        },
      ],
    });

    setTimeout(() => {
      mockProcess.stdout.emit('data', vitestOutput);
      mockProcess.emit('close', 1);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.passed).toHaveBeenCalled();
    expect(mockRun.failed).toHaveBeenCalled();
  });

  it('should handle Vitest coverage option', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    const test1 = new TestItem(
      'test1',
      'Test',
      vscode.Uri.file('/workspace/test.ts'),
    );
    test1.uri = vscode.Uri.file('/workspace/test.ts');
    mockTestController.items.add(test1);

    jest
      .spyOn(testDetection, 'getTestFrameworkForFile')
      .mockReturnValue('vitest');

    const coverageProfile = (mockTestController.createRunProfile as jest.Mock)
      .mock.calls[2][2];
    const mockRequest = { include: [test1], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = coverageProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        JSON.stringify({
          success: true,
          testResults: [
            { assertionResults: [{ title: 'Test', status: 'passed' }] },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(spawn).toHaveBeenCalled();
    const spawnCall = spawn.mock.calls[spawn.mock.calls.length - 1];
    expect(spawnCall[1].some((arg: string) => arg.includes('coverage'))).toBe(
      true,
    );
  });

  it('should fallback to text parsing when JSON parsing fails for Vitest', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    const test1 = new TestItem(
      'test1',
      'should pass',
      vscode.Uri.file('/workspace/test.ts'),
    );
    test1.uri = vscode.Uri.file('/workspace/test.ts');
    mockTestController.items.add(test1);

    jest
      .spyOn(testDetection, 'getTestFrameworkForFile')
      .mockReturnValue('vitest');

    const runProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[0][2];
    const mockRequest = { include: [test1], exclude: [] } as any;
    const mockToken = new CancellationToken();

    const { spawn } = require('child_process');
    const mockProcess = createMockProcess();
    spawn.mockReturnValue(mockProcess);

    const runPromise = runProfile(mockRequest, mockToken);

    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        `
 ✓ should pass (5ms)

 Test Files  1 passed (1)
      Tests  1 passed (1)
        `,
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    const mockRun = mockTestController.createTestRun();
    expect(mockRun.passed).toHaveBeenCalled();
  });

  it('should include Vitest config path when running multiple files', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

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
    test1.uri = vscode.Uri.file('/workspace/test1.ts');
    test2.uri = vscode.Uri.file('/workspace/test2.ts');
    mockTestController.items.add(test1);
    mockTestController.items.add(test2);

    jest
      .spyOn(testDetection, 'getTestFrameworkForFile')
      .mockReturnValue('vitest');
    const mockConfig = setup.controller['jestConfig'] as any;
    jest
      .spyOn(mockConfig, 'getVitestConfigPath')
      .mockReturnValue('/workspace/vitest.config.ts');

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
            {
              assertionResults: [
                { title: 'Test 1', status: 'passed', ancestorTitles: [] },
              ],
            },
            {
              assertionResults: [
                { title: 'Test 2', status: 'passed', ancestorTitles: [] },
              ],
            },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(spawn).toHaveBeenCalled();
    const spawnCall = spawn.mock.calls[spawn.mock.calls.length - 1];
    const args = spawnCall[1];
    expect(args).toContain('--config');
    expect(args).toContain('/workspace/vitest.config.ts');
  });

  it('should include Jest config path when running multiple files', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

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
    test1.uri = vscode.Uri.file('/workspace/test1.ts');
    test2.uri = vscode.Uri.file('/workspace/test2.ts');
    mockTestController.items.add(test1);
    mockTestController.items.add(test2);

    jest
      .spyOn(testDetection, 'getTestFrameworkForFile')
      .mockReturnValue('jest');
    const mockConfig = setup.controller['jestConfig'] as any;
    jest
      .spyOn(mockConfig, 'getJestConfigPath')
      .mockReturnValue('/workspace/jest.config.js');

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
            {
              assertionResults: [
                { title: 'Test 1', status: 'passed', ancestorTitles: [] },
              ],
            },
            {
              assertionResults: [
                { title: 'Test 2', status: 'passed', ancestorTitles: [] },
              ],
            },
          ],
        }),
      );
      mockProcess.emit('close', 0);
    }, 10);

    await runPromise;

    expect(spawn).toHaveBeenCalled();
    const spawnCall = spawn.mock.calls[spawn.mock.calls.length - 1];
    const args = spawnCall[1];
    expect(args).toContain('-c');
    expect(args).toContain('/workspace/jest.config.js');
  });
});
