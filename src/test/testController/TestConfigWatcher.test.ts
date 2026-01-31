import * as vscode from 'vscode';
import { TestConfigWatcher } from '../../testController/TestConfigWatcher';
import * as Settings from '../../config/Settings';

jest.mock('vscode');
jest.mock('../../config/Settings');

describe('TestConfigWatcher', () => {
  let mockWatcher: {
    onDidChange: jest.Mock;
    onDidCreate: jest.Mock;
    onDidDelete: jest.Mock;
    dispose: jest.Mock;
  };
  let configChangeCallback: ((e: any) => void) | null = null;
  let didChangeCallback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWatcher = {
      onDidChange: jest.fn(),
      onDidCreate: jest.fn(),
      onDidDelete: jest.fn(),
      dispose: jest.fn(),
    };

    (vscode.workspace.createFileSystemWatcher as jest.Mock) = jest.fn().mockReturnValue(mockWatcher);
    (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn((callback) => {
      configChangeCallback = callback;
      return { dispose: jest.fn() };
    });
    (vscode.workspace.workspaceFolders as any) = [{ uri: { fsPath: '/workspace' } }];

    (Settings.getJestConfigPath as jest.Mock) = jest.fn().mockReturnValue(undefined);
    (Settings.getVitestConfigPath as jest.Mock) = jest.fn().mockReturnValue(undefined);

    didChangeCallback = jest.fn();
  });

  afterEach(() => {
    configChangeCallback = null;
  });

  describe('constructor', () => {
    it('should setup configuration watcher', () => {
      new TestConfigWatcher();

      expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    });
  });

  describe('onDidChange event', () => {
    it('should fire when jestrunner config changes', () => {
      const watcher = new TestConfigWatcher();
      watcher.onDidChange(didChangeCallback);

      configChangeCallback?.({
        affectsConfiguration: (section: string) => section === 'jestrunner',
      });

      expect(didChangeCallback).toHaveBeenCalled();
    });

    it('should fire when vitest config changes', () => {
      const watcher = new TestConfigWatcher();
      watcher.onDidChange(didChangeCallback);

      configChangeCallback?.({
        affectsConfiguration: (section: string) => section === 'vitest',
      });

      expect(didChangeCallback).toHaveBeenCalled();
    });

    it('should fire when jest config changes', () => {
      const watcher = new TestConfigWatcher();
      watcher.onDidChange(didChangeCallback);

      configChangeCallback?.({
        affectsConfiguration: (section: string) => section === 'jest',
      });

      expect(didChangeCallback).toHaveBeenCalled();
    });

    it('should not fire for unrelated config changes', () => {
      const watcher = new TestConfigWatcher();
      watcher.onDidChange(didChangeCallback);

      configChangeCallback?.({
        affectsConfiguration: (section: string) => section === 'editor',
      });

      expect(didChangeCallback).not.toHaveBeenCalled();
    });
  });

  describe('custom config watchers', () => {
    it('should watch string config path', () => {
      (Settings.getJestConfigPath as jest.Mock).mockReturnValue('jest.config.js');

      new TestConfigWatcher();

      // Should create watcher for custom path
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
        '/workspace/jest.config.js'
      );
    });

    it('should watch absolute config path', () => {
      (Settings.getJestConfigPath as jest.Mock).mockReturnValue('/absolute/path/jest.config.js');

      new TestConfigWatcher();

      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
        '/absolute/path/jest.config.js'
      );
    });

    it('should watch object config paths', () => {
      (Settings.getJestConfigPath as jest.Mock).mockReturnValue({
        'packages/app': 'jest.config.app.js',
        'packages/lib': 'jest.config.lib.js',
      });

      new TestConfigWatcher();

      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
        '/workspace/jest.config.app.js'
      );
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
        '/workspace/jest.config.lib.js'
      );
    });

    it('should watch vitest config paths', () => {
      (Settings.getVitestConfigPath as jest.Mock).mockReturnValue('vitest.config.ts');

      new TestConfigWatcher();

      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
        '/workspace/vitest.config.ts'
      );
    });

    it('should refresh custom watchers on config change', () => {
      (Settings.getJestConfigPath as jest.Mock).mockReturnValue('old.config.js');

      const watcher = new TestConfigWatcher();
      const initialCallCount = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length;

      // Change config
      (Settings.getJestConfigPath as jest.Mock).mockReturnValue('new.config.js');

      configChangeCallback?.({
        affectsConfiguration: (section: string) => section === 'jestrunner',
      });

      expect((vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('dispose', () => {
    it('should dispose all watchers', () => {
      const watcher = new TestConfigWatcher();

      watcher.dispose();

      expect(mockWatcher.dispose).toHaveBeenCalled();
    });
  });
});
