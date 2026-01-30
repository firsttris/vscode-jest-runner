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
import * as fs from 'node:fs';
import * as moduleLib from 'node:module';
import * as frameworkDetection from '../testDetection/frameworkDetection';

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

describe('TestRunnerConfig', () => {
  describes.windows('Windows style paths', () => {
    let jestRunnerConfig: TestRunnerConfig;
    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('C:\\project') as any) as any,
        );
    });

    it.each([
      ['absolute path (with \\)', 'C:\\project\\jestProject'],
      ['absolute path (with /)', 'C:/project/jestProject'],
      ['relative path', './jestProject'],
    ])('%s', (_testName, projectPath) => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.projectPath': projectPath,
        }),
      );

      expect(jestRunnerConfig.cwd).toBe('C:\\project\\jestProject');
    });
  });

  describes.linux('Linux style paths', () => {
    let jestRunnerConfig: TestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('/home/user/project') as any) as any,
        );
    });

    it.each([
      ['absolute path', '/home/user/project/jestProject'],
      ['relative path', './jestProject'],
    ])('%s', (_testName, projectPath) => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.projectPath': projectPath,
        }),
      );

      expect(jestRunnerConfig.cwd).toBe('/home/user/project/jestProject');
    });
  });

  describe('currentPackagePath', () => {
    const scenarios: Array<
      [
        os: 'windows' | 'linux',
        name: string,
        behavior: string,
        workspacePath: string,
        openedFilePath: string,
        installedPath: string | undefined,
      ]
    > = [
        [
          'linux',
          'jest dep installed in same path as the opened file',
          'returns the folder path of the opened file',
          '/home/user/workspace',
          '/home/user/workspace/jestProject/index.test.js',
          '/home/user/workspace/jestProject',
        ],
        [
          'linux',
          'jest dep installed in parent path of the opened file',
          'returns the folder path of the parent of the opened file',
          '/home/user/workspace',
          '/home/user/workspace/jestProject/src/index.test.js',
          '/home/user/workspace/jestProject',
        ],
        [
          'linux',
          'jest dep installed in an ancestor path of the opened file',
          'returns the folder path of the ancestor of the opened file',
          '/home/user/workspace',
          '/home/user/workspace/jestProject/deeply/nested/package/src/index.test.js',
          '/home/user/workspace/jestProject',
        ],
        [
          'linux',
          'jest dep installed in the workspace of the opened file',
          "returns the folder path of the opened file's workspace",
          '/home/user/workspace',
          '/home/user/workspace/jestProject/deeply/nested/package/src/index.test.js',
          '/home/user/workspace',
        ],
        [
          'linux',
          'jest dep not installed',
          'returns empty string',
          '/home/user/workspace',
          '/home/user/workspace/jestProject/deeply/nested/package/src/index.test.js',
          undefined,
        ],
        [
          'windows',
          'jest dep installed in same path as the opened file',
          'returns the (normalized) folder path of the opened file',
          'C:\\workspace',
          'C:\\workspace\\jestProject\\src\\index.it.spec.js',
          'C:\\workspace\\jestProject\\src',
        ],
        [
          'windows',
          'jest dep installed in parent path of the opened file',
          'returns the (normalized) folder path of the parent of the opened file',
          'C:\\workspace',
          'C:\\workspace\\jestProject\\src\\index.it.spec.js',
          'C:\\workspace\\jestProject',
        ],
        [
          'windows',
          'jest dep installed in an ancestor path of the opened file',
          'returns the (normalized) folder path of the ancestor of the opened file',
          'C:\\workspace',
          'C:\\workspace\\jestProject\\deeply\\nested\\package\\src\\index.it.spec.js',
          'C:\\workspace\\jestProject',
        ],
        [
          'windows',
          'jest dep installed in the workspace of the opened file',
          "returns the (normalized) folder path of the opened file's workspace",
          'C:\\workspace',
          'C:\\workspace\\jestProject\\src\\index.it.spec.js',
          'C:\\workspace',
        ],
        [
          'windows',
          'jest dep not installed',
          'returns empty string',
          'C:\\workspace',
          'C:\\workspace\\jestProject\\src\\index.it.spec.js',
          undefined,
        ],
      ];

    describe.each(scenarios)(
      '%s: %s',
      (_os, _name, behavior, workspacePath, openedFilePath, installedPath) => {
        let jestRunnerConfig: TestRunnerConfig;

        beforeEach(() => {
          jestRunnerConfig = new TestRunnerConfig();
          jest
            .spyOn(vscode.workspace, 'getWorkspaceFolder')
            .mockReturnValue(
              new WorkspaceFolder(new Uri(workspacePath) as any) as any,
            );
          jest
            .spyOn(vscode.window, 'activeTextEditor', 'get')
            .mockReturnValue(
              new TextEditor(new Document(new Uri(openedFilePath))) as any,
            );
          jest.spyOn(fs, 'statSync').mockImplementation((): any => ({
            isDirectory: () => !openedFilePath.endsWith('.ts'),
          }));

          // Mock findTestFrameworkDirectory to return the installed path
          jest
            .spyOn(frameworkDetection, 'findTestFrameworkDirectory')
            .mockReturnValue(
              installedPath
                ? { directory: installedPath, framework: 'jest' as const }
                : undefined,
            );
        });

        its[_os](behavior, async () => {
          if (installedPath) {
            expect(jestRunnerConfig.currentPackagePath).toBe(
              normalizePath(installedPath),
            );
          } else {
            expect(jestRunnerConfig.currentPackagePath).toBe('');
          }
        });
      },
    );
  });

  describe('isCodeLensEnabled - backwards compatibility', () => {
    let jestRunnerConfig: TestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('/home/user/project') as any) as any,
        );
    });

    it('should return true by default when no settings are configured', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      expect(jestRunnerConfig.isCodeLensEnabled).toBe(true);
    });

    it('should respect enableCodeLens when set to false', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableCodeLens': false,
        }),
      );

      expect(jestRunnerConfig.isCodeLensEnabled).toBe(false);
    });

    it('should respect enableCodeLens when set to true', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableCodeLens': true,
        }),
      );

      expect(jestRunnerConfig.isCodeLensEnabled).toBe(true);
    });
  });

  describe('getAllPotentialSourceFiles', () => {
    let jestRunnerConfig: TestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
    });

    it('should return broad pattern for VS Code APIs', () => {
      expect(jestRunnerConfig.getAllPotentialSourceFiles()).toBe(
        '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
      );
    });
    describe('Command Generation', () => {
      let jestRunnerConfig: TestRunnerConfig;

      beforeEach(() => {
        jestRunnerConfig = new TestRunnerConfig();
        jest
          .spyOn(vscode.workspace, 'getWorkspaceFolder')
          .mockReturnValue(
            new WorkspaceFolder(new Uri('/home/user/project') as any) as any,
          );
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
          new WorkspaceConfiguration({})
        );

        const mockRequire = {
          resolve: jest.fn().mockImplementation((pkg: string) => {
            if (pkg === 'jest/bin/jest') {
              return '/home/user/project/node_modules/jest/bin/jest.js';
            }
            if (pkg === 'vitest/package.json') {
              return '/home/user/project/node_modules/vitest/package.json';
            }
            throw new Error(`Cannot find module '${pkg}'`);
          }),
        };
        jest.spyOn(moduleLib, 'createRequire').mockReturnValue(mockRequire as any);

        // Mock fs.readFileSync for vitest package.json
        const originalReadFileSync = fs.readFileSync;
        jest.spyOn(fs, 'readFileSync').mockImplementation((filePath: any, options?: any) => {
          if (String(filePath).includes('vitest/package.json')) {
            return JSON.stringify({ bin: { vitest: './vitest.mjs' } });
          }
          return originalReadFileSync(filePath, options);
        });
      });

      it('should prefix jest command with node when binary is resolved', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);

        const command = jestRunnerConfig.jestCommand;

        // Expect direct script execution with node prefix
        expect(command).toContain('node ');
        expect(command).toContain('jest.js');
      });

      it('should prefix vitest command with node when binary is resolved', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);

        const command = jestRunnerConfig.vitestCommand;

        expect(command).toContain('node ');
        expect(command).toContain('vitest.mjs');
      });

      it('should fallback to npx for jest if binary not found', () => {
        // Mock fail to find script
        jest.spyOn(fs, 'existsSync').mockReturnValue(false);

        const command = jestRunnerConfig.jestCommand;
        expect(command).toBe('npx --no-install jest');
      });
    });
  });
});
