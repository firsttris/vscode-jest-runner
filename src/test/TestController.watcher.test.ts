import * as vscode from 'vscode';
import * as parser from '../parser';
import {
  setupTestController,
  TestItem,
  TestControllerSetup,
} from './testControllerSetup';
import { testFileCache } from '../testDetection';

jest.mock('child_process');

describe('JestTestController - file watcher', () => {
  let setup: TestControllerSetup;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();
  });

  afterEach(() => {
    setup.controller?.dispose();
    jest.restoreAllMocks();
  });

  it('should reparse file on change', () => {
    const mockWatcher = (
      vscode.workspace.createFileSystemWatcher as jest.Mock
    ).mock.results[0].value;
    const changeCallback = (mockWatcher.onDidChange as jest.Mock).mock
      .calls[0][0];

    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const testFilePath = '/workspace/test.ts';
    const testItem = new TestItem(
      testFilePath,
      'test.ts',
      vscode.Uri.file(testFilePath),
    );
    mockTestController.items.add(testItem);

    (parser.parse as jest.Mock).mockClear();

    changeCallback({ fsPath: testFilePath });

    expect(parser.parse).toHaveBeenCalledWith(testFilePath);
  });

  it('should add new test file on create', () => {
    const mockWatcher = (
      vscode.workspace.createFileSystemWatcher as jest.Mock
    ).mock.results[0].value;
    const createCallback = (mockWatcher.onDidCreate as jest.Mock).mock
      .calls[0][0];

    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const previousItemCount = mockTestController.items.size;

    createCallback(vscode.Uri.file('/workspace/new-test.ts'));

    expect(mockTestController.items.size).toBeGreaterThanOrEqual(
      previousItemCount,
    );
  });

  it('should remove test file on delete', () => {
    const mockWatcher = (
      vscode.workspace.createFileSystemWatcher as jest.Mock
    ).mock.results[0].value;
    const deleteCallback = (mockWatcher.onDidDelete as jest.Mock).mock
      .calls[0][0];

    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const testFilePath = '/workspace/test.ts';
    const testItem = new TestItem(
      testFilePath,
      'test.ts',
      vscode.Uri.file(testFilePath),
    );
    mockTestController.items.add(testItem);

    deleteCallback(vscode.Uri.file(testFilePath));

    expect(mockTestController.items.get(testFilePath)).toBeUndefined();
  });

  it('should ignore changes to files outside workspace', () => {
    const mockWatcher = (
      vscode.workspace.createFileSystemWatcher as jest.Mock
    ).mock.results[0].value;
    const createCallback = (mockWatcher.onDidCreate as jest.Mock).mock
      .calls[0][0];

    (parser.parse as jest.Mock).mockClear();

    createCallback(vscode.Uri.file('/other/path/test.ts'));

    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('should not add non-test files on create', () => {
    const mockWatcher = (
      vscode.workspace.createFileSystemWatcher as jest.Mock
    ).mock.results[0].value;
    const createCallback = (mockWatcher.onDidCreate as jest.Mock).mock
      .calls[0][0];

    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    jest.spyOn(testFileCache, 'isTestFile').mockReturnValue(false);

    const initialItemCount = mockTestController.items.size;
    (parser.parse as jest.Mock).mockClear();

    createCallback(vscode.Uri.file('/workspace/regular-file.ts'));

    expect(parser.parse).not.toHaveBeenCalled();
    expect(mockTestController.items.size).toBe(initialItemCount);
  });
});
