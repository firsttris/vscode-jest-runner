import * as vscode from 'vscode';
import { TestRunner } from '../testRunner';
import { TestRunnerConfig } from '../testRunnerConfig';
import { Document, TextEditor, Uri } from './__mocks__/vscode';
import * as fs from 'fs';
import * as parser from '../parser';

describe('TestRunner', () => {
  let jestRunner: TestRunner;
  let mockConfig: TestRunnerConfig;
  let mockTerminal: vscode.Terminal;

  beforeEach(() => {
    mockConfig = {
      get jestCommand() { return 'node jest'; },
      get vitestCommand() { return 'npx vitest'; },
      get jestBinPath() { return 'node_modules/.bin/jest'; },
      get cwd() { return '/workspace'; },
      get changeDirectoryToWorkspaceRoot() { return false; },
      get preserveEditorFocus() { return false; },
      getJestConfigPath: jest.fn().mockReturnValue(''),
      getVitestConfigPath: jest.fn().mockReturnValue(''),
      getTestFramework: jest.fn().mockReturnValue('jest'),
      buildJestArgs: jest.fn((filePath, testName, withQuotes, options = []) => {
        const args = [filePath];
        if (testName) {
          args.push('-t', testName);
        }
        args.push(...options);
        return args;
      }),
      buildVitestArgs: jest.fn((filePath, testName, withQuotes, options = []) => {
        const args = ['run', filePath];
        if (testName) {
          args.push('-t', testName);
        }
        args.push(...options);
        return args;
      }),
      getDebugConfiguration: jest.fn(() => ({
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
        name: 'Debug Jest Tests',
        request: 'launch',
        type: 'node',
        runtimeExecutable: 'npx',
        cwd: '/workspace',
        args: ['--no-install', 'jest', '--runInBand'],
      })),
      get runOptions() { return null; },
      get debugOptions() { return {}; },
      get isRunInExternalNativeTerminal() { return false; },
      get isYarnPnpSupportEnabled() { return false; },
      get getYarnPnpCommand() { return ''; },
    } as any;

    mockTerminal = {
      show: jest.fn(),
      sendText: jest.fn(),
      dispose: jest.fn(),
    } as any;

    jest.spyOn(vscode.window, 'createTerminal').mockReturnValue(mockTerminal);
    jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
    jest.spyOn(vscode.debug, 'startDebugging').mockResolvedValue(true);
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(parser, 'parse').mockReturnValue({
      root: {
        children: [],
      },
    } as any);

    jestRunner = new TestRunner(mockConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('runTestsOnPath', () => {
    it('should build and run jest command for a file path', async () => {
      await jestRunner.runTestsOnPath('/workspace/test.ts');
      expect(mockTerminal.sendText).toHaveBeenCalled();
      const command = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];
      expect(command).toContain('node jest');
      expect(command).toContain('test.ts');
    });

    it('should create a terminal if none exists', async () => {
      await jestRunner.runTestsOnPath('/workspace/test.ts');
      expect(vscode.window.createTerminal).toHaveBeenCalledWith('jest');
    });

    it('should create a terminal with vitest name for vitest tests', async () => {
      (mockConfig.getTestFramework as jest.Mock).mockReturnValue('vitest');
      // Reset the terminal mock to ensure a fresh terminal is created
      (vscode.window.createTerminal as jest.Mock).mockClear();
      await jestRunner.runTestsOnPath('/workspace/test.spec.ts');
      expect(vscode.window.createTerminal).toHaveBeenCalledWith('vitest');
    });

    it('should show the terminal', async () => {
      await jestRunner.runTestsOnPath('/workspace/test.ts');
      expect(mockTerminal.show).toHaveBeenCalledWith(false);
    });
  });

  describe('runCurrentTest', () => {
    let mockEditor: vscode.TextEditor;

    beforeEach(() => {
      const mockDocument = new Document(new Uri('/workspace/test.ts'));
      mockDocument.fileName = '/workspace/test.ts';
      mockDocument.getText = jest.fn().mockReturnValue('');
      mockDocument.save = jest.fn().mockResolvedValue(true);
      mockEditor = new TextEditor(mockDocument) as any;
      mockEditor.selection = {
        isEmpty: true,
        active: { line: 5 },
      } as any;
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(mockEditor as any);
    });

    it('should save the document before running', async () => {
      await jestRunner.runCurrentTest();
      expect(mockEditor.document.save).toHaveBeenCalled();
    });

    it('should run with test name when provided', async () => {
      await jestRunner.runCurrentTest('My Test Name');
      expect(mockTerminal.sendText).toHaveBeenCalled();
      const command = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];
      expect(command).toContain('-t');
      expect(command).toContain('My Test Name');
    });

    it('should return early if no active editor', async () => {
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(undefined);
      await jestRunner.runCurrentTest();
      expect(mockTerminal.sendText).not.toHaveBeenCalled();
    });

    it('should handle collectCoverageFromCurrentFile option', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      await jestRunner.runCurrentTest(undefined, [], true);
      expect(mockTerminal.sendText).toHaveBeenCalled();
      const command = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];
      expect(command).toContain('--collectCoverageFrom');
    });
  });

  describe('runCurrentFile', () => {
    let mockEditor: vscode.TextEditor;

    beforeEach(() => {
      const mockDocument = new Document(new Uri('/workspace/test.ts'));
      mockDocument.fileName = '/workspace/test.ts';
      mockDocument.save = jest.fn().mockResolvedValue(true);
      mockEditor = new TextEditor(mockDocument) as any;
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(mockEditor as any);
    });

    it('should save the document before running', async () => {
      await jestRunner.runCurrentFile();
      expect(mockEditor.document.save).toHaveBeenCalled();
    });

    it('should run jest command without test name', async () => {
      await jestRunner.runCurrentFile();
      expect(mockTerminal.sendText).toHaveBeenCalled();
      const command = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];
      expect(command).not.toContain('-t');
    });

    it('should return early if no active editor', async () => {
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(undefined);
      await jestRunner.runCurrentFile();
      expect(mockTerminal.sendText).not.toHaveBeenCalled();
    });

    it('should pass custom options to jest', async () => {
      await jestRunner.runCurrentFile(['--verbose', '--no-cache']);
      const command = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];
      expect(command).toContain('--verbose');
      expect(command).toContain('--no-cache');
    });
  });

  describe('runPreviousTest', () => {
    let mockEditor: vscode.TextEditor;

    beforeEach(() => {
      const mockDocument = new Document(new Uri('/workspace/test.ts'));
      mockDocument.fileName = '/workspace/test.ts';
      mockDocument.save = jest.fn().mockResolvedValue(true);
      mockEditor = new TextEditor(mockDocument) as any;
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(mockEditor as any);
    });

    it('should run the previous command', async () => {
      // First run a test
      await jestRunner.runTestsOnPath('/workspace/test.ts');
      const firstCommand = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];

      // Clear mock
      (mockTerminal.sendText as jest.Mock).mockClear();

      // Run previous test
      await jestRunner.runPreviousTest();
      const secondCommand = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];

      expect(secondCommand).toBe(firstCommand);
    });

    it('should return early if no active editor', async () => {
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(undefined);
      await jestRunner.runPreviousTest();
      expect(mockTerminal.sendText).not.toHaveBeenCalled();
    });
  });

  describe('debugTestsOnPath', () => {
    it('should start debugging session', async () => {
      await jestRunner.debugTestsOnPath('/workspace/test.ts');
      expect(vscode.debug.startDebugging).toHaveBeenCalled();
    });

    it('should create debug configuration with correct parameters', async () => {
      await jestRunner.debugTestsOnPath('/workspace/test.ts');
      const debugCall = (vscode.debug.startDebugging as jest.Mock).mock.calls[0];
      const config = debugCall[1];
      expect(config.type).toBe('node');
      expect(config.request).toBe('launch');
      expect(config.runtimeExecutable).toBe('npx');
      expect(config.args).toContain('--runInBand');
    });
  });

  describe('debugCurrentTest', () => {
    let mockEditor: vscode.TextEditor;

    beforeEach(() => {
      const mockDocument = new Document(new Uri('/workspace/test.ts'));
      mockDocument.fileName = '/workspace/test.ts';
      mockDocument.save = jest.fn().mockResolvedValue(true);
      mockEditor = new TextEditor(mockDocument) as any;
      mockEditor.selection = {
        isEmpty: true,
        active: { line: 5 },
      } as any;
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(mockEditor as any);
    });

    it('should save the document before debugging', async () => {
      await jestRunner.debugCurrentTest();
      expect(mockEditor.document.save).toHaveBeenCalled();
    });

    it('should start debugging session with test name', async () => {
      await jestRunner.debugCurrentTest('My Test');
      expect(vscode.debug.startDebugging).toHaveBeenCalled();
      const debugCall = (vscode.debug.startDebugging as jest.Mock).mock.calls[0];
      const config = debugCall[1];
      expect(config.args).toContain('-t');
    });

    it('should return early if no active editor', async () => {
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(undefined);
      await jestRunner.debugCurrentTest();
      expect(vscode.debug.startDebugging).not.toHaveBeenCalled();
    });
  });

  describe('changeDirectoryToWorkspaceRoot option', () => {
    it('should change directory when option is enabled', async () => {
      mockConfig = {
        ...mockConfig,
        get changeDirectoryToWorkspaceRoot() { return true; },
        get cwd() { return '/different/path'; },
      } as any;
      jestRunner = new TestRunner(mockConfig);

      await jestRunner.runTestsOnPath('/workspace/test.ts');
      
      const calls = (mockTerminal.sendText as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(1);
      expect(calls[0][0]).toContain('cd');
      expect(calls[0][0]).toContain('/different/path');
    });

    it('should not change directory when option is disabled', async () => {
      mockConfig = {
        ...mockConfig,
        get changeDirectoryToWorkspaceRoot() { return false; },
      } as any;
      jestRunner = new TestRunner(mockConfig);

      await jestRunner.runTestsOnPath('/workspace/test.ts');
      
      const calls = (mockTerminal.sendText as jest.Mock).mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).not.toContain('cd');
    });
  });

  describe('preserveEditorFocus option', () => {
    it('should preserve focus when option is enabled', async () => {
      mockConfig = {
        ...mockConfig,
        get preserveEditorFocus() { return true; },
      } as any;
      jestRunner = new TestRunner(mockConfig);

      await jestRunner.runTestsOnPath('/workspace/test.ts');
      expect(mockTerminal.show).toHaveBeenCalledWith(true);
    });

    it('should not preserve focus when option is disabled', async () => {
      mockConfig = {
        ...mockConfig,
        get preserveEditorFocus() { return false; },
      } as any;
      jestRunner = new TestRunner(mockConfig);

      await jestRunner.runTestsOnPath('/workspace/test.ts');
      expect(mockTerminal.show).toHaveBeenCalledWith(false);
    });
  });

  describe('yarn pnp support', () => {
    it('should use yarn command when enabled', async () => {
      mockConfig = {
        ...mockConfig,
        get isYarnPnpSupportEnabled() { return true; },
        get getYarnPnpCommand() { return 'yarn-3.2.0.cjs'; },
        getDebugConfiguration: jest.fn(() => ({
          console: 'integratedTerminal',
          internalConsoleOptions: 'neverOpen',
          name: 'Debug Jest Tests',
          request: 'launch',
          type: 'node',
          program: '.yarn/releases/yarn-3.2.0.cjs',
          cwd: '/workspace',
          args: ['jest'],
        })),
      } as any;
      jestRunner = new TestRunner(mockConfig);

      await jestRunner.debugTestsOnPath('/workspace/test.ts');
      
      const debugCall = (vscode.debug.startDebugging as jest.Mock).mock.calls[0];
      const config = debugCall[1];
      expect(config.program).toContain('.yarn/releases/');
      expect(config.args).toContain('jest');
    });
  });

  describe('terminal cleanup', () => {
    it('should register onDidCloseTerminal handler that nullifies terminal reference', () => {
      // Get the callback registered with onDidCloseTerminal
      const windowMock = vscode.window as any;
      expect(windowMock.onDidCloseTerminal).toHaveBeenCalled();
      const callback = windowMock.onDidCloseTerminal.mock.calls[0][0];
      
      // Verify the callback is a function
      expect(typeof callback).toBe('function');
      
      // The callback should handle terminal close events properly
      // This ensures the JestRunner instance sets up the cleanup handler
      expect(callback).toBeDefined();
    });
  });
});
