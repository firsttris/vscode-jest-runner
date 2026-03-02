import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
  Document,
  TextEditor,
  Uri,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from './__mocks__/vscode';
import * as fs from 'node:fs';
import * as testFileDetection from '../testDetection/testFileDetection';

describe('TestRunnerConfig - Deno Runner', () => {
  let config: TestRunnerConfig;

  beforeEach(() => {
    config = new TestRunnerConfig();
    jest
      .spyOn(vscode.workspace, 'getWorkspaceFolder')
      .mockReturnValue(
        new WorkspaceFolder(new Uri('/home/user/project') as any) as any,
      );
    jest
      .spyOn(vscode.window, 'activeTextEditor', 'get')
      .mockReturnValue(
        new TextEditor(
          new Document(new Uri('/home/user/project/test.ts') as any),
        ) as any,
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('denoCommand', () => {
    it('should return default deno command', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      expect(config.denoCommand).toBe('deno');
    });
  });

  describe('getTestCommand', () => {
    it('should return deno command for deno framework', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      jest
        .spyOn(testFileDetection, 'getTestFrameworkForFile')
        .mockReturnValue('deno');

      const command = config.getTestCommand('/path/to/test.ts');

      expect(command).toBe('deno');
    });
  });

  describe('denoRunOptions', () => {
    it('should return null when no options configured', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      expect(config.denoRunOptions).toBeNull();
    });

    it('should return configured options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.denoRunOptions': ['--allow-net'],
        }),
      );

      expect(config.denoRunOptions).toEqual(['--allow-net']);
    });
  });

  describe('buildDenoArgs', () => {
    it('should build basic args with allow-all and junit reporter by default', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      const args = config.buildDenoArgs('/path/to/test.ts', undefined, false);
      expect(args).toEqual([
        'test',
        '--allow-all',
        '--junit-path=.deno-report.xml',
        '/path/to/test.ts',
      ]);
    });

    it('should include filter when test name provided', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      const args = config.buildDenoArgs('/path/to/test.ts', 'my test', false);
      expect(args).toEqual([
        'test',
        '--allow-all',
        '--filter',
        'my test',
        '--junit-path=.deno-report.xml',
        '/path/to/test.ts',
      ]);
    });

    it('should include run options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.denoRunOptions': ['--quiet'],
        }),
      );
      const args = config.buildDenoArgs('/path/to/test.ts', undefined, false);
      expect(args).toEqual([
        'test',
        '--allow-all',
        '--junit-path=.deno-report.xml',
        '--quiet',
        '/path/to/test.ts',
      ]);
    });

    it('should include coverage flag when requested', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      const args = config.buildDenoArgs('/path/to/test.ts', undefined, false, [
        '--coverage',
      ]);
      expect(args).toEqual([
        'test',
        '--allow-all',
        '--junit-path=.deno-report.xml',
        '--coverage=coverage',
        '/path/to/test.ts',
      ]);
    });
  });
});
