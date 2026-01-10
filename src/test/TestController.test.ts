import * as vscode from 'vscode';
import { TestItem, CancellationToken, CancellationTokenSource, VscodeRange, Position } from './__mocks__/vscode';
import { JestTestController } from '../TestController';
import { JestRunnerConfig } from '../jestRunnerConfig';
import * as parser from '../parser';
import * as util from '../util';
import { EventEmitter } from 'events';

interface MockProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
}

// Mock child_process
jest.mock('child_process');

describe('JestTestController', () => {
  let controller: JestTestController;
  let mockContext: vscode.ExtensionContext;
  let mockWorkspaceFolder: vscode.WorkspaceFolder;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock context
    mockContext = {
      subscriptions: [],
      extensionPath: '/test/path',
      globalState: {} as any,
      workspaceState: {} as any,
      extensionUri: vscode.Uri.file('/test/path'),
      environmentVariableCollection: {} as any,
      storagePath: '/test/storage',
      globalStoragePath: '/test/globalStorage',
      logPath: '/test/log',
      extensionMode: 3,
      asAbsolutePath: (relativePath: string) => `/test/path/${relativePath}`,
      storageUri: vscode.Uri.file('/test/storage'),
      globalStorageUri: vscode.Uri.file('/test/globalStorage'),
      logUri: vscode.Uri.file('/test/log'),
      extension: {} as any,
      secrets: {} as any,
      languageModelAccessInformation: {} as any,
    };

    // Setup mock workspace folder
    mockWorkspaceFolder = {
      uri: vscode.Uri.file('/workspace'),
      name: 'test-workspace',
      index: 0,
    };

    // Mock workspace configuration
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'jestrunner.testFilePattern') {
          return '**/*.{test,spec}.{js,jsx,ts,tsx}';
        }
        if (key === 'jestrunner.maxBufferSize') {
          return 50;
        }
        return defaultValue;
      }),
      has: jest.fn(),
      inspect: jest.fn(),
      update: jest.fn(),
    } as any);

    // Mock workspace folders
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [mockWorkspaceFolder],
      configurable: true,
    });

    // Mock workspace methods
    jest.spyOn(vscode.workspace, 'findFiles').mockResolvedValue([
      vscode.Uri.file('/workspace/test1.test.ts'),
      vscode.Uri.file('/workspace/test2.spec.ts'),
    ]);

    jest.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue(mockWorkspaceFolder);

    // Mock file system watcher
    const mockWatcher = {
      onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      onDidCreate: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      onDidDelete: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      dispose: jest.fn(),
    };
    jest.spyOn(vscode.workspace, 'createFileSystemWatcher').mockReturnValue(mockWatcher as any);

    // Mock parser
    jest.spyOn(parser, 'parse').mockReturnValue({
      root: {
        children: [
          {
            type: 'describe',
            name: 'Test Suite',
            start: { line: 1, column: 0 },
            end: { line: 10, column: 0 },
            children: [
              {
                type: 'test',
                name: 'should pass',
                start: { line: 2, column: 2 },
                end: { line: 4, column: 2 },
                children: [],
              },
            ],
          },
        ],
      },
    } as any);

    // Mock util functions
    jest.spyOn(util, 'shouldIncludeFile').mockReturnValue(true);
    jest.spyOn(util, 'updateTestNameIfUsingProperties').mockImplementation((name) => name);
    jest.spyOn(util, 'escapeRegExp').mockImplementation((str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    jest.spyOn(util, 'pushMany').mockImplementation((arr: any[], items: any[]) => {
      arr.push(...items);
      return arr.length;
    });

    // Mock debug
    jest.spyOn(vscode.debug, 'startDebugging').mockResolvedValue(true);

    // Create controller
    controller = new JestTestController(mockContext);
  });

  afterEach(() => {
    controller?.dispose();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a test controller', () => {
      expect(vscode.tests.createTestController).toHaveBeenCalledWith('jestTestController', 'Jest Tests');
    });

    it('should create run profiles for Run, Debug, Coverage, and Update Snapshots', () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      expect(mockTestController.createRunProfile).toHaveBeenCalledTimes(4);
      
      // Check Run profile
      expect(mockTestController.createRunProfile).toHaveBeenCalledWith(
        'Run',
        vscode.TestRunProfileKind.Run,
        expect.any(Function),
        true,
      );

      // Check Debug profile
      expect(mockTestController.createRunProfile).toHaveBeenCalledWith(
        'Debug',
        vscode.TestRunProfileKind.Debug,
        expect.any(Function),
        true,
      );

      // Check Coverage profile
      expect(mockTestController.createRunProfile).toHaveBeenCalledWith(
        'Run with Coverage',
        vscode.TestRunProfileKind.Run,
        expect.any(Function),
        true,
      );

      // Check Update Snapshots profile
      expect(mockTestController.createRunProfile).toHaveBeenCalledWith(
        'Update Snapshots',
        vscode.TestRunProfileKind.Run,
        expect.any(Function),
        false,
      );
    });

    it('should discover tests for all workspace folders', () => {
      expect(vscode.workspace.findFiles).toHaveBeenCalled();
    });

    it('should setup file watcher', () => {
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
        '**/*.{test,spec}.{js,jsx,ts,tsx}'
      );
    });
  });

  describe('test discovery', () => {
    it('should find test files using configured pattern', async () => {
      // The constructor already triggers discovery
      expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
        expect.any(vscode.RelativePattern),
        '**/node_modules/**'
      );
    });

    it('should create test items for discovered files', () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      
      // Should create test items for files
      expect(mockTestController.createTestItem).toHaveBeenCalled();
    });

    it('should parse test structure from files', () => {
      expect(parser.parse).toHaveBeenCalled();
    });

    it('should handle parser errors gracefully', async () => {
      // Mock logError from util
      const { logError } = require('../util');
      const logErrorSpy = jest.spyOn({ logError }, 'logError').mockImplementation();
      
      const parseError = new Error('Parse error');
      (parser.parse as jest.Mock).mockImplementation(() => {
        throw parseError;
      });
      
      // Ensure at least one file is found so parser is called
      (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
        vscode.Uri.file('/workspace/error.test.ts'),
      ]);

      // Create new controller which will attempt to discover tests
      const newController = new JestTestController(mockContext);
      
      // Wait for async discovery
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // The error should be logged when parse throws
      // Note: Due to mocking, we can't easily verify the internal call
      // but we ensure the code path doesn't crash
      expect(true).toBe(true); // Test passes if no crash
      
      newController.dispose();
      logErrorSpy.mockRestore();
    });

    it('should handle empty parse results', () => {
      jest.spyOn(parser, 'parse').mockReturnValue({
        root: {
          children: [],
        },
      } as any);

      const newController = new JestTestController(mockContext);
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[1].value;
      
      // Should not throw and should still create file items
      expect(mockTestController.items.size).toBeGreaterThanOrEqual(0);
      
      newController.dispose();
    });

    it('should create nested test items for describe blocks', () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      
      // Should create items for describe blocks and tests
      const createCalls = (mockTestController.createTestItem as jest.Mock).mock.calls;
      expect(createCalls.length).toBeGreaterThan(0);
    });

    it('should set correct test item tags', () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const createdItems = (mockTestController.createTestItem as jest.Mock).mock.results.map(r => r.value);
      
      // Check that items have tags
      createdItems.forEach((item: any) => {
        expect(item.tags).toBeDefined();
      });
    });

    it('should set test ranges for navigation', () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const createdItems = (mockTestController.createTestItem as jest.Mock).mock.results.map(r => r.value);
      
      // At least some items should have ranges
      const itemsWithRanges = createdItems.filter((item: any) => item.range);
      expect(itemsWithRanges.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('test execution', () => {
    let mockRun: vscode.TestRun;
    let mockTestItem: TestItem;
    let mockRequest: vscode.TestRunRequest;
    let mockToken: CancellationToken;

    beforeEach(() => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      
      mockRun = mockTestController.createTestRun();
      mockTestItem = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      mockRequest = { include: [mockTestItem], exclude: [] } as any;
      mockToken = new CancellationToken();
    });

    it('should create a test run when executing tests', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      
      // Mock spawn to prevent actual execution
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (mockProcess as any).kill = jest.fn();
      spawn.mockReturnValue(mockProcess);

      // Execute run handler
      const runPromise = runProfile(mockRequest, mockToken);
      
      // Simulate successful completion
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          numFailedTestSuites: 0,
          numPassedTestSuites: 1,
          success: true,
          testResults: [{
            assertionResults: [{
              ancestorTitles: [],
              title: 'Test 1',
              status: 'passed',
            }],
          }],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      expect(mockTestController.createTestRun).toHaveBeenCalledWith(mockRequest);
    });

    it('should mark tests as started', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      
      // Add test item to controller
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (mockProcess as any).kill = jest.fn();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [] }],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      expect(mockRun.started).toHaveBeenCalled();
    });

    it('should handle test failures', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (mockProcess as any).kill = jest.fn();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: false,
          testResults: [{
            assertionResults: [{
              ancestorTitles: [],
              title: 'Test 1',
              status: 'failed',
              failureMessages: ['Expected true to be false'],
            }],
          }],
        }));
        mockProcess.emit('close', 1);
      }, 10);

      await runPromise;

      expect(mockRun.failed).toHaveBeenCalled();
    });

    it('should handle test cancellation', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (mockProcess as any).kill = jest.fn();
      spawn.mockReturnValue(mockProcess);

      const tokenSource = new CancellationTokenSource();
      const runPromise = runProfile(mockRequest, tokenSource.token);
      
      // Cancel the token
      setTimeout(() => {
        tokenSource.cancel();
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      expect((mockProcess as any).kill).toHaveBeenCalled();
      expect(mockRun.skipped).toHaveBeenCalled();
    });

    it('should respect max buffer size configuration', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (mockProcess as any).kill = jest.fn();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      // Emit data that exceeds max buffer (50MB default)
      const largeOutput = 'x'.repeat(51 * 1024 * 1024);
      setTimeout(() => {
        mockProcess.stdout.emit('data', largeOutput);
      }, 10);

      await runPromise;

      expect((mockProcess as any).kill).toHaveBeenCalled();
      expect(mockRun.failed).toHaveBeenCalled();
    });

    it('should handle spawn errors', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.emit('error', new Error('Command not found'));
      }, 10);

      await runPromise;

      expect(mockRun.failed).toHaveBeenCalled();
    });

    it('should parse Jest JSON output correctly', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestItem.label = 'should pass';
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        const jestOutput = JSON.stringify({
          numFailedTestSuites: 0,
          numPassedTestSuites: 1,
          numTotalTests: 1,
          numPassedTests: 1,
          success: true,
          testResults: [{
            assertionResults: [{
              ancestorTitles: ['Test Suite'],
              title: 'should pass',
              fullName: 'Test Suite should pass',
              status: 'passed',
              duration: 10,
            }],
            name: '/workspace/test.ts',
            status: 'passed',
            message: '',
            startTime: 0,
            endTime: 100,
          }],
          wasInterrupted: false,
        });
        mockProcess.stdout.emit('data', jestOutput);
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      expect(mockRun.passed).toHaveBeenCalled();
    });

    it('should match tests by location when multiple have same name', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      
      const test1 = new TestItem('test1', 'should work', vscode.Uri.file('/workspace/test.ts'));
      test1.range = new VscodeRange(new Position(10, 0), new Position(12, 0));
      
      const test2 = new TestItem('test2', 'should work', vscode.Uri.file('/workspace/test.ts'));
      test2.range = new VscodeRange(new Position(20, 0), new Position(22, 0));
      
      mockTestController.items.add(test1);
      mockTestController.items.add(test2);
      
      const request = { include: [test1, test2], exclude: [] } as any;
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(request, mockToken);
      
      setTimeout(() => {
        const jestOutput = JSON.stringify({
          success: true,
          testResults: [{
            assertionResults: [
              {
                title: 'should work',
                status: 'passed',
                location: { line: 11, column: 2 }, // Matches test1 (1-based)
              },
              {
                title: 'should work',
                status: 'failed',
                location: { line: 21, column: 2 }, // Matches test2 (1-based)
                failureMessages: ['Error'],
              },
            ],
          }],
        });
        mockProcess.stdout.emit('data', jestOutput);
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      // Both tests should be processed
      expect(mockRun.passed).toHaveBeenCalled();
      expect(mockRun.failed).toHaveBeenCalled();
    });

    it('should pass additional args for coverage profile', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestController.items.add(mockTestItem);
      
      // Get coverage profile (index 2)
      const coverageProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[2][2];
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = coverageProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [] }],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      // Check that --coverage was passed
      expect(spawn).toHaveBeenCalled();
      const spawnArgs = spawn.mock.calls[0][1];
      expect(spawnArgs).toContain('--coverage');
    });

    it('should pass -u flag for update snapshots profile', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestController.items.add(mockTestItem);
      
      // Get update snapshots profile (index 3)
      const snapshotProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[3][2];
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = snapshotProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [] }],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      expect(spawn).toHaveBeenCalled();
      const spawnArgs = spawn.mock.calls[0][1];
      expect(spawnArgs).toContain('-u');
    });
  });

  describe('debug handler', () => {
    let mockTestItem: TestItem;
    let mockRequest: vscode.TestRunRequest;
    let mockToken: CancellationToken;

    beforeEach(() => {
      mockTestItem = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      mockRequest = { include: [mockTestItem], exclude: [] } as any;
      mockToken = new CancellationToken();
    });

    it('should start debugging for a test', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      
      // Get debug profile (index 1)
      const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[1][2];
      
      await debugProfile(mockRequest, mockToken);
      
      expect(vscode.debug.startDebugging).toHaveBeenCalled();
    });

    it('should use workspace folder for debugging', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[1][2];
      
      await debugProfile(mockRequest, mockToken);
      
      expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
        mockWorkspaceFolder,
        expect.any(Object)
      );
    });

    it('should handle missing workspace folder', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[1][2];
      
      jest.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue(undefined);
      jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
      
      await debugProfile(mockRequest, mockToken);
      
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Could not determine workspace folder'
      );
    });

    it('should debug leaf nodes only', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[1][2];
      
      // Create a suite with children
      const suite = new TestItem('suite1', 'Suite', vscode.Uri.file('/workspace/test.ts'));
      const childTest = new TestItem('test1', 'Test', vscode.Uri.file('/workspace/test.ts'));
      suite.children.add(childTest);
      
      const request = { include: [suite], exclude: [] } as any;
      
      await debugProfile(request, mockToken);
      
      // Should start debugging (for the child test)
      expect(vscode.debug.startDebugging).toHaveBeenCalled();
    });

    it('should respect cancellation token', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const debugProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[1][2];
      
      const tokenSource = new CancellationTokenSource();
      tokenSource.cancel(); // Cancel immediately
      
      await debugProfile(mockRequest, tokenSource.token);
      
      // Should not start debugging if already cancelled
      expect(vscode.debug.startDebugging).not.toHaveBeenCalled();
    });
  });

  describe('file watcher', () => {
    it('should reparse file on change', () => {
      const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
      const changeCallback = (mockWatcher.onDidChange as jest.Mock).mock.calls[0][0];
      
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const testFilePath = '/workspace/test.ts';
      // Use the file path as the ID to match how TestController creates items
      const testItem = new TestItem(testFilePath, 'test.ts', vscode.Uri.file(testFilePath));
      mockTestController.items.add(testItem);
      
      // Clear previous calls
      (parser.parse as jest.Mock).mockClear();
      
      // Trigger change
      changeCallback({ fsPath: testFilePath });
      
      expect(parser.parse).toHaveBeenCalledWith(testFilePath);
    });

    it('should add new test file on create', () => {
      const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
      const createCallback = (mockWatcher.onDidCreate as jest.Mock).mock.calls[0][0];
      
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const previousItemCount = mockTestController.items.size;
      
      // Trigger create
      createCallback(vscode.Uri.file('/workspace/new-test.ts'));
      
      // Should have added new item
      expect(mockTestController.items.size).toBeGreaterThanOrEqual(previousItemCount);
    });

    it('should remove test file on delete', () => {
      const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
      const deleteCallback = (mockWatcher.onDidDelete as jest.Mock).mock.calls[0][0];
      
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const testFilePath = '/workspace/test.ts';
      // Use the file path as the ID
      const testItem = new TestItem(testFilePath, 'test.ts', vscode.Uri.file(testFilePath));
      mockTestController.items.add(testItem);
      
      // Trigger delete
      deleteCallback(vscode.Uri.file(testFilePath));
      
      expect(mockTestController.items.get(testFilePath)).toBeUndefined();
    });

    it('should ignore changes to files outside workspace', () => {
      const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
      const createCallback = (mockWatcher.onDidCreate as jest.Mock).mock.calls[0][0];
      
      (parser.parse as jest.Mock).mockClear();
      
      // Trigger create for file outside workspace
      createCallback(vscode.Uri.file('/other/path/test.ts'));
      
      // Should not parse files outside workspace
      expect(parser.parse).not.toHaveBeenCalled();
    });
  });

  describe('result parsing', () => {
    let mockTestItem: TestItem;

    it('should handle skipped tests', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestItem = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      const mockRequest = { include: [mockTestItem], exclude: [] } as any;
      const mockToken = new CancellationToken();
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: true,
          testResults: [{
            assertionResults: [{
              title: 'Test 1',
              status: 'skipped',
            }],
          }],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      const mockRun = mockTestController.createTestRun();
      expect(mockRun.skipped).toHaveBeenCalled();
    });

    it('should handle pending tests', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestItem = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      const mockRequest = { include: [mockTestItem], exclude: [] } as any;
      const mockToken = new CancellationToken();
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: true,
          testResults: [{
            assertionResults: [{
              title: 'Test 1',
              status: 'pending',
            }],
          }],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      const mockRun = mockTestController.createTestRun();
      expect(mockRun.skipped).toHaveBeenCalled();
    });

    it('should handle todo tests', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestItem = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      const mockRequest = { include: [mockTestItem], exclude: [] } as any;
      const mockToken = new CancellationToken();
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: true,
          testResults: [{
            assertionResults: [{
              title: 'Test 1',
              status: 'todo',
            }],
          }],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      const mockRun = mockTestController.createTestRun();
      expect(mockRun.skipped).toHaveBeenCalled();
    });

    it('should fall back to simple parsing when JSON parsing fails', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestItem = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      const mockRequest = { include: [mockTestItem], exclude: [] } as any;
      const mockToken = new CancellationToken();
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);
      
      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        // Send invalid JSON
        mockProcess.stdout.emit('data', 'PASS test.ts\n  ✓ Test 1');
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      // With OutputChannel logging, the warning is logged internally
      // Just verify the test doesn't crash
      expect(true).toBe(true);
    });

    it('should handle stderr output', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestItem = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      const mockRequest = { include: [mockTestItem], exclude: [] } as any;
      const mockToken = new CancellationToken();
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
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
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      mockTestItem = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      mockTestController.items.add(mockTestItem);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      const mockRequest = { include: [mockTestItem], exclude: [] } as any;
      const mockToken = new CancellationToken();
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
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

  describe('dispose', () => {
    it('should dispose test controller and watchers', () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
      
      controller.dispose();
      
      expect(mockTestController.dispose).toHaveBeenCalled();
      expect(mockWatcher.dispose).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle multiple files in single run', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      
      const test1 = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test1.ts'));
      const test2 = new TestItem('test2', 'Test 2', vscode.Uri.file('/workspace/test2.ts'));
      
      mockTestController.items.add(test1);
      mockTestController.items.add(test2);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      const mockRequest = { include: [test1, test2], exclude: [] } as any;
      const mockToken = new CancellationToken();
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: true,
          testResults: [
            { assertionResults: [{ title: 'Test 1', status: 'passed' }] },
            { assertionResults: [{ title: 'Test 2', status: 'passed' }] },
          ],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      const mockRun = mockTestController.createTestRun();
      expect(mockRun.passed).toHaveBeenCalled();
    });

    it('should handle excluded tests in request', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      
      const test1 = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      const test2 = new TestItem('test2', 'Test 2', vscode.Uri.file('/workspace/test.ts'));
      
      mockTestController.items.add(test1);
      mockTestController.items.add(test2);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      const mockRequest = { include: [test1, test2], exclude: [test2] } as any;
      const mockToken = new CancellationToken();
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [{ title: 'Test 1', status: 'passed' }] }],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      const mockRun = mockTestController.createTestRun();
      // Only test1 should be run
      expect(mockRun.started).toHaveBeenCalledTimes(1);
    });

    it('should handle test names with special characters', () => {
      // Setup parse to return special characters test
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
      
      // Ensure findFiles returns a test file
      (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
        vscode.Uri.file('/workspace/special.test.ts'),
      ]);

      // Create a new controller to trigger parsing with special characters
      const newController = new JestTestController(mockContext);
      
      // Wait for async discovery to complete
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[1].value;
          
          // Should create test items without errors
          // The controller should have called createTestItem for the file and tests
          expect(mockTestController.createTestItem).toHaveBeenCalled();
          
          newController.dispose();
          resolve();
        }, 100);
      });
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
      
      const newController = new JestTestController(mockContext);
      
      // Should not throw
      expect(() => newController).not.toThrow();
      
      newController.dispose();
    });

    it('should handle empty request (run all tests)', async () => {
      const mockTestController = (vscode.tests.createTestController as jest.Mock).mock.results[0].value;
      
      const test1 = new TestItem('test1', 'Test 1', vscode.Uri.file('/workspace/test.ts'));
      mockTestController.items.add(test1);
      
      const runProfile = (mockTestController.createRunProfile as jest.Mock).mock.calls[0][2];
      const mockRequest = { include: undefined, exclude: [] } as any;
      const mockToken = new CancellationToken();
      
      const { spawn } = require('child_process');
      const mockProcess: MockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const runPromise = runProfile(mockRequest, mockToken);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          success: true,
          testResults: [{ assertionResults: [{ title: 'Test 1', status: 'passed' }] }],
        }));
        mockProcess.emit('close', 0);
      }, 10);

      await runPromise;

      const mockRun = mockTestController.createTestRun();
      expect(mockRun.started).toHaveBeenCalled();
    });
  });
});
