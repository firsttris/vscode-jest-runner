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

describe('TestRunnerConfig - Playwright Runner', () => {
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
            new Uri('/home/user/project/tests/example.spec.ts') as any,
          ),
        ) as any,
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('playwrightCommand', () => {
    it('should return custom playwright command when set', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.playwrightCommand': 'pnpm playwright',
        }),
      );

      expect(config.playwrightCommand).toBe('pnpm playwright');
    });

    it('should return default playwright command when not set', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      expect(config.playwrightCommand).toBe('npx playwright');
    });
  });

  describe('getTestCommand', () => {
    it('should return playwright command for playwright framework', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      jest
        .spyOn(testFileDetection, 'getTestFrameworkForFile')
        .mockReturnValue('playwright');

      const command = config.getTestCommand('/path/to/test.spec.ts');

      expect(command).toBe('npx playwright');
    });

    it('should return custom playwright command for playwright framework', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.playwrightCommand': 'yarn playwright',
        }),
      );
      jest
        .spyOn(testFileDetection, 'getTestFrameworkForFile')
        .mockReturnValue('playwright');

      const command = config.getTestCommand('/path/to/test.spec.ts');

      expect(command).toBe('yarn playwright');
    });
  });

  describe('playwrightRunOptions', () => {
    it('should return null when no options configured', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      expect(config.playwrightRunOptions).toBeNull();
    });

    it('should return configured options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.playwrightRunOptions': ['--headed', '--workers=2'],
        }),
      );

      expect(config.playwrightRunOptions).toEqual(['--headed', '--workers=2']);
    });
  });

  describe('playwrightDebugOptions', () => {
    it('should return empty object when not configured', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      expect(config.playwrightDebugOptions).toEqual({});
    });

    it('should return configured debug options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.playwrightDebugOptions': {
            env: { PWDEBUG: '1' },
          },
        }),
      );

      expect(config.playwrightDebugOptions).toEqual({
        env: { PWDEBUG: '1' },
      });
    });
  });

  describe('buildPlaywrightArgs', () => {
    it('should build basic args with test subcommand and file path', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      const args = config.buildPlaywrightArgs(
        '/path/to/test.spec.ts',
        undefined,
        false,
      );

      expect(args[0]).toBe('test');
      expect(args).toContain('/path/to/test.spec.ts');
    });

    it('should include -g flag when test name is provided', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      const args = config.buildPlaywrightArgs(
        '/path/to/test.spec.ts',
        'my test',
        false,
      );

      expect(args).toContain('test');
      expect(args).toContain('-g');
      expect(args).toContain('my test');
      expect(args).toContain('/path/to/test.spec.ts');
    });

    it('should quote test name when withQuotes is true', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      const args = config.buildPlaywrightArgs(
        '/path/to/test.spec.ts',
        'my test',
        true,
      );

      expect(args).toContain('test');
      expect(args).toContain('-g');
      // On Linux, quotes are single quotes
      const gIndex = args.indexOf('-g');
      expect(args[gIndex + 1]).toMatch(/my test/);
    });

    it('should include run options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.playwrightRunOptions': ['--headed'],
        }),
      );

      const args = config.buildPlaywrightArgs(
        '/path/to/test.spec.ts',
        undefined,
        false,
      );

      expect(args).toContain('--headed');
    });

    it('should include additional options', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      const args = config.buildPlaywrightArgs(
        '/path/to/test.spec.ts',
        undefined,
        false,
        ['--project=chromium'],
      );

      expect(args).toContain('--project=chromium');
    });

    it('should merge additional options with run options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.playwrightRunOptions': ['--headed'],
        }),
      );

      const args = config.buildPlaywrightArgs(
        '/path/to/test.spec.ts',
        undefined,
        false,
        ['--project=chromium'],
      );

      expect(args).toContain('--headed');
      expect(args).toContain('--project=chromium');
    });

    it('should handle test name with string interpolation', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      const args = config.buildPlaywrightArgs(
        '/path/to/test.spec.ts',
        'test %s works',
        false,
      );

      expect(args).toContain('-g');
      // String interpolation should be resolved
      const gIndex = args.indexOf('-g');
      expect(args[gIndex + 1]).toMatch(/test .* works/);
    });

    it('should place file path at the end', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      const args = config.buildPlaywrightArgs(
        '/path/to/test.spec.ts',
        'my test',
        false,
      );
      const lastArg = args[args.length - 1];

      expect(lastArg).toBe('/path/to/test.spec.ts');
    });
  });
});
