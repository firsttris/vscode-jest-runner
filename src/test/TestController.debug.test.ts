import * as vscode from 'vscode';
import {
  setupTestController,
  TestItem,
  CancellationToken,
  CancellationTokenSource,
  TestControllerSetup,
} from './testControllerSetup';
import { WorkspaceConfiguration } from './__mocks__/vscode';
import * as testDetection from '../testDetection/testFileDetection';

jest.mock('child_process');

describe('JestTestController - debug handler', () => {
  let setup: TestControllerSetup;
  let mockTestItem: TestItem;
  let mockRequest: vscode.TestRunRequest;
  let mockToken: CancellationToken;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();

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

  it('should start debugging for a test', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;

    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    await debugProfile(mockRequest, mockToken);

    expect(vscode.debug.startDebugging).toHaveBeenCalled();
  });

  it('should use workspace folder for debugging', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    await debugProfile(mockRequest, mockToken);

    expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
      setup.mockWorkspaceFolder,
      expect.any(Object),
    );
  });

  it('should handle missing workspace folder', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    jest
      .spyOn(vscode.workspace, 'getWorkspaceFolder')
      .mockReturnValue(undefined);
    jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);

    await debugProfile(mockRequest, mockToken);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Could not determine workspace folder',
    );
  });

  it('should debug leaf nodes only', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    const suite = new TestItem(
      'suite1',
      'Suite',
      vscode.Uri.file('/workspace/test.ts'),
    );
    const childTest = new TestItem(
      'test1',
      'Test',
      vscode.Uri.file('/workspace/test.ts'),
    );
    suite.children.add(childTest);

    const request = { include: [suite], exclude: [] } as any;

    await debugProfile(request, mockToken);

    expect(vscode.debug.startDebugging).toHaveBeenCalled();
  });

  it('should respect cancellation token', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    const tokenSource = new CancellationTokenSource();
    tokenSource.cancel();

    await debugProfile(mockRequest, tokenSource.token);

    expect(vscode.debug.startDebugging).not.toHaveBeenCalled();
  });

  it('should use buildTestArgs for Vitest files', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    const vitestTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.spec.ts'),
    );
    const vitestRequest = { include: [vitestTestItem], exclude: [] } as any;

    const mockConfig = (setup.controller as any).jestConfig;
    jest.spyOn(mockConfig, 'getTestFramework').mockReturnValue('vitest');
    jest
      .spyOn(mockConfig, 'buildTestArgs')
      .mockReturnValue([
        'run',
        '/workspace/test.spec.ts',
        '-c',
        '/workspace/vitest.config.ts',
      ]);

    await debugProfile(vitestRequest, mockToken);

    expect(mockConfig.buildTestArgs).toHaveBeenCalledWith(
      '/workspace/test.spec.ts',
      'Test 1',
      false,
    );
    expect(vscode.debug.startDebugging).toHaveBeenCalled();
  });

  it('should pass filePath to getDebugConfiguration for framework detection', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    const vitestTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.spec.ts'),
    );
    const vitestRequest = { include: [vitestTestItem], exclude: [] } as any;

    const mockConfig = (setup.controller as any).jestConfig;
    jest.spyOn(mockConfig, 'getDebugConfiguration').mockReturnValue({
      type: 'node',
      request: 'launch',
      name: 'Debug Vitest Tests',
      args: ['--no-install', 'vitest', 'run'],
    });

    await debugProfile(vitestRequest, mockToken);

    expect(mockConfig.getDebugConfiguration).toHaveBeenCalledWith(
      '/workspace/test.spec.ts',
    );
  });

  it('should include Vitest config in debug args', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    const vitestTestItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.spec.ts'),
    );
    const vitestRequest = { include: [vitestTestItem], exclude: [] } as any;

    const mockConfig = (setup.controller as any).jestConfig;
    jest.spyOn(mockConfig, 'getTestFramework').mockReturnValue('vitest');
    jest
      .spyOn(mockConfig, 'buildTestArgs')
      .mockReturnValue([
        'run',
        '/workspace/test.spec.ts',
        '-c',
        '/workspace/vitest.config.ts',
        '-t',
        'Test 1',
      ]);
    jest.spyOn(mockConfig, 'getDebugConfiguration').mockReturnValue({
      type: 'node',
      request: 'launch',
      name: 'Debug Vitest Tests',
      args: ['--no-install', 'vitest'],
    });

    await debugProfile(vitestRequest, mockToken);

    const debugCall = (vscode.debug.startDebugging as jest.Mock).mock.calls[
      (vscode.debug.startDebugging as jest.Mock).mock.calls.length - 1
    ];
    const config = debugCall[1];

    expect(config.args).toContain('-c');
    expect(config.args).toContain('/workspace/vitest.config.ts');
  });

  it('should debug all tests when request.include is undefined', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    const testItem = new TestItem(
      'test1',
      'Test 1',
      vscode.Uri.file('/workspace/test.ts'),
    );
    mockTestController.items.add(testItem);

    const requestWithoutInclude = { include: undefined, exclude: [] } as any;

    await debugProfile(requestWithoutInclude, mockToken);

    expect(vscode.debug.startDebugging).toHaveBeenCalled();
  });

  it('should skip excluded tests in debug handler', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

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

    const requestWithExclude = {
      include: [test1, test2],
      exclude: [test1],
    } as any;

    await debugProfile(requestWithExclude, mockToken);

    expect(vscode.debug.startDebugging).toHaveBeenCalledTimes(1);
  });

  it('should escape special regex characters in test names', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    const testWithSpecialChars = new TestItem(
      'testSpecial',
      'Test with + and * chars',
      vscode.Uri.file('/workspace/test.ts'),
    );
    const requestWithSpecialChars = {
      include: [testWithSpecialChars],
      exclude: [],
    } as any;

    await debugProfile(requestWithSpecialChars, mockToken);

    const debugCall = (vscode.debug.startDebugging as jest.Mock).mock
      .calls[0][1];
    expect(debugCall.args).toContain('-t');
    expect(debugCall.args).toContain('Test with \\+ and \\* chars');
  });

  it('should resolve string interpolation placeholders in debug test names', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    const testWithInterpolation = new TestItem(
      'testInterpolation',
      'xyz by $title',
      vscode.Uri.file('/workspace/test.ts'),
    );
    const request = {
      include: [testWithInterpolation],
      exclude: [],
    } as any;

    await debugProfile(request, mockToken);

    const debugCall = (vscode.debug.startDebugging as jest.Mock).mock
      .calls[0][1];
    expect(debugCall.args).toContain('-t');
    expect(debugCall.args).toContain('xyz by (.*?)');
    expect(debugCall.args).not.toContain('xyz by \\$title');
  });

  it('should debug Deno tests correctly', async () => {
    const mockTestController = (vscode.tests.createTestController as jest.Mock)
      .mock.results[0].value;
    const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock
      .calls[1][2];

    const denoTestItem = new TestItem(
      'denoTest',
      'add test',
      vscode.Uri.file('/workspace/main.test.ts'),
    );
    const request = { include: [denoTestItem], exclude: [] } as any;

    jest
      .spyOn(vscode.workspace, 'getConfiguration')
      .mockReturnValue(new WorkspaceConfiguration({}) as any);
    jest
      .spyOn(testDetection, 'getTestFrameworkForFile')
      .mockReturnValue('deno');

    await debugProfile(request, mockToken);

    const debugCall = (
      vscode.debug.startDebugging as jest.Mock
    ).mock.calls.pop();
    const config = debugCall?.[1] as any;

    expect(config.type).toBe('node');
    expect(config.port).toBe(9229);
    expect(config.attachSimplePort).toBe(9229);
    expect(config.runtimeExecutable).toBe('deno');
    expect(config.runtimeArgs).toEqual(
      expect.arrayContaining([
        'test',
        '--inspect-brk',
        '--allow-all',
        '/workspace/main.test.ts',
      ]),
    );
  });
});
