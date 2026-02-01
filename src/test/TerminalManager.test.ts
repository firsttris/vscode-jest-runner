import * as vscode from 'vscode';
import { TerminalManager } from '../TerminalManager';

jest.mock('vscode');

describe('TerminalManager', () => {
  let terminalManager: TerminalManager;
  let mockTerminal: {
    show: jest.Mock;
    sendText: jest.Mock;
    dispose: jest.Mock;
    processId: Promise<number>;
  };
  let closeTerminalCallback: ((terminal: any) => void) | null = null;

  beforeEach(() => {
    mockTerminal = {
      show: jest.fn(),
      sendText: jest.fn(),
      dispose: jest.fn(),
      processId: Promise.resolve(12345),
    };

    (vscode.window.createTerminal as jest.Mock) = jest.fn().mockReturnValue(mockTerminal);
    (vscode.window.onDidCloseTerminal as jest.Mock) = jest.fn((callback) => {
      closeTerminalCallback = callback;
      return { dispose: jest.fn() };
    });

    terminalManager = new TerminalManager();
  });

  afterEach(() => {
    terminalManager.dispose();
    closeTerminalCallback = null;
  });

  describe('runCommand', () => {
    it('should create a new terminal and run command', async () => {
      await terminalManager.runCommand('npm test', { framework: 'jest', cwd: '/project' });

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: 'jest',
        cwd: '/project',
        env: undefined,
      });
      expect(mockTerminal.show).toHaveBeenCalledWith(undefined);
      expect(mockTerminal.sendText).toHaveBeenCalledWith('npm test');
    });

    it('should create vitest terminal for vitest framework', async () => {
      await terminalManager.runCommand('npx vitest', { framework: 'vitest', cwd: '/project' });

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: 'vitest',
        cwd: '/project',
        env: undefined,
      });
    });

    it('should reuse existing terminal for same framework', async () => {
      await terminalManager.runCommand('npm test', { framework: 'jest', cwd: '/project' });
      await terminalManager.runCommand('npm test -- file.test.ts', { framework: 'jest', cwd: '/project' });

      expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
      expect(mockTerminal.sendText).toHaveBeenCalledTimes(2);
    });

    it('should create new terminal when framework changes', async () => {
      await terminalManager.runCommand('npm test', { framework: 'jest', cwd: '/project' });
      await terminalManager.runCommand('npx vitest', { framework: 'vitest', cwd: '/project' });

      expect(vscode.window.createTerminal).toHaveBeenCalledTimes(2);
      expect(mockTerminal.dispose).toHaveBeenCalledTimes(1);
    });

    it('should create new terminal when cwd changes', async () => {
      await terminalManager.runCommand('npm test', { framework: 'jest', cwd: '/project1' });
      await terminalManager.runCommand('npm test', { framework: 'jest', cwd: '/project2' });

      expect(vscode.window.createTerminal).toHaveBeenCalledTimes(2);
      expect(mockTerminal.dispose).toHaveBeenCalledTimes(1);
    });

    it('should create new terminal when env changes', async () => {
      await terminalManager.runCommand('npm test', { framework: 'jest', env: { NODE_ENV: 'test' } });
      await terminalManager.runCommand('npm test', { framework: 'jest', env: { NODE_ENV: 'development' } });

      expect(vscode.window.createTerminal).toHaveBeenCalledTimes(2);
    });

    it('should pass preserveEditorFocus to terminal.show', async () => {
      await terminalManager.runCommand('npm test', { framework: 'jest', preserveEditorFocus: true });

      expect(mockTerminal.show).toHaveBeenCalledWith(true);
    });

    it('should pass env to terminal', async () => {
      const env = { NODE_ENV: 'test', DEBUG: 'true' };
      await terminalManager.runCommand('npm test', { framework: 'jest', env });

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: 'jest',
        cwd: undefined,
        env,
      });
    });
  });

  describe('terminal close handling', () => {
    it('should clean up reference when terminal is closed by user', async () => {
      await terminalManager.runCommand('npm test', { framework: 'jest' });

      // Simulate terminal close
      closeTerminalCallback?.(mockTerminal);

      // Should create new terminal on next command
      await terminalManager.runCommand('npm test', { framework: 'jest' });

      expect(vscode.window.createTerminal).toHaveBeenCalledTimes(2);
    });

    it('should not clean up when different terminal is closed', async () => {
      await terminalManager.runCommand('npm test', { framework: 'jest' });

      // Simulate different terminal close
      closeTerminalCallback?.({ name: 'other' });

      // Should reuse existing terminal
      await terminalManager.runCommand('npm test', { framework: 'jest' });

      expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('should dispose terminal and clean up', async () => {
      await terminalManager.runCommand('npm test', { framework: 'jest' });

      terminalManager.dispose();

      expect(mockTerminal.dispose).toHaveBeenCalled();
    });

    it('should handle dispose when no terminal exists', () => {
      expect(() => terminalManager.dispose()).not.toThrow();
    });
  });
});
