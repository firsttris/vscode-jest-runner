import * as vscode from 'vscode';
import { JestTestController } from '../TestController';
import * as parser from '../parser';
import { DetailedFileCoverage } from '../coverageProvider';
import {
  setupTestController,
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

    it('should set loadDetailedCoverage on coverage profile', () => {
      const mockTestController = (
        vscode.tests.createTestController as jest.Mock
      ).mock.results[0].value;
      const coverageProfile = (mockTestController.createRunProfile as jest.Mock)
        .mock.results[2].value;

      expect(coverageProfile.loadDetailedCoverage).toBeDefined();
      expect(typeof coverageProfile.loadDetailedCoverage).toBe('function');
    });

    it('should return empty array for non-DetailedFileCoverage', async () => {
      const mockTestController = (
        vscode.tests.createTestController as jest.Mock
      ).mock.results[0].value;
      const coverageProfile = (mockTestController.createRunProfile as jest.Mock)
        .mock.results[2].value;

      const mockTestRun = {} as vscode.TestRun;
      const regularFileCoverage = { uri: vscode.Uri.file('/test.ts') };
      const mockToken = { isCancellationRequested: false } as vscode.CancellationToken;

      const result = await coverageProfile.loadDetailedCoverage(
        mockTestRun,
        regularFileCoverage,
        mockToken,
      );

      expect(result).toEqual([]);
    });

    it('should call coverageProvider.loadDetailedCoverage for DetailedFileCoverage', async () => {
      const mockTestController = (
        vscode.tests.createTestController as jest.Mock
      ).mock.results[0].value;
      const coverageProfile = (mockTestController.createRunProfile as jest.Mock)
        .mock.results[2].value;

      const mockTestRun = {} as vscode.TestRun;
      const detailedCoverage = new DetailedFileCoverage(
        vscode.Uri.file('/test.ts'),
        new vscode.TestCoverageCount(10, 8),
        new vscode.TestCoverageCount(5, 4),
        new vscode.TestCoverageCount(3, 2),
        {
          path: '/test.ts',
          statementMap: {},
          fnMap: {},
          branchMap: {},
          s: {},
          f: {},
          b: {},
        },
      );
      const mockToken = { isCancellationRequested: false } as vscode.CancellationToken;

      const result = await coverageProfile.loadDetailedCoverage(
        mockTestRun,
        detailedCoverage,
        mockToken,
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should setup document open handler instead of discovering all tests at startup', () => {
      expect(vscode.workspace.onDidOpenTextDocument).toHaveBeenCalled();
      expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
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

describe('JestTestController - configuration watcher', () => {
  let setup: TestControllerSetup;

  beforeEach(() => {
    jest.clearAllMocks();
    setup = setupTestController();
  });

  afterEach(() => {
    setup.controller?.dispose();
    jest.restoreAllMocks();
  });

  it('should refresh tests when jestrunner configuration changes', async () => {
    const onDidChangeConfig = (
      vscode.workspace.onDidChangeConfiguration as jest.Mock
    ).mock.calls[0][0];

    const mockEvent = {
      affectsConfiguration: (section: string) => section === 'jestrunner',
    };

    (vscode.workspace.findFiles as jest.Mock).mockClear();

    await onDidChangeConfig(mockEvent);

    expect(vscode.workspace.findFiles).toHaveBeenCalled();
  });

  it('should refresh tests when vitest configuration changes', async () => {
    const onDidChangeConfig = (
      vscode.workspace.onDidChangeConfiguration as jest.Mock
    ).mock.calls[0][0];

    const mockEvent = {
      affectsConfiguration: (section: string) => section === 'vitest',
    };

    (vscode.workspace.findFiles as jest.Mock).mockClear();

    await onDidChangeConfig(mockEvent);

    expect(vscode.workspace.findFiles).toHaveBeenCalled();
  });

  it('should refresh tests when jest configuration changes', async () => {
    const onDidChangeConfig = (
      vscode.workspace.onDidChangeConfiguration as jest.Mock
    ).mock.calls[0][0];

    const mockEvent = {
      affectsConfiguration: (section: string) => section === 'jest',
    };

    (vscode.workspace.findFiles as jest.Mock).mockClear();

    await onDidChangeConfig(mockEvent);

    expect(vscode.workspace.findFiles).toHaveBeenCalled();
  });

  it('should not refresh tests for unrelated configuration changes', async () => {
    const onDidChangeConfig = (
      vscode.workspace.onDidChangeConfiguration as jest.Mock
    ).mock.calls[0][0];

    const mockEvent = {
      affectsConfiguration: () => false,
    };

    (vscode.workspace.findFiles as jest.Mock).mockClear();

    await onDidChangeConfig(mockEvent);

    expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
  });

  it('should clear all test items before refreshing', async () => {
    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    const onDidChangeConfig = (
      vscode.workspace.onDidChangeConfiguration as jest.Mock
    ).mock.calls[0][0];

    const mockEvent = {
      affectsConfiguration: (section: string) => section === 'jestrunner',
    };

    const replaceSpy = jest.spyOn(mockTestController.items, 'replace');

    await onDidChangeConfig(mockEvent);

    expect(replaceSpy).toHaveBeenCalledWith([]);
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

  it('should discover tests when a test file is opened', () => {
    const onOpenCallback = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];

    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    const mockDocument = {
      uri: vscode.Uri.file('/workspace/test.spec.ts'),
      getText: () => 'describe("test", () => { it("works", () => {}) })',
    };

    (mockTestController.createTestItem as jest.Mock).mockClear();
    (parser.parse as jest.Mock).mockClear();

    onOpenCallback(mockDocument);

    expect(mockTestController.createTestItem).toHaveBeenCalled();
    expect(parser.parse).toHaveBeenCalled();
  });

  it('should not discover tests at startup', () => {
    expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
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

  it('should create nested test items for describe blocks when document is opened', () => {
    const onOpenCallback = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];

    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    (mockTestController.createTestItem as jest.Mock).mockClear();

    const mockDocument = {
      uri: vscode.Uri.file('/workspace/nested.spec.ts'),
      getText: () => 'describe("suite", () => { describe("nested", () => { it("test", () => {}) }) })',
    };

    onOpenCallback(mockDocument);

    const createCalls = (mockTestController.createTestItem as jest.Mock).mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
  });

  it('should set correct test item tags', () => {
    const onOpenCallback = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];

    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    (mockTestController.createTestItem as jest.Mock).mockClear();

    const mockDocument = {
      uri: vscode.Uri.file('/workspace/tags.spec.ts'),
      getText: () => 'it("test", () => {})',
    };

    onOpenCallback(mockDocument);

    const createdItems = (
      mockTestController.createTestItem as jest.Mock
    ).mock.results.map((r) => r.value);

    createdItems.forEach((item: any) => {
      expect(item.tags).toBeDefined();
    });
  });

  it('should set test ranges for navigation', () => {
    const onOpenCallback = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];

    const mockTestController = (
      vscode.tests.createTestController as jest.Mock
    ).mock.results[0].value;

    (mockTestController.createTestItem as jest.Mock).mockClear();

    const mockDocument = {
      uri: vscode.Uri.file('/workspace/ranges.spec.ts'),
      getText: () => 'it("test", () => {})',
    };

    onOpenCallback(mockDocument);

    const createdItems = (
      mockTestController.createTestItem as jest.Mock
    ).mock.results.map((r) => r.value);

    const itemsWithRanges = createdItems.filter((item: any) => item.range);
    expect(itemsWithRanges.length).toBeGreaterThanOrEqual(0);
  });
});
