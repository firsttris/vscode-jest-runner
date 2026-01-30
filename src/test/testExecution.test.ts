import * as vscode from 'vscode';
import { buildTestArgs } from '../testExecution';
import { TestRunnerConfig } from '../testRunnerConfig';
import { Uri, WorkspaceConfiguration, WorkspaceFolder } from './__mocks__/vscode';

// Mock normalizePath to always convert backslashes (simulates Windows behavior)
jest.mock('../util', () => {
  const actual = jest.requireActual('../util');
  return {
    ...actual,
    normalizePath: (path: string) => path.replace(/\\/g, '/'),
  };
});

describe('buildTestArgs', () => {
  let mockTestController: vscode.TestController;
  let mockJestConfig: TestRunnerConfig;

  beforeEach(() => {
    mockTestController = {
      items: {
        get: jest.fn().mockReturnValue(undefined),
      },
    } as unknown as vscode.TestController;

    mockJestConfig = {
      getJestConfigPath: jest.fn().mockReturnValue('/workspace/jest.config.js'),
      getVitestConfigPath: jest.fn().mockReturnValue('/workspace/vitest.config.ts'),
      buildJestArgs: jest.fn(),
      buildVitestArgs: jest.fn(),
    } as unknown as TestRunnerConfig;

    jest
      .spyOn(vscode.workspace, 'getConfiguration')
      .mockReturnValue(new WorkspaceConfiguration({}) as any);
    jest
      .spyOn(vscode.workspace, 'getWorkspaceFolder')
      .mockReturnValue(new WorkspaceFolder(new Uri('/workspace') as any) as any);
  });

  describe('Windows path normalization', () => {
    it('should normalize Windows backslashes to forward slashes for Jest', () => {
      const windowsPath = 'C:\\Projects\\app\\src\\test.spec.ts';
      const testsByFile = new Map([[windowsPath, []]]);

      const args = buildTestArgs(
        [windowsPath],
        testsByFile as any,
        false, // isVitest
        [],
        false, // collectCoverage
        mockJestConfig,
        mockTestController,
      );

      // Should contain normalized path with forward slashes
      expect(args).toContain('C:/Projects/app/src/test.spec.ts');
      expect(args.join(' ')).not.toContain('\\');
    });

    it('should normalize Windows backslashes to forward slashes for Vitest', () => {
      const windowsPath = 'C:\\Projects\\app\\src\\test.spec.ts';
      const testsByFile = new Map([[windowsPath, []]]);

      const args = buildTestArgs(
        [windowsPath],
        testsByFile as any,
        true, // isVitest
        [],
        false, // collectCoverage
        mockJestConfig,
        mockTestController,
      );

      // Should contain normalized path with forward slashes
      expect(args).toContain('C:/Projects/app/src/test.spec.ts');
      expect(args.join(' ')).not.toContain('\\');
    });

    it('should handle multiple Windows paths', () => {
      const windowsPaths = [
        'C:\\Projects\\app\\src\\test1.spec.ts',
        'C:\\Projects\\app\\src\\test2.spec.ts',
      ];
      const testsByFile = new Map(windowsPaths.map((p) => [p, []]));

      const args = buildTestArgs(
        windowsPaths,
        testsByFile as any,
        false,
        [],
        false,
        mockJestConfig,
        mockTestController,
      );

      expect(args).toContain('C:/Projects/app/src/test1.spec.ts');
      expect(args).toContain('C:/Projects/app/src/test2.spec.ts');
    });

    it('should not modify Unix paths', () => {
      const unixPath = '/home/user/project/src/test.spec.ts';
      const testsByFile = new Map([[unixPath, []]]);

      const args = buildTestArgs(
        [unixPath],
        testsByFile as any,
        false,
        [],
        false,
        mockJestConfig,
        mockTestController,
      );

      expect(args).toContain('/home/user/project/src/test.spec.ts');
    });
  });
});
