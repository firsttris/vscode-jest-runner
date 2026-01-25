import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
  Document,
  TextEditor,
  Uri,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from './__mocks__/vscode';
import { isWindows, normalizePath } from '../util';
import * as fs from 'fs';
import * as path from 'path';

const describes = {
  windows: isWindows() ? describe : describe.skip,
  linux: ['linux', 'darwin'].includes(process.platform)
    ? describe
    : describe.skip,
};

const its = {
  windows: isWindows() ? it : it.skip,
  linux: ['linux', 'darwin'].includes(process.platform) ? it : it.skip,
};

describe('TestRunnerConfig.findConfigPath - Subdirectory Search', () => {
  describe('config in test subdirectories', () => {
    const scenarios: Array<
      [
        os: 'windows' | 'linux',
        name: string,
        behavior: string,
        workspacePath: string,
        openedFilePath: string,
        subdirName: string,
        configFileName: string,
        expectedConfigPath: string,
      ]
    > = [
      [
        'linux',
        'jest config in test subdirectory',
        'returns the config path from test subdir',
        '/home/user/workspace',
        '/home/user/workspace/src/index.test.js',
        'test',
        'jest.config.js',
        '/home/user/workspace/test/jest.config.js',
      ],
      [
        'linux',
        'vitest config in __tests__ subdirectory',
        'returns the config path from __tests__ subdir',
        '/home/user/workspace',
        '/home/user/workspace/src/index.spec.ts',
        '__tests__',
        'vitest.config.ts',
        '/home/user/workspace/__tests__/vitest.config.ts',
      ],
      [
        'linux',
        'jest config in e2e subdirectory',
        'returns the config path from e2e subdir',
        '/home/user/workspace',
        '/home/user/workspace/src/e2e.test.js',
        'e2e',
        'jest.config.json',
        '/home/user/workspace/e2e/jest.config.json',
      ],
      [
        'linux',
        'vitest config in integration subdirectory',
        'returns the config path from integration subdir',
        '/home/user/workspace',
        '/home/user/workspace/src/integration.test.ts',
        'integration',
        'vitest.config.js',
        '/home/user/workspace/integration/vitest.config.js',
      ],
      [
        'windows',
        'jest config in test subdirectory',
        'returns the config path from test subdir',
        'C:\\workspace',
        'C:\\workspace\\src\\index.test.js',
        'test',
        'jest.config.js',
        'C:/workspace/test/jest.config.js',
      ],
      [
        'windows',
        'vitest config in __tests__ subdirectory',
        'returns the config path from __tests__ subdir',
        'C:\\workspace',
        'C:\\workspace\\src\\index.spec.ts',
        '__tests__',
        'vitest.config.ts',
        'C:/workspace/__tests__/vitest.config.ts',
      ],
    ];

    describe.each(scenarios)(
      '%s: %s',
      (
        _os,
        _name,
        behavior,
        workspacePath,
        openedFilePath,
        subdirName,
        configFileName,
        expectedConfigPath,
      ) => {
        let jestRunnerConfig: TestRunnerConfig;
        let activeTextEditorSpy: jest.SpyInstance;

        beforeEach(() => {
          jestRunnerConfig = new TestRunnerConfig();
          jest
            .spyOn(vscode.workspace, 'getWorkspaceFolder')
            .mockReturnValue(
              new WorkspaceFolder(new Uri(workspacePath) as any) as any,
            );
          activeTextEditorSpy = jest
            .spyOn(vscode.window, 'activeTextEditor', 'get')
            .mockReturnValue(
              new TextEditor(new Document(new Uri(openedFilePath))) as any,
            );

          // Mock fs.existsSync to return true only for the expected config path
          jest
            .spyOn(fs, 'existsSync')
            .mockImplementation((filePath) => {
              return normalizePath(filePath as string) === normalizePath(expectedConfigPath);
            });

          // Mock fs.readdirSync for the subdirectory search
          const mockReaddirSync = jest.spyOn(fs, 'readdirSync') as jest.MockedFunction<typeof fs.readdirSync>;

          // Mock for all directories
          mockReaddirSync.mockImplementation((dirPath, options) => {
            const normalizedDir = normalizePath(dirPath as string);
            const normalizedWorkspace = normalizePath(workspacePath);
            const normalizedSubdir = normalizePath(path.join(workspacePath, subdirName));

            if (normalizedDir === normalizedWorkspace) {
              // Return directory entries for the workspace root
              return [
                { name: subdirName, isDirectory: () => true },
                { name: 'src', isDirectory: () => true },
                { name: 'node_modules', isDirectory: () => true },
              ] as any;
            }
            if (normalizedDir === normalizedSubdir) {
              // Return files in the subdirectory
              return [configFileName] as any;
            }
            // For src directory, return empty
            if (normalizedDir === normalizePath(path.dirname(openedFilePath))) {
              return [] as any;
            }
            return [] as any;
          });

          // Mock fs.statSync
          jest.spyOn(fs, 'statSync').mockImplementation((path): any => ({
            isDirectory: () => !openedFilePath.endsWith('.ts'),
          }));
        });

        its[_os](behavior, async () => {
          const result = jestRunnerConfig.findConfigPath(openedFilePath);
          expect(result).toBe(normalizePath(expectedConfigPath));
        });
      },
    );
  });

  describe('config not found in subdirectories', () => {
    it('returns undefined when no config in typical subdirs', () => {
      const jestRunnerConfig = new TestRunnerConfig();
      const workspacePath = '/home/user/workspace';
      const openedFilePath = '/home/user/workspace/src/index.test.js';

      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri(workspacePath) as any) as any,
        );

      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Mock readdirSync to return subdirs but no config files
      const mockReaddirSync = jest.spyOn(fs, 'readdirSync') as jest.MockedFunction<typeof fs.readdirSync>;
      mockReaddirSync.mockImplementation((dirPath, options) => {
        if (normalizePath(dirPath as string) === normalizePath(workspacePath)) {
          return [
            { name: 'test', isDirectory: () => true },
            { name: 'src', isDirectory: () => true },
          ] as any;
        }
        if (normalizePath(dirPath as string) === normalizePath(path.join(workspacePath, 'test'))) {
          return ['some-file.txt'] as any; // No config file
        }
        return [] as any;
      });

      jest.spyOn(fs, 'statSync').mockImplementation((path): any => ({
        isDirectory: () => true,
      }));

      const result = jestRunnerConfig.findConfigPath(openedFilePath);
      expect(result).toBeUndefined();
    });

    it('ignores non-typical subdirectories', () => {
      const jestRunnerConfig = new TestRunnerConfig();
      const workspacePath = '/home/user/workspace';
      const openedFilePath = '/home/user/workspace/src/index.test.js';

      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri(workspacePath) as any) as any,
        );

      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Mock readdirSync to return non-typical subdirs
      const mockReaddirSync = jest.spyOn(fs, 'readdirSync') as jest.MockedFunction<typeof fs.readdirSync>;
      mockReaddirSync.mockImplementation((dirPath, options) => {
        if (normalizePath(dirPath as string) === normalizePath(workspacePath)) {
          return [
            { name: 'custom-tests', isDirectory: () => true }, // Not in the typical list
            { name: 'src', isDirectory: () => true },
          ] as any;
        }
        return [] as any;
      });

      jest.spyOn(fs, 'statSync').mockImplementation((path): any => ({
        isDirectory: () => true,
      }));

      const result = jestRunnerConfig.findConfigPath(openedFilePath);
      expect(result).toBeUndefined();
    });
  });
});