import * as vscode from 'vscode';
import {
  TestItem,
  CancellationToken,
  CancellationTokenSource,
  VscodeRange,
  Position,
} from './__mocks__/vscode';
import { JestTestController } from '../TestController';
import * as parser from '../parser';
import * as util from '../util';
import * as TestNameUtils from '../utils/TestNameUtils';
import { EventEmitter } from 'events';
import { testFileCache } from '../testDetection/testFileCache';

export interface MockProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
}

export {
  TestItem,
  CancellationToken,
  CancellationTokenSource,
  VscodeRange,
  Position,
};

jest.mock('child_process');

export interface TestControllerSetup {
  controller: JestTestController;
  mockContext: vscode.ExtensionContext;
  mockWorkspaceFolder: vscode.WorkspaceFolder;
}

export function createMockContext(): vscode.ExtensionContext {
  return {
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
}

export function createMockWorkspaceFolder(): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file('/workspace'),
    name: 'test-workspace',
    index: 0,
  };
}

export function setupTestControllerMocks(
  mockWorkspaceFolder: vscode.WorkspaceFolder,
): void {
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

  Object.defineProperty(vscode.workspace, 'workspaceFolders', {
    value: [mockWorkspaceFolder],
    configurable: true,
  });

  jest
    .spyOn(vscode.workspace, 'findFiles')
    .mockResolvedValue([
      vscode.Uri.file('/workspace/test1.test.ts'),
      vscode.Uri.file('/workspace/test2.spec.ts'),
    ]);

  jest
    .spyOn(vscode.workspace, 'getWorkspaceFolder')
    .mockReturnValue(mockWorkspaceFolder);

  const mockWatcher = {
    onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    onDidCreate: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    onDidDelete: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    dispose: jest.fn(),
  };
  jest
    .spyOn(vscode.workspace, 'createFileSystemWatcher')
    .mockReturnValue(mockWatcher as any);

  const mockParseResult = {
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
  };

  jest.spyOn(parser, 'parse').mockReturnValue(mockParseResult as any);
  // Ensure parseTestFile is also mocked
  if (typeof parser.parseTestFile === 'function') {
    jest.spyOn(parser, 'parseTestFile').mockReturnValue(mockParseResult as any);
  } else {
    // If parseTestFile is not yet available on the imported module (due to how jest.mock works with exports),
    // we might need to handle it. But since we use jest.spyOn(parser), it requires 'parser' to be the actual module object.
    // Assuming parseTestFile IS exported from parser.ts.
    // Wait, if I added it to parser.ts, it should be there.
    // But tests run against compiled JS? or TS via ts-jest?

    // Let's just try mocking it.
    jest.spyOn(parser, 'parseTestFile').mockReturnValue(mockParseResult as any);
  }

  // Mock testFileCache instead of isTestFile
  jest.spyOn(testFileCache, 'isTestFile').mockReturnValue(true);
  jest
    .spyOn(TestNameUtils, 'updateTestNameIfUsingProperties')
    .mockImplementation((name) => name);
  jest
    .spyOn(TestNameUtils, 'escapeRegExp')
    .mockImplementation((str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  jest
    .spyOn(util, 'pushMany')
    .mockImplementation((arr: any[], items: any[]) => {
      arr.push(...items);
      return arr.length;
    });

  jest.spyOn(vscode.debug, 'startDebugging').mockResolvedValue(true);
}

export function createMockProcess(): MockProcess {
  const mockProcess: MockProcess = new EventEmitter() as any;
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.kill = jest.fn();
  return mockProcess;
}

export function setupTestController(): TestControllerSetup {
  const mockContext = createMockContext();
  const mockWorkspaceFolder = createMockWorkspaceFolder();
  setupTestControllerMocks(mockWorkspaceFolder);
  const controller = new JestTestController(mockContext);

  return { controller, mockContext, mockWorkspaceFolder };
}
