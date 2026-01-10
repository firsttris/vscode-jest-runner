import * as vscode from 'vscode';
import { JestRunnerConfig } from '../jestRunnerConfig';
import { Document, TextEditor, Uri, WorkspaceConfiguration, WorkspaceFolder } from './__mocks__/vscode';
import { isWindows, normalizePath } from '../util';
import * as fs from 'fs';
import * as path from 'path';

const describes = {
  windows: isWindows() ? describe : describe.skip,
  linux: ['linux', 'darwin'].includes(process.platform) ? describe : describe.skip,
};

const its = {
  windows: isWindows() ? it : it.skip,
  linux: ['linux', 'darwin'].includes(process.platform) ? it : it.skip,
};

describe('JestRunnerConfig', () => {
  describes.windows('Windows style paths', () => {
    let jestRunnerConfig: JestRunnerConfig;
    beforeEach(() => {
      jestRunnerConfig = new JestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(new WorkspaceFolder(new Uri('C:\\project') as any) as any);
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
    let jestRunnerConfig: JestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new JestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(new WorkspaceFolder(new Uri('/home/user/project') as any) as any);
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

  describe('getJestConfigPath', () => {
    describe('configPath is a string', () => {
      const scenarios: Array<
        [
          os: 'windows' | 'linux',
          name: string,
          behavior: string,
          workspacePath: string,
          projectPath: string | undefined,
          configPath: string,
          targetPath: string,
          expectedPath: string,
        ]
      > = [
        [
          'linux',
          'configPath is an absolute path',
          'returned path is only the specified config path',
          '/home/user/workspace',
          './jestProject',
          '/home/user/notWorkspace/notJestProject/jest.config.js',
          '/home/user/workspace/jestProject/src/index.test.js',
          '/home/user/notWorkspace/notJestProject/jest.config.js',
        ],
        [
          'linux',
          'configPath is a relative path, project path is set',
          'returned path is resolved against workspace and project path',
          '/home/user/workspace',
          './jestProject',
          './jest.config.js',
          '/home/user/workspace/jestProject/src/index.test.js',
          '/home/user/workspace/jestProject/jest.config.js',
        ],
        [
          'linux',
          'configPath is a relative path, projectPath is not set',
          'returned path is resolved against workspace path',
          '/home/user/workspace',
          undefined,
          './jest.config.js',
          '/home/user/workspace/jestProject/src/index.test.js',
          '/home/user/workspace/jest.config.js',
        ],

        [
          'windows',
          'configPath is an absolute path (with \\)',
          'returned path is only the specified config path',
          'C:/workspace',
          './jestProject',
          'C:\\notWorkspace\\notJestProject\\jest.config.js',
          'C:/workspace/jestProject/src/index.test.js',
          'C:/notWorkspace/notJestProject/jest.config.js',
        ],
        [
          'windows',
          'configPath is an absolute path (with /)',
          'returned path is only the (normalized) specified config path',
          'C:/workspace',
          './jestProject',
          'C:/notWorkspace/notJestProject/jest.config.js',
          'C:/workspace/jestProject/src/index.test.js',
          'C:/notWorkspace/notJestProject/jest.config.js',
        ],
        [
          'windows',
          'configPath is a relative path, project path is set',
          'returned path is resolved against workspace and project path',
          'C:/workspace',
          './jestProject',
          './jest.config.js',
          'C:/workspace/jestProject/src/index.test.js',
          'C:/workspace/jestProject/jest.config.js',
        ],
        [
          'windows',
          'configPath is a relative path, projectPath is not set',
          'returned path is resolved against workspace path',
          'C:/workspace',
          undefined,
          './jest.config.js',
          'C:/workspace/jestProject/src/index.test.js',
          'C:/workspace/jest.config.js',
        ],
      ];
      describe.each(scenarios)(
        '%s: %s',
        (
          _os,
          _name,
          behavior,
          workspacePath,
          projectPath,
          configPath,
          targetPath,
          expectedPath,
          useNearestConfig = undefined,
        ) => {
          let jestRunnerConfig: JestRunnerConfig;

          beforeEach(() => {
            jestRunnerConfig = new JestRunnerConfig();
            jest
              .spyOn(vscode.workspace, 'getWorkspaceFolder')
              .mockReturnValue(new WorkspaceFolder(new Uri(workspacePath) as any) as any);
          });

          its[_os](behavior, async () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
              new WorkspaceConfiguration({
                'jestrunner.projectPath': projectPath,
                'jestrunner.configPath': configPath,
                'jestrunner.useNearestConfig': useNearestConfig,
              }),
            );

            expect(jestRunnerConfig.getJestConfigPath(targetPath)).toBe(expectedPath);
          });
        },
      );
    });
    describe('configPath is a glob map', () => {
      describe('there is a matching glob', () => {
        const scenarios: Array<
          [
            os: 'windows' | 'linux',
            name: string,
            behavior: string,
            workspacePath: string,
            projectPath: string | undefined,
            configPath: Record<string, string>,
            targetPath: string,
            expectedPath: string,
            useNearestConfig?: boolean,
          ]
        > = [
          [
            'linux',
            'matched glob specifies an absolute path',
            'returned path is only the specified config path',
            '/home/user/workspace',
            './jestProject',
            { '**/*.test.js': '/home/user/workspace/jestProject/jest.config.js' },
            '/home/user/workspace/jestProject/src/index.test.js',
            '/home/user/workspace/jestProject/jest.config.js',
          ],
          [
            'linux',
            'matched glob specifies a relative path',
            'returned path is resolved against workspace and project path',
            '/home/user/workspace',
            './jestProject',
            { '**/*.test.js': './jest.config.js' },
            '/home/user/workspace/jestProject/src/index.test.js',
            '/home/user/workspace/jestProject/jest.config.js',
          ],
          [
            'linux',
            'matched glob specifies a relative path, projectPath is not set',
            'returned path is resolved against workspace path',
            '/home/user/workspace',
            undefined,
            { '**/*.test.js': './jest.config.js' },
            '/home/user/workspace/jestProject/src/index.test.js',
            '/home/user/workspace/jest.config.js',
          ],
          [
            'linux',
            'matched glob specifies a relative path, useNearestConfig is true',
            'returned path is the nearest config in project',
            '/home/user/workspace',
            undefined,
            { '**/*.test.js': './jest.config.js' },
            '/home/user/workspace/jestProject/src/index.test.js',
            '/home/user/workspace/jestProject/jest.config.js',
            true,
          ],
          [
            'linux',
            'first matched glob takes precedence, relative path',
            'returned path is resolved against workspace and project path',
            '/home/user/workspace',
            './jestProject',
            {
              '**/*.test.js': './jest.config.js',
              '**/*.spec.js': './jest.unit-config.js',
              '**/*.it.spec.js': './jest.it-config.js',
            },
            '/home/user/workspace/jestProject/src/index.it.spec.js',
            '/home/user/workspace/jestProject/jest.unit-config.js',
          ],
          [
            'linux',
            'first matched glob takes precedence, relative path, useNearestConfig is true',
            'returned path is the nearest config in project',
            '/home/user/workspace',
            './aDifferentProject',
            {
              '**/*.test.js': './jest.config.js',
              '**/*.spec.js': './jest.unit-config.js',
              '**/*.it.spec.js': './jest.it-config.js',
            },
            '/home/user/workspace/jestProject/src/index.it.spec.js',
            '/home/user/workspace/jestProject/jest.unit-config.js',
            true,
          ],
          [
            'linux',
            'first matched glob takes precedence, absolute path',
            'returned path is only the specified config path',
            '/home/user/workspace',
            './jestProject',
            {
              '**/*.test.js': '/home/user/notWorkspace/notJestProject/jest.config.js',
              '**/*.spec.js': '/home/user/notWorkspace/notJestProject/jest.unit-config.js',
              '**/*.it.spec.js': '/home/user/notWorkspace/notJestProject/jest.it-config.js',
            },
            '/home/user/workspace/jestProject/src/index.it.spec.js',
            '/home/user/notWorkspace/notJestProject/jest.unit-config.js',
          ],
          [
            'linux',
            'first matched glob takes precedence, useNearestConfig falls back to absolute path',
            'returned path is only the specified config path',
            '/home/user/workspace',
            './jestProject',
            {
              '**/*.test.js': '/home/user/notWorkspace/notJestProject/jest.config.js',
              '**/*.spec.js': '/home/user/notWorkspace/notJestProject/jest.unit-config.js',
              '**/*.it.spec.js': '/home/user/notWorkspace/notJestProject/jest.it-config.js',
            },
            '/home/user/workspace/jestProject/src/index.it.spec.js',
            '/home/user/notWorkspace/notJestProject/jest.unit-config.js',
            true,
          ],
          // windows
          [
            'windows',
            'matched glob specifies an absolute path (with \\)',
            'returned path is only the specified (normalized) config path',
            'C:/workspace',
            './jestProject',
            { '**/*.test.js': 'C:\\notWorkspace\\notJestProject\\jest.config.js' },
            'C:/workspace/jestProject/src/index.test.js',
            'C:/notWorkspace/notJestProject/jest.config.js',
          ],
          [
            'windows',
            'matched glob specifies an absolute path (with /)',
            'returned path is only the specified (normalized) config path',
            'C:/workspace',
            './jestProject',
            { '**/*.test.js': 'C:/notWorkspace/notJestProject/jest.config.js' },
            'C:/workspace/jestProject/src/index.test.js',
            'C:/notWorkspace/notJestProject/jest.config.js',
          ],
          [
            'windows',
            'matched glob specifies a relative path, projectPath is set',
            'returned (normalized) path is resolved against workspace and project path',
            'C:/workspace',
            './jestProject',
            { '**/*.test.js': './jest.config.js' },
            'C:/workspace/jestProject/src/index.test.js',
            'C:/workspace/jestProject/jest.config.js',
          ],
          [
            'windows',
            'matched glob specifies a relative path, projectPath is not set',
            'returned (normalized) path is resolved against workspace path',
            'C:/workspace',
            undefined,
            { '**/*.test.js': './jest.config.js' },
            'C:/workspace/jestProject/src/index.test.js',
            'C:/workspace/jest.config.js',
          ],
          [
            'windows',
            'matched glob specifies a relative path, useNearestConfig is true',
            'returned path is the nearest config in project',
            'C:/workspace',
            undefined,
            { '**/*.test.js': './jest.config.js' },
            'C:/workspace/jestProject/src/index.test.js',
            'C:/workspace/jestProject/jest.config.js',
            true,
          ],
          [
            'windows',
            'first matched glob takes precedence, relative path',
            'returned(normalized) path is resolved against workspace and project path',
            'C:\\workspace',
            './jestProject',
            {
              '**/*.test.js': './jest.config.js',
              '**/*.spec.js': './jest.unit-config.js',
              '**/*.it.spec.js': './jest.it-config.js',
            },
            'C:/workspace/jestProject/src/index.it.spec.js',
            'C:/workspace/jestProject/jest.unit-config.js',
          ],
          [
            'windows',
            'first matched glob takes precedence, relative path, useNearestConfig is true',
            'returned path is the nearest config in project',
            'C:/workspace',
            './aDifferentProject',
            {
              '**/*.test.js': './jest.config.js',
              '**/*.spec.js': './jest.unit-config.js',
              '**/*.it.spec.js': './jest.it-config.js',
            },
            'C:/workspace/jestProject/src/index.it.spec.js',
            'C:/workspace/jestProject/jest.unit-config.js',
            true,
          ],
          [
            'windows',
            'first matched glob takes precedence, absolute path (with \\)',
            'returned (normalized) path is only the (normalized) specified config path',
            'C:/workspace',
            './jestProject',
            {
              '**/*.test.js': 'C:\\notWorkspace\\notJestProject\\jest.config.js',
              '**/*.spec.js': 'C:\\notWorkspace\\notJestProject\\jest.unit-config.js',
              '**/*.it.spec.js': 'C:\\notWorkspace\\notJestProject\\jest.it-config.js',
            },
            'C:/workspace/jestProject/src/index.it.spec.js',
            'C:/notWorkspace/notJestProject/jest.unit-config.js',
          ],
          [
            'windows',
            'first matched glob takes precedence, absolute path (with /)',
            'returned (normalized) path is only the specified config path',
            'C:/workspace',
            './jestProject',
            {
              '**/*.test.js': 'C:/notWorkspace/notJestProject/jest.config.js',
              '**/*.spec.js': 'C:/notWorkspace/notJestProject/jest.unit-config.js',
              '**/*.it.spec.js': 'C:/notWorkspace/notJestProject/jest.it-config.js',
            },
            'C:/workspace/jestProject/src/index.it.spec.js',
            'C:/notWorkspace/notJestProject/jest.unit-config.js',
          ],
          [
            'windows',
            'first matched glob takes precedence, useNearestConfig falls back to absolute path',
            'returned path is only the specified config path',
            'C:/workspace',
            './jestProject',
            {
              '**/*.test.js': 'C:/notWorkspace/notJestProject/jest.config.js',
              '**/*.spec.js': 'C:/notWorkspace/notJestProject/jest.unit-config.js',
              '**/*.it.spec.js': 'C:/notWorkspace/notJestProject/jest.it-config.js',
            },
            'C:/workspace/jestProject/src/index.it.spec.js',
            'C:/notWorkspace/notJestProject/jest.unit-config.js',
            true,
          ],
        ];
        describe.each(scenarios)(
          '%s: %s',
          (
            _os,
            _name,
            behavior,
            workspacePath,
            projectPath,
            configPath,
            targetPath,
            expectedPath,
            useNearestConfig = undefined,
          ) => {
            let jestRunnerConfig: JestRunnerConfig;

            beforeEach(() => {
              jestRunnerConfig = new JestRunnerConfig();
              jest
                .spyOn(vscode.workspace, 'getWorkspaceFolder')
                .mockReturnValue(new WorkspaceFolder(new Uri(workspacePath) as any) as any);
              jest.spyOn(fs, 'statSync').mockImplementation((p): any => {
                // Check both normalized and non-normalized paths
                if (p === targetPath || normalizePath(p as string) === normalizePath(targetPath)) {
                  return { isFile: () => true, isDirectory: () => false };
                }
                return { isFile: () => false, isDirectory: () => true };
              });
              // Return true if getJestConfigPath is checking the expected path (check both normalized and non-normalized)
              jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
                return filePath === expectedPath || normalizePath(filePath as string) === normalizePath(expectedPath);
              });
            });

            its[_os](behavior, async () => {
              jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                  'jestrunner.projectPath': projectPath,
                  'jestrunner.configPath': configPath,
                  'jestrunner.useNearestConfig': useNearestConfig,
                }),
              );

              expect(jestRunnerConfig.getJestConfigPath(targetPath)).toBe(normalizePath(expectedPath));
            });
          },
        );
      });

      describe('no matching glob', () => {
        const scenarios: Array<
          [
            os: 'windows' | 'linux',
            name: string,
            behavior: string,
            workspacePath: string,
            projectPath: string | undefined,
            configPath: Record<string, string>,
            targetPath: string,
            foundPath: string,
            expectedPath: string,
          ]
        > = [
          [
            'linux',
            'projectPath is relative',
            'returns the found jest config path (traversing up from target path)',
            '/home/user/workspace',
            './jestProject',
            {
              '**/*.test.js': './jest.config.js',
            },
            '/home/user/workspace/jestProject/src/index.unit.spec.js',
            '/home/user/workspace/jestProject/jest.config.mjs',
            '/home/user/workspace/jestProject/jest.config.mjs',
          ],
          [
            'linux',
            'projectPath is not set',
            'returns the found jest config path (traversing up from target path)',
            '/home/user/workspace',
            undefined,
            {
              '**/*.test.js': './jest.config.js',
            },
            '/home/user/workspace/src/index.unit.spec.js',
            '/home/user/workspace/jest.config.mjs',
            '/home/user/workspace/jest.config.mjs',
          ],
          // windows
          [
            'windows',
            'projectPath is relative',
            'returns the (normalized) found jest config (traversing up from target path)',
            'C:\\workspace',
            './jestProject',
            {
              '**/*.test.js': 'C:/notWorkspace/notJestProject/jest.config.js',
            },
            'C:\\workspace\\jestProject\\src\\index.it.spec.js',
            'C:\\workspace\\jestProject\\jest.config.mjs',
            'C:/workspace/jestProject/jest.config.mjs',
          ],
          [
            'windows',
            'projectPath is not set',
            'returns the (normalized) found jest config path (traversing up from target path)',
            'C:\\workspace',
            undefined,
            {
              '**/*.test.js': 'C:/notWorkspace/notJestProject/jest.config.js',
            },
            'C:\\workspace\\src\\index.it.spec.js',
            'C:\\workspace\\jest.config.mjs',
            'C:/workspace/jest.config.mjs',
          ],
        ];
        describe.each(scenarios)(
          '%s: %s',
          (_os, _name, behavior, workspacePath, projectPath, configPath, targetPath, foundPath, expectedPath) => {
            let jestRunnerConfig: JestRunnerConfig;

            beforeEach(() => {
              jestRunnerConfig = new JestRunnerConfig();
              jest
                .spyOn(vscode.workspace, 'getWorkspaceFolder')
                .mockReturnValue(new WorkspaceFolder(new Uri(workspacePath) as any) as any);
              jest.spyOn(vscode.window, 'showWarningMessage').mockReturnValue(undefined);
              jest.spyOn(fs, 'statSync').mockImplementation((path: string): any => ({
                isDirectory: () => /\.[a-z]{2,4}$/.test(path),
              }));
            });

            its[_os](behavior, async () => {
              jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
                new WorkspaceConfiguration({
                  'jestrunner.projectPath': projectPath,
                  'jestrunner.configPath': configPath,
                }),
              );
              jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => filePath === foundPath);

              expect(jestRunnerConfig.getJestConfigPath(targetPath)).toBe(expectedPath);
            });
          },
        );
      });
    });
    describe('configPath is not set', () => {
      const scenarios: Array<
        [
          os: 'windows' | 'linux',
          name: string,
          behavior: string,
          workspacePath: string,
          projectPath: string | undefined,
          targetPath: string,
          expectedPath: string,
        ]
      > = [
        [
          'linux',
          'without project path',
          'returns the found jest config path (traversing up from target path)',
          '/home/user/workspace',
          undefined,
          '/home/user/workspace/jestProject/src/index.unit.spec.js',
          '/home/user/workspace/jestProject/jest.config.mjs',
        ],
        [
          'linux',
          'with projectPath defined',
          'returns the found jest config path (traversing up from target path)',
          '/home/user/workspace',
          './anotherProject',
          '/home/user/workspace/jestProject/src/index.unit.spec.js',
          '/home/user/workspace/jestProject/jest.config.mjs',
        ],
        [
          'linux',
          'with projectPath defined and no config in project',
          'returns the found jest config path in workspace (traversing up from target path)',
          '/home/user/workspace',
          './anotherProject',
          '/home/user/workspace/anotherProject/src/index.unit.spec.js',
          '/home/user/workspace/jest.config.mjs',
        ],
        [
          'linux',
          'with no configs found',
          'returns an empty string',
          '/home/user/workspace',
          './anotherProject',
          '/home/user/workspace/anotherProject/src/index.unit.spec.js',
          '',
        ],
        // windows
        [
          'windows',
          'without project path',
          'returns the found jest config path (traversing up from target path)',
          'C:\\workspace',
          undefined,
          'C:\\workspace\\jestProject\\src\\index.unit.spec.js',
          'C:/workspace/jestProject/jest.config.mjs',
        ],
        [
          'windows',
          'with projectPath defined',
          'returns the found jest config path (traversing up from target path)',
          'C:\\workspace',
          './anotherProject',
          'C:\\workspace\\jestProject\\src\\index.unit.spec.js',
          'C:/workspace/jestProject/jest.config.mjs',
        ],
        [
          'windows',
          'with projectPath defined and no config in project',
          'returns the found jest config path in workspace (traversing up from target path)',
          'C:\\workspace',
          './anotherProject',
          'C:\\workspace\\anotherProject\\src\\index.unit.spec.js',
          'C:/workspace/jest.config.mjs',
        ],
        [
          'windows',
          'with no configs found',
          'returns an empty string',
          'C:\\workspace',
          './anotherProject',
          'C:\\workspace\\anotherProject\\src\\index.unit.spec.js',
          '',
        ],
      ];
      describe.each(scenarios)(
        '%s: %s',
        (_os, _name, behavior, workspacePath, projectPath, targetPath, expectedPath) => {
          let jestRunnerConfig: JestRunnerConfig;

          beforeEach(() => {
            jestRunnerConfig = new JestRunnerConfig();
            jest
              .spyOn(vscode.workspace, 'getWorkspaceFolder')
              .mockReturnValue(new WorkspaceFolder(new Uri(workspacePath) as any) as any);

            jest.spyOn(fs, 'statSync').mockImplementation((p): any => {
              // Check both normalized and non-normalized paths
              if (p === targetPath || normalizePath(p as string) === normalizePath(targetPath)) {
                return { isFile: () => true, isDirectory: () => false };
              }
              return { isFile: () => false, isDirectory: () => true };
            });
            // Return true if getJestConfigPath is checking the expected path (check both normalized and non-normalized)
            jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
              return filePath === expectedPath || normalizePath(filePath as string) === normalizePath(expectedPath);
            });
          });

          its[_os](behavior, async () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
              new WorkspaceConfiguration({
                'jestrunner.projectPath': projectPath,
                'jestrunner.configPath': undefined,
              }),
            );

            expect(jestRunnerConfig.getJestConfigPath(targetPath)).toBe(expectedPath);
          });
        },
      );
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
      // windows
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

    describe.each(scenarios)('%s: %s', (_os, _name, behavior, workspacePath, openedFilePath, installedPath) => {
      let jestRunnerConfig: JestRunnerConfig;
      let packagePath: string;
      let modulePath: string;

      beforeEach(() => {
        jestRunnerConfig = new JestRunnerConfig();
        packagePath = installedPath ? path.resolve(installedPath, 'package.json') : '';
        modulePath = installedPath ? path.resolve(installedPath, 'node_modules', 'jest') : '';
        jest
          .spyOn(vscode.workspace, 'getWorkspaceFolder')
          .mockReturnValue(new WorkspaceFolder(new Uri(workspacePath) as any) as any);
        jest
          .spyOn(vscode.window, 'activeTextEditor', 'get')
          .mockReturnValue(new TextEditor(new Document(new Uri(openedFilePath))) as any);
        jest.spyOn(fs, 'statSync').mockImplementation((path): any => ({
          isDirectory: () => !openedFilePath.endsWith('.ts'),
        }));
        jest
          .spyOn(fs, 'existsSync')
          .mockImplementation((filePath) => filePath === packagePath || filePath === modulePath);
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
          new WorkspaceConfiguration({
            'jestrunner.checkRelativePathForJest': false,
          }),
        );
      });

      its[_os](behavior, async () => {
        if (installedPath) {
          expect(jestRunnerConfig.currentPackagePath).toBe(normalizePath(installedPath));
        } else {
          expect(jestRunnerConfig.currentPackagePath).toBe('');
        }
      });

      describe('checkRelativePathForJest is set to true', () => {
        beforeEach(() => {
          jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
            new WorkspaceConfiguration({
              'jestrunner.checkRelativePathForJest': true,
            }),
          );
        });

        its[_os](behavior, async () => {
          if (installedPath) {
            expect(jestRunnerConfig.currentPackagePath).toBe(normalizePath(installedPath));
          } else {
            expect(jestRunnerConfig.currentPackagePath).toBe('');
          }
        });
      });
    });
  });
  describe('findConfigPath', () => {
    const scenarios: Array<
      [
        os: 'windows' | 'linux',
        name: string,
        behavior: string,
        workspacePath: string,
        openedFilePath: string,
        configPath: string | undefined,
        configFileName: string | undefined,
      ]
    > = [
      [
        'linux',
        'jest config located in same path as the opened file',
        'returns the filename path of the found config file',
        '/home/user/workspace',
        '/home/user/workspace/jestProject/index.test.js',
        '/home/user/workspace/jestProject',
        'jest.config.cjs',
      ],
      [
        'linux',
        'jest config located in parent path of the opened file',
        'returns the filename path of the found config file',
        '/home/user/workspace',
        '/home/user/workspace/jestProject/src/index.test.js',
        '/home/user/workspace/jestProject',
        'jest.config.json',
      ],
      [
        'linux',
        'jest config located in an ancestor path of the opened file',
        'returns the filename path of the found config file',
        '/home/user/workspace',
        '/home/user/workspace/jestProject/deeply/nested/package/src/index.test.js',
        '/home/user/workspace/jestProject',
        'jest.config.js',
      ],
      [
        'linux',
        'jest config located in the workspace of the opened file',
        'returns the filename path of the found config file',
        '/home/user/workspace',
        '/home/user/workspace/jestProject/deeply/nested/package/src/index.test.js',
        '/home/user/workspace',
        'jest.config.ts',
      ],
      [
        'linux',
        'jest config not located',
        'returns empty string',
        '/home/user/workspace',
        '/home/user/workspace/jestProject/deeply/nested/package/src/index.test.js',
        undefined,
        undefined,
      ],
      // windows
      [
        'windows',
        'jest config located in same path as the opened file',
        'returns the (normalized) folder path of the opened file',
        'C:\\workspace',
        'C:\\workspace\\jestProject\\src\\index.it.spec.js',
        'C:\\workspace\\jestProject\\src',
        'jest.config.cjs',
      ],
      [
        'windows',
        'jest config located in parent path of the opened file',
        'returns the (normalized) folder path of the parent of the opened file',
        'C:\\workspace',
        'C:\\workspace\\jestProject\\src\\index.it.spec.js',
        'C:\\workspace\\jestProject',
        'jest.config.json',
      ],
      [
        'windows',
        'jest config located in an ancestor path of the opened file',
        'returns the (normalized) folder path of the ancestor of the opened file',
        'C:\\workspace',
        'C:\\workspace\\jestProject\\deeply\\nested\\package\\src\\index.it.spec.js',
        'C:\\workspace\\jestProject',
        'jest.config.js',
      ],
      [
        'windows',
        'jest config located in the workspace of the opened file',
        "returns the (normalized) folder path of the opened file's workspace",
        'C:\\workspace',
        'C:\\workspace\\jestProject\\src\\index.it.spec.js',
        'C:\\workspace',
        'jest.config.ts',
      ],
      [
        'windows',
        'jest config not located',
        'returns empty string',
        'C:\\workspace',
        'C:\\workspace\\jestProject\\src\\index.it.spec.js',
        undefined,
        undefined,
      ],
    ];

    describe('targetPath is not provided', () => {
      describe.each(scenarios)(
        '%s: %s',
        (_os, _name, behavior, workspacePath, openedFilePath, configPath, configFilename) => {
          let jestRunnerConfig: JestRunnerConfig;
          let configFilePath: string;
          let activeTextEditorSpy: jest.SpyInstance;

          beforeEach(() => {
            jestRunnerConfig = new JestRunnerConfig();
            configFilePath = configPath && configFilename ? path.resolve(configPath, configFilename) : '';
            jest
              .spyOn(vscode.workspace, 'getWorkspaceFolder')
              .mockReturnValue(new WorkspaceFolder(new Uri(workspacePath) as any) as any);
            activeTextEditorSpy = jest
              .spyOn(vscode.window, 'activeTextEditor', 'get')
              .mockReturnValue(new TextEditor(new Document(new Uri(openedFilePath))) as any);
            jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => filePath === configFilePath);
            jest.spyOn(fs, 'statSync').mockImplementation((path): any => ({
              isDirectory: () => !openedFilePath.endsWith('.ts'),
            }));
          });

          its[_os](behavior, async () => {
            if (configPath) {
              expect(jestRunnerConfig.findConfigPath()).toBe(normalizePath(configFilePath));
            } else {
              expect(jestRunnerConfig.findConfigPath()).toBeUndefined();
            }
            expect(activeTextEditorSpy).toHaveBeenCalled();
          });
        },
      );
    });
    describe('targetPath is provided', () => {
      describe.each(scenarios)(
        '%s: %s',
        (_os, _name, behavior, workspacePath, openedFilePath, configPath, configFilename) => {
          let jestRunnerConfig: JestRunnerConfig;
          let configFilePath: string;

          beforeEach(() => {
            jestRunnerConfig = new JestRunnerConfig();
            configFilePath = configPath && configFilename ? path.resolve(configPath, configFilename) : '';
            jest.spyOn(vscode.window, 'activeTextEditor', 'get');
            jest
              .spyOn(vscode.workspace, 'getWorkspaceFolder')
              .mockReturnValue(new WorkspaceFolder(new Uri(workspacePath) as any) as any);
            jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => filePath === configFilePath);
            jest.spyOn(fs, 'statSync').mockImplementation((path): any => ({
              isDirectory: () => !openedFilePath.endsWith('.ts'),
            }));
          });

          its[_os](behavior, async () => {
            if (configPath) {
              expect(jestRunnerConfig.findConfigPath(openedFilePath)).toBe(normalizePath(configFilePath));
            } else {
              expect(jestRunnerConfig.findConfigPath(openedFilePath)).toBeUndefined();
            }
          });
        },
      );
    });
  });

  describe('buildJestArgs', () => {
    let jestRunnerConfig: JestRunnerConfig;
    const mockFilePath = '/home/user/project/src/test.spec.ts';

    beforeEach(() => {
      jestRunnerConfig = new JestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(new WorkspaceFolder(new Uri('/home/user/project') as any) as any);
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(
        new TextEditor(new Document(new Uri(mockFilePath) as any)) as any,
      );
    });

    it('should build args with file path only', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, undefined, false);

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

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, 'my test name', false);

      expect(args[0]).toBe('/home/user/project/src/test\\.spec\\.ts');
      expect(args).toContain('-t');
      expect(args).toContain('my test name');
    });

    it('should escape single quotes in test name when withQuotes is true', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, "test's name", true);

      const testNameIndex = args.indexOf('-t') + 1;
      // On Windows, we use double quotes and don't escape single quotes
      // On Unix, we use single quotes and escape them
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

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, 'test with %s placeholder', false);

      const testNameIndex = args.indexOf('-t') + 1;
      expect(args[testNameIndex]).not.toContain('%s');
    });

    it('should include config path when available', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': './jest.config.js',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, undefined, false);

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

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, undefined, true);

      // File path should be quoted
      expect(args[0]).toMatch(/^["'].*["']$/);
    });

    it('should include additional options', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.configPath': '',
        }),
      );

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, undefined, false, ['--verbose', '--coverage']);

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

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, undefined, false);

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

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, undefined, false, ['--verbose', '--coverage']);

      // Count occurrences of --verbose
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

      const args = jestRunnerConfig.buildJestArgs(mockFilePath, 'complete test', true, ['--coverage']);

      expect(args[0]).toMatch(/^["'].*test\\\.spec\\\.ts["']$/);
      expect(args).toContain('-c');
      expect(args).toContain('-t');
      expect(args).toContain('--silent');
      expect(args).toContain('--coverage');
    });
  });

  describe('getDebugConfiguration', () => {
    let jestRunnerConfig: JestRunnerConfig;
    const mockFilePath = '/home/user/project/src/test.spec.ts';

    beforeEach(() => {
      jestRunnerConfig = new JestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(new WorkspaceFolder(new Uri('/home/user/project') as any) as any);
      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(
        new TextEditor(new Document(new Uri(mockFilePath) as any)) as any,
      );
    });

    it('should return default debug configuration', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(new WorkspaceConfiguration({}));

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config).toMatchObject({
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
        name: 'Debug Jest Tests',
        request: 'launch',
        type: 'node',
        runtimeExecutable: 'npx',
        cwd: '/home/user/project',
        args: ['--no-install', 'jest', '--runInBand'],
      });
    });

    it('should configure for Yarn PnP when enabled', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableYarnPnpSupport': true,
          'jestrunner.yarnPnpCommand': 'yarn-3.2.0.cjs',
        }),
      );

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBe('.yarn/releases/yarn-3.2.0.cjs');
      expect(config.args).toEqual(['jest']);
    });

    it('should parse custom jest command', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.jestCommand': 'node ./node_modules/jest/bin/jest.js',
        }),
      );

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBe('node');
      expect(config.args).toEqual(['./node_modules/jest/bin/jest.js']);
    });

    it('should parse custom jest command with quoted arguments', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.jestCommand': 'node "node_modules/.bin/jest" --config="jest.config.js"',
        }),
      );

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBe('node');
      expect(config.args).toEqual(['node_modules/.bin/jest', '--config=jest.config.js']);
    });

    it('should merge custom debugOptions', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.debugOptions': {
            env: { NODE_ENV: 'test' },
            sourceMaps: true,
          },
        }),
      );

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.env).toEqual({ NODE_ENV: 'test' });
      expect(config.sourceMaps).toBe(true);
      expect(config.name).toBe('Debug Jest Tests'); // Original properties preserved
    });

    it('should use projectPath as cwd when configured', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.projectPath': './packages/app',
        }),
      );

      const config = jestRunnerConfig.getDebugConfiguration();

      // On Windows, the path gets converted to Windows-style
      const expectedPath = isWindows()
        ? path.resolve('/home/user/project/packages/app').replace(/\//g, '\\')
        : '/home/user/project/packages/app';
      expect(config.cwd).toBe(expectedPath);
    });

    it('should prioritize Yarn PnP over custom jest command', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableYarnPnpSupport': true,
          'jestrunner.yarnPnpCommand': 'yarn-3.2.0.cjs',
          'jestrunner.jestCommand': 'node ./custom-jest.js',
        }),
      );

      const config = jestRunnerConfig.getDebugConfiguration();

      // Should use Yarn PnP config, not custom command
      expect(config.program).toBe('.yarn/releases/yarn-3.2.0.cjs');
      expect(config.args).toEqual(['jest']);
    });
  });

  describe('isCodeLensEnabled - backwards compatibility', () => {
    let jestRunnerConfig: JestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new JestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(new WorkspaceFolder(new Uri('/home/user/project') as any) as any);
    });

    it('should return true by default when no settings are configured', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({}),
      );

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

    it('should support old disableCodeLens setting (set to true)', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.disableCodeLens': true,
        }),
      );

      // disableCodeLens: true means CodeLens should be disabled (return false)
      expect(jestRunnerConfig.isCodeLensEnabled).toBe(false);
    });

    it('should support old disableCodeLens setting (set to false)', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.disableCodeLens': false,
        }),
      );

      // disableCodeLens: false means CodeLens should be enabled (return true)
      expect(jestRunnerConfig.isCodeLensEnabled).toBe(true);
    });

    it('should prioritize disableCodeLens over enableCodeLens for backwards compatibility', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.disableCodeLens': true,
          'jestrunner.enableCodeLens': true, // This should be ignored
        }),
      );

      // Old setting takes precedence
      expect(jestRunnerConfig.isCodeLensEnabled).toBe(false);
    });
  });
});
