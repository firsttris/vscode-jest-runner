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
        (_os, _name, behavior, workspacePath, projectPath, configPath, targetPath, expectedPath) => {
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
        ];
        describe.each(scenarios)(
          '%s: %s',
          (_os, _name, behavior, workspacePath, projectPath, configPath, targetPath, expectedPath) => {
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
              expect(jestRunnerConfig.findConfigPath()).toBe('');
            }
            expect(activeTextEditorSpy).toBeCalled();
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
              expect(jestRunnerConfig.findConfigPath(openedFilePath)).toBe('');
            }
          });
        },
      );
    });
  });
});
