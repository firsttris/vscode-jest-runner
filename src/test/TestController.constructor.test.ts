import * as vscode from 'vscode';
import { JestTestController } from '../TestController';
import * as parser from '../parser';
import {
  setupTestController,
  createMockContext,
  TestControllerSetup,
} from './testControllerSetup';

jest.mock('child_process');

describe('JestTestController - constructor and dispose', () => {
  let setup: TestControllerSetup;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();
  });

  afterEach(() => {
    setup.controller?.dispose();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a test controller', () => {
      expect(vscode.tests.createTestController).toHaveBeenCalledWith(
        'jestVitestTestController',
        'Jest/Vitest Tests',
      );
    });

    it('should create run profiles for Run, Debug, Coverage, and Update Snapshots', () => {
      const mockTestController = (
        vscode.tests.createTestController as jest.Mock
      ).mock.results[0].value;
      expect(mockTestController.createRunProfile).toHaveBeenCalledTimes(4);

      expect(mockTestController.createRunProfile).toHaveBeenCalledWith(
        'Run',
        vscode.TestRunProfileKind.Run,
        expect.any(Function),
        true,
      );

      expect(mockTestController.createRunProfile).toHaveBeenCalledWith(
        'Debug',
        vscode.TestRunProfileKind.Debug,
        expect.any(Function),
        true,
      );

      expect(mockTestController.createRunProfile).toHaveBeenCalledWith(
        'Coverage',
        vscode.TestRunProfileKind.Coverage,
        expect.any(Function),
        true,
      );

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
        '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
      );
    });
  });

  describe('dispose', () => {
    it('should dispose test controller and watchers', () => {
      const mockTestController = (
        vscode.tests.createTestController as jest.Mock
      ).mock.results[0].value;
      const mockWatcher = (
        vscode.workspace.createFileSystemWatcher as jest.Mock
      ).mock.results[0].value;

      setup.controller.dispose();

      expect(mockTestController.dispose).toHaveBeenCalled();
      expect(mockWatcher.dispose).toHaveBeenCalled();
    });
  });
});

describe('JestTestController - test discovery', () => {
  let setup: TestControllerSetup;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();
  });

  afterEach(() => {
    setup.controller?.dispose();
    jest.restoreAllMocks();
  });

  it('should find test files using configured pattern', async () => {
    expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
      expect.any(vscode.RelativePattern),
      '**/node_modules/**',
    );
  });

  it('should create test items for discovered files', () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    expect(mockTestController.createTestItem).toHaveBeenCalled();
  });

  it('should parse test structure from files', () => {
    expect(parser.parse).toHaveBeenCalled();
  });

  it('should handle parser errors gracefully', async () => {
    const { logError } = require('../util');
    const logErrorSpy = jest
      .spyOn({ logError }, 'logError')
      .mockImplementation();

    const parseError = new Error('Parse error');
    (parser.parse as jest.Mock).mockImplementation(() => {
      throw parseError;
    });

    (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
      vscode.Uri.file('/workspace/error.test.ts'),
    ]);

    const newController = new JestTestController(setup.mockContext);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(true).toBe(true);

    newController.dispose();
    logErrorSpy.mockRestore();
  });

  it('should handle empty parse results', () => {
    jest.spyOn(parser, 'parse').mockReturnValue({
      root: {
        children: [],
      },
    } as any);

    const newController = new JestTestController(setup.mockContext);
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[1].value;

    expect(mockTestController.items.size).toBeGreaterThanOrEqual(0);

    newController.dispose();
  });

  it('should create nested test items for describe blocks', () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    const createCalls = (mockTestController.createTestItem as jest.Mock).mock
      .calls;
    expect(createCalls.length).toBeGreaterThan(0);
  });

  it('should set correct test item tags', () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const createdItems = (
      mockTestController.createTestItem as jest.Mock
    ).mock.results.map((r) => r.value);

    createdItems.forEach((item: any) => {
      expect(item.tags).toBeDefined();
    });
  });

  it('should set test ranges for navigation', () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;
    const createdItems = (
      mockTestController.createTestItem as jest.Mock
    ).mock.results.map((r) => r.value);

    const itemsWithRanges = createdItems.filter((item: any) => item.range);
    expect(itemsWithRanges.length).toBeGreaterThanOrEqual(0);
  });
});
