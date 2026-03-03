import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
  Document,
  TextEditor,
  Uri,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from './__mocks__/vscode';
import * as testFileDetection from '../testDetection/testFileDetection';

describe('TestRunnerConfig - Rstest Runner', () => {
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
          new Document(
            new Uri('/home/user/project/src/example.test.ts') as any,
          ),
        ) as any,
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('rstestCommand', () => {
    it('should return custom rstest command when set', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.rstestCommand': 'pnpm rstest',
        }),
      );

      expect(config.rstestCommand).toBe('pnpm rstest');
    });

    it('should return fallback rstest command when no custom command is set', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      expect(config.rstestCommand).toBe('npx --no-install rstest');
    });
  });

  describe('getTestCommand', () => {
    it('should return rstest command for rstest framework', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      jest
        .spyOn(testFileDetection, 'getTestFrameworkForFile')
        .mockReturnValue('rstest');

      const command = config.getTestCommand('/path/to/example.test.ts');

      expect(command).toBe('npx --no-install rstest');
    });
  });

  describe('rstestRunOptions', () => {
    it('should return null when no options configured', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      expect(config.rstestRunOptions).toBeNull();
    });

    it('should return configured options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.rstestRunOptions': ['--globals'],
        }),
      );

      expect(config.rstestRunOptions).toEqual(['--globals']);
    });
  });

  describe('buildRstestArgs', () => {
    it('should build basic args with file path', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      const args = config.buildRstestArgs(
        '/path/to/example.test.ts',
        undefined,
        false,
      );

      expect(args).toEqual(['/path/to/example.test.ts']);
    });

    it('should include testNamePattern when test name is provided', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      const args = config.buildRstestArgs(
        '/path/to/example.test.ts',
        'works',
        false,
      );

      expect(args).toEqual(['/path/to/example.test.ts', '-t', 'works']);
    });

    it('should pass rstest config path when available', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      jest
        .spyOn(config, 'getRstestConfigPath')
        .mockReturnValue('/path/to/rstest.config.ts');

      const args = config.buildRstestArgs(
        '/path/to/example.test.ts',
        undefined,
        false,
      );

      expect(args).toEqual([
        '--config',
        '/path/to/rstest.config.ts',
        '/path/to/example.test.ts',
      ]);
    });

    it('should merge configured run options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.rstestRunOptions': ['--globals'],
        }),
      );

      const args = config.buildRstestArgs(
        '/path/to/example.test.ts',
        undefined,
        false,
      );

      expect(args).toEqual(['/path/to/example.test.ts', '--globals']);
    });
  });
});
