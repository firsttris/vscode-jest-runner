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

describe('TestRunnerConfig', () => {
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
          let jestRunnerConfig: TestRunnerConfig;

          beforeEach(() => {
            jestRunnerConfig = new TestRunnerConfig();
            jest
              .spyOn(vscode.workspace, 'getWorkspaceFolder')
              .mockReturnValue(
                new WorkspaceFolder(new Uri(workspacePath) as any) as any,
              );
          });

          its[_os](behavior, async () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
              new WorkspaceConfiguration({
                'jestrunner.projectPath': projectPath,
                'jestrunner.configPath': configPath,
                'jestrunner.useNearestConfig': useNearestConfig,
              }),
            );

            expect(jestRunnerConfig.getJestConfigPath(targetPath)).toBe(
              expectedPath,
            );
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
            {
              '**/*.test.js': '/home/user/workspace/jestProject/jest.config.js',
            },
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
              '**/*.test.js':
                '/home/user/notWorkspace/notJestProject/jest.config.js',
              '**/*.spec.js':
                '/home/user/notWorkspace/notJestProject/jest.unit-config.js',
              '**/*.it.spec.js':
                '/home/user/notWorkspace/notJestProject/jest.it-config.js',
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
              '**/*.test.js':
                '/home/user/notWorkspace/notJestProject/jest.config.js',
              '**/*.spec.js':
                '/home/user/notWorkspace/notJestProject/jest.unit-config.js',
              '**/*.it.spec.js':
                '/home/user/notWorkspace/notJestProject/jest.it-config.js',
            },
            '/home/user/workspace/jestProject/src/index.it.spec.js',
            '/home/user/notWorkspace/notJestProject/jest.unit-config.js',
            true,
          ],
          [
            'windows',
            'matched glob specifies an absolute path (with \\)',
            'returned path is only the specified (normalized) config path',
            'C:/workspace',
            './jestProject',
            {
              '**/*.test.js':
                'C:\\notWorkspace\\notJestProject\\jest.config.js',
            },
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
              '**/*.test.js':
                'C:\\notWorkspace\\notJestProject\\jest.config.js',
              '**/*.spec.js':
                'C:\\notWorkspace\\notJestProject\\jest.unit-config.js',
              '**/*.it.spec.js':
                'C:\\notWorkspace\\notJestProject\\jest.it-config.js',
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
              '**/*.spec.js':
                'C:/notWorkspace/notJestProject/jest.unit-config.js',
              '**/*.it.spec.js':
                'C:/notWorkspace/notJestProject/jest.it-config.js',
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
              '**/*.spec.js':
                'C:/notWorkspace/notJestProject/jest.unit-config.js',
              '**/*.it.spec.js':
                'C:/notWorkspace/notJestProject/jest.it-config.js',
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
            let jestRunnerConfig: TestRunnerConfig;

            beforeEach(() => {
              jestRunnerConfig = new TestRunnerConfig();
              jest
                .spyOn(vscode.workspace, 'getWorkspaceFolder')
                .mockReturnValue(
                  new WorkspaceFolder(new Uri(workspacePath) as any) as any,
                );
              jest.spyOn(fs, 'statSync').mockImplementation((p): any => {
                if (
                  p === targetPath ||
                  normalizePath(p as string) === normalizePath(targetPath)
                ) {
                  return { isFile: () => true, isDirectory: () => false };
                }
                return { isFile: () => false, isDirectory: () => true };
              });
              jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
                return (
                  filePath === expectedPath ||
                  normalizePath(filePath as string) ===
                    normalizePath(expectedPath)
                );
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

              expect(jestRunnerConfig.getJestConfigPath(targetPath)).toBe(
                normalizePath(expectedPath),
              );
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
          (
            _os,
            _name,
            behavior,
            workspacePath,
            projectPath,
            configPath,
            targetPath,
            foundPath,
            expectedPath,
          ) => {
            let jestRunnerConfig: TestRunnerConfig;

            beforeEach(() => {
              jestRunnerConfig = new TestRunnerConfig();
              jest
                .spyOn(vscode.workspace, 'getWorkspaceFolder')
                .mockReturnValue(
                  new WorkspaceFolder(new Uri(workspacePath) as any) as any,
                );
              jest
                .spyOn(vscode.window, 'showWarningMessage')
                .mockReturnValue(undefined);
              jest
                .spyOn(fs, 'statSync')
                .mockImplementation((path: string): any => ({
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
              jest
                .spyOn(fs, 'existsSync')
                .mockImplementation((filePath) => filePath === foundPath);

              expect(jestRunnerConfig.getJestConfigPath(targetPath)).toBe(
                expectedPath,
              );
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
        (
          _os,
          _name,
          behavior,
          workspacePath,
          projectPath,
          targetPath,
          expectedPath,
        ) => {
          let jestRunnerConfig: TestRunnerConfig;

          beforeEach(() => {
            jestRunnerConfig = new TestRunnerConfig();
            jest
              .spyOn(vscode.workspace, 'getWorkspaceFolder')
              .mockReturnValue(
                new WorkspaceFolder(new Uri(workspacePath) as any) as any,
              );

            jest.spyOn(fs, 'statSync').mockImplementation((p): any => {
              if (
                p === targetPath ||
                normalizePath(p as string) === normalizePath(targetPath)
              ) {
                return { isFile: () => true, isDirectory: () => false };
              }
              return { isFile: () => false, isDirectory: () => true };
            });
            jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
              return (
                filePath === expectedPath ||
                normalizePath(filePath as string) ===
                  normalizePath(expectedPath)
              );
            });
          });

          its[_os](behavior, async () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
              new WorkspaceConfiguration({
                'jestrunner.projectPath': projectPath,
                'jestrunner.configPath': undefined,
              }),
            );

            expect(jestRunnerConfig.getJestConfigPath(targetPath)).toBe(
              expectedPath,
            );
          });
        },
      );
    });

    describe('custom config fallback to standard config', () => {
      it('should fallback to standard Jest config when custom config does not exist', () => {
        const jestRunnerConfig = new TestRunnerConfig();
        const workspacePath = path.resolve('/home/user/workspace');
        const targetPath = path.resolve('/home/user/workspace/src/test.spec.ts');
        const customConfigPath = 'jest.config.custom.js';
        const customConfigFullPath = normalizePath(path.resolve(workspacePath, customConfigPath));
        const standardConfigPath = normalizePath(path.resolve(workspacePath, 'jest.config.js'));

        jest
          .spyOn(vscode.workspace, 'getWorkspaceFolder')
          .mockReturnValue(
            new WorkspaceFolder(new Uri(workspacePath) as any) as any,
          );

        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
          new WorkspaceConfiguration({
            'jestrunner.configPath': customConfigPath,
          }),
        );

        jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          // Custom config doesn't exist, but standard config does
          return normalizePath(filePath as string) === normalizePath(standardConfigPath);
        });

        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(
          new TextEditor(new Document(new Uri(targetPath) as any)) as any,
        );

        const result = jestRunnerConfig.getJestConfigPath(targetPath);

        // Should return the standard config, not the custom one
        expect(result).toBe(normalizePath(standardConfigPath));
      });

      it('should use custom config when it exists', () => {
        const jestRunnerConfig = new TestRunnerConfig();
        const workspacePath = path.resolve('/home/user/workspace');
        const targetPath = path.resolve('/home/user/workspace/src/test.spec.ts');
        const customConfigPath = 'jest.config.custom.js';
        const customConfigFullPath = normalizePath(path.resolve(workspacePath, customConfigPath));

        jest
          .spyOn(vscode.workspace, 'getWorkspaceFolder')
          .mockReturnValue(
            new WorkspaceFolder(new Uri(workspacePath) as any) as any,
          );

        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
          new WorkspaceConfiguration({
            'jestrunner.configPath': customConfigPath,
          }),
        );

        jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          // Custom config exists
          return normalizePath(filePath as string) === normalizePath(customConfigFullPath);
        });

        const result = jestRunnerConfig.getJestConfigPath(targetPath);

        // Should use the custom config
        expect(result).toBe(normalizePath(customConfigFullPath));
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
        (
          _os,
          _name,
          behavior,
          workspacePath,
          openedFilePath,
          configPath,
          configFilename,
        ) => {
          let jestRunnerConfig: TestRunnerConfig;
          let configFilePath: string;
          let activeTextEditorSpy: jest.SpyInstance;

          beforeEach(() => {
            jestRunnerConfig = new TestRunnerConfig();
            configFilePath =
              configPath && configFilename
                ? path.resolve(configPath, configFilename)
                : '';
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
            jest
              .spyOn(fs, 'existsSync')
              .mockImplementation((filePath) => filePath === configFilePath);
            jest.spyOn(fs, 'statSync').mockImplementation((path): any => ({
              isDirectory: () => !openedFilePath.endsWith('.ts'),
            }));
          });

          its[_os](behavior, async () => {
            if (configPath) {
              expect(jestRunnerConfig.findConfigPath()).toBe(
                normalizePath(configFilePath),
              );
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
        (
          _os,
          _name,
          behavior,
          workspacePath,
          openedFilePath,
          configPath,
          configFilename,
        ) => {
          let jestRunnerConfig: TestRunnerConfig;
          let configFilePath: string;

          beforeEach(() => {
            jestRunnerConfig = new TestRunnerConfig();
            configFilePath =
              configPath && configFilename
                ? path.resolve(configPath, configFilename)
                : '';
            jest.spyOn(vscode.window, 'activeTextEditor', 'get');
            jest
              .spyOn(vscode.workspace, 'getWorkspaceFolder')
              .mockReturnValue(
                new WorkspaceFolder(new Uri(workspacePath) as any) as any,
              );
            jest
              .spyOn(fs, 'existsSync')
              .mockImplementation((filePath) => filePath === configFilePath);
            jest.spyOn(fs, 'statSync').mockImplementation((path): any => ({
              isDirectory: () => !openedFilePath.endsWith('.ts'),
            }));
          });

          its[_os](behavior, async () => {
            if (configPath) {
              expect(jestRunnerConfig.findConfigPath(openedFilePath)).toBe(
                normalizePath(configFilePath),
              );
            } else {
              expect(
                jestRunnerConfig.findConfigPath(openedFilePath),
              ).toBeUndefined();
            }
          });
        },
      );
    });
  });

  describe('getVitestConfigPath', () => {
    let jestRunnerConfig: TestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('/workspace') as any) as any,
        );
    });

    it('should return configured vitest config path', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.vitestConfigPath': 'vitest.config.ts',
        }),
      );
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      const configPath = jestRunnerConfig.getVitestConfigPath(
        '/workspace/test.spec.ts',
      );

      expect(configPath).toContain('vitest.config.ts');
    });

    it('should return empty string when no config is set', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const configPath = jestRunnerConfig.getVitestConfigPath(
        '/workspace/test.spec.ts',
      );

      expect(configPath).toBe('');
    });

    it('should fallback to standard Vitest config when custom config does not exist', () => {
      const workspacePath = path.resolve('/home/user/workspace');
      const targetPath = path.resolve('/home/user/workspace/src/test.spec.ts');
      const customConfigPath = 'vitest.config.custom.ts';
      const customConfigFullPath = normalizePath(path.resolve(workspacePath, customConfigPath));
      const standardConfigPath = normalizePath(path.resolve(workspacePath, 'vitest.config.ts'));

      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri(workspacePath) as any) as any,
        );

      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.vitestConfigPath': customConfigPath,
        }),
      );

      jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        // Custom config doesn't exist, but standard config does
        return normalizePath(filePath as string) === normalizePath(standardConfigPath);
      });

      jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(
        new TextEditor(new Document(new Uri(targetPath) as any)) as any,
      );

      const result = jestRunnerConfig.getVitestConfigPath(targetPath);

      // Should return the standard config, not the custom one
      expect(result).toBe(normalizePath(standardConfigPath));
    });

    it('should use custom Vitest config when it exists', () => {
      const workspacePath = path.resolve('/home/user/workspace');
      const targetPath = path.resolve('/home/user/workspace/src/test.spec.ts');
      const customConfigPath = 'vitest.config.custom.ts';
      const customConfigFullPath = normalizePath(path.resolve(workspacePath, customConfigPath));

      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri(workspacePath) as any) as any,
        );

      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.vitestConfigPath': customConfigPath,
        }),
      );

      jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        // Custom config exists
        return normalizePath(filePath as string) === normalizePath(customConfigFullPath);
      });

      const result = jestRunnerConfig.getVitestConfigPath(targetPath);

      // Should use the custom config
      expect(result).toBe(normalizePath(customConfigFullPath));
    });
  });
});
