import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
  Document,
  TextEditor,
  Uri,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from './__mocks__/vscode';
import { isWindows } from '../util';
import * as fs from 'node:fs';

describe('TestRunnerConfig', () => {
  describe('buildJestArgs', () => {
    let jestRunnerConfig: TestRunnerConfig;
    const mockFilePath = '/home/user/project/src/test.spec.ts';

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('/home/user/project') as any) as any,
        );
      jest
        .spyOn(vscode.window, 'activeTextEditor', 'get')
        .mockReturnValue(
          new TextEditor(new Document(new Uri(mockFilePath) as any)) as any,
        );
    });

    it('should build args with file path only', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        undefined,
        false,
      );

      // Jest uses regex patterns - special characters like dots must be escaped
      expect(args[0]).toBe('/home/user/project/src/test\\.spec\\.ts');
      expect(args).not.toContain('-c');
      expect(args).not.toContain('-t');
    });

    it('should build args with test name', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        'my test name',
        false,
      );

      expect(args[0]).toBe('/home/user/project/src/test\\.spec\\.ts');
      expect(args).toContain('-t');
      expect(args).toContain('my test name');
    });

    it('should escape special regex characters in file paths', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
        }),
      );

      // Test path with + (common in state management folders like +state)
      const filePathWithPlus = '/home/user/project/src/+state/test.spec.ts';
      const argsPlus = jestRunnerConfig.buildJestArgs(
        filePathWithPlus,
        undefined,
        false,
      );
      expect(argsPlus[0]).toBe('/home/user/project/src/\\+state/test\\.spec\\.ts');

      // Test path with [] (common in dynamic routes like Next.js [id])
      const filePathWithBrackets = '/home/user/project/src/[id]/test.spec.ts';
      const argsBrackets = jestRunnerConfig.buildJestArgs(
        filePathWithBrackets,
        undefined,
        false,
      );
      expect(argsBrackets[0]).toBe('/home/user/project/src/\\[id\\]/test\\.spec\\.ts');

      // Test path with () (can occur in folder names)
      const filePathWithParens = '/home/user/project/src/(group)/test.spec.ts';
      const argsParens = jestRunnerConfig.buildJestArgs(
        filePathWithParens,
        undefined,
        false,
      );
      expect(argsParens[0]).toBe('/home/user/project/src/\\(group\\)/test\\.spec\\.ts');

      // Test path with $ (can occur in folder names)
      const filePathWithDollar = '/home/user/project/src/$lib/test.spec.ts';
      const argsDollar = jestRunnerConfig.buildJestArgs(
        filePathWithDollar,
        undefined,
        false,
      );
      expect(argsDollar[0]).toBe('/home/user/project/src/\\$lib/test\\.spec\\.ts');

      // Test path with multiple special characters
      const filePathComplex = '/home/user/project/src/[id]+state/(group)/test.spec.ts';
      const argsComplex = jestRunnerConfig.buildJestArgs(
        filePathComplex,
        undefined,
        false,
      );
      expect(argsComplex[0]).toBe('/home/user/project/src/\\[id\\]\\+state/\\(group\\)/test\\.spec\\.ts');
    });

    it('should escape single quotes in test name when withQuotes is true', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        "test's name",
        true,
      );

      const testNameIndex = args.indexOf('-t') + 1;
      if (isWindows()) {
        expect(args[testNameIndex]).toBe('"test\'s name"');
      } else {
        expect(args[testNameIndex]).toContain("'\\''");
      }
    });

    it('should resolve test name string interpolation', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        'test with %s placeholder',
        false,
      );

      const testNameIndex = args.indexOf('-t') + 1;
      expect(args[testNameIndex]).not.toContain('%s');
    });

    it('should include config path when available', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': './jest.config.js',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        undefined,
        false,
      );

      expect(args).toContain('-c');
      const configIndex = args.indexOf('-c') + 1;
      expect(args[configIndex]).toContain('jest.config.js');
    });

    it('should add quotes when withQuotes is true', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': './jest.config.js',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        undefined,
        true,
      );

      expect(args[0]).toMatch(/^["'].*["']$/);
    });

    it('should include additional options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        undefined,
        false,
        ['--verbose', '--coverage'],
      );

      expect(args).toContain('--verbose');
      expect(args).toContain('--coverage');
    });

    it('should merge runOptions from config', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
          'jestrunner.runOptions': ['--silent', '--bail'],
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        undefined,
        false,
      );

      expect(args).toContain('--silent');
      expect(args).toContain('--bail');
    });

    it('should deduplicate options when runOptions overlap with additional options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
          'jestrunner.runOptions': ['--verbose', '--bail'],
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        undefined,
        false,
        ['--verbose', '--coverage'],
      );

      const verboseCount = args.filter((arg) => arg === '--verbose').length;
      expect(verboseCount).toBe(1);
      expect(args).toContain('--bail');
      expect(args).toContain('--coverage');
    });

    it('should build complete args with all parameters', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': './jest.config.js',
          'jestrunner.runOptions': ['--silent'],
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(
        mockFilePath,
        'complete test',
        true,
        ['--coverage'],
      );

      expect(args[0]).toMatch(/^["'].*test\\\.spec\\\.ts["']$/);
      expect(args).toContain('-c');
      expect(args).toContain('-t');
      expect(args).toContain('--silent');
      expect(args).toContain('--coverage');
    });
  });

  describe('buildVitestArgs', () => {
    let jestRunnerConfig: TestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('/workspace') as any) as any,
        );
    });

    it('should include run subcommand for vitest', () => {
      const args = jestRunnerConfig.buildVitestArgs(
        '/workspace/test.spec.ts',
        undefined,
        true,
      );

      expect(args[0]).toBe('run');
    });

    it('should include file path without regex escaping (vitest uses glob patterns)', () => {
      const args = jestRunnerConfig.buildVitestArgs(
        '/workspace/test.spec.ts',
        undefined,
        true,
      );

      const expectedPath = isWindows()
        ? '"/workspace/test.spec.ts"'
        : "'/workspace/test.spec.ts'";
      expect(args).toContain(expectedPath);
    });

    it('should include test name with -t flag', () => {
      const args = jestRunnerConfig.buildVitestArgs(
        '/workspace/test.spec.ts',
        'my test',
        true,
      );

      expect(args).toContain('-t');
      const expectedTestName = isWindows() ? '"my test"' : "'my test'";
      expect(args).toContain(expectedTestName);
    });

    it('should include vitest config path when set', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.vitestConfigPath': 'vitest.config.ts',
        }),
      );
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      const args = jestRunnerConfig.buildVitestArgs(
        '/workspace/test.spec.ts',
        undefined,
        true,
      );

      expect(args).toContain('--config');
    });

    it('should include additional options', () => {
      const args = jestRunnerConfig.buildVitestArgs(
        '/workspace/test.spec.ts',
        undefined,
        true,
        ['--coverage'],
      );

      expect(args).toContain('--coverage');
    });

    it('should include vitestRunOptions from config', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.vitestRunOptions': ['--reporter=verbose', '--no-color'],
        }),
      );

      const args = jestRunnerConfig.buildVitestArgs(
        '/workspace/test.spec.ts',
        undefined,
        true,
      );

      expect(args).toContain('--reporter=verbose');
      expect(args).toContain('--no-color');
    });
  });

  describe('buildTestArgs', () => {
    let jestRunnerConfig: TestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('/workspace') as any) as any,
        );
    });

    it('should use buildVitestArgs for vitest framework', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          return String(filePath).includes('vitest.config');
        });

      const args = jestRunnerConfig.buildTestArgs(
        '/workspace/test.spec.ts',
        'my test',
        true,
      );

      expect(args[0]).toBe('run');
    });

    it('should use buildJestArgs for jest framework', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          return String(filePath).includes('jest.config');
        });

      const args = jestRunnerConfig.buildTestArgs(
        '/workspace/test.spec.ts',
        'my test',
        true,
      );

      expect(args[0]).not.toBe('run');
    });
  });
});
