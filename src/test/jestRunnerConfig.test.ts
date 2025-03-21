import * as vscode from 'vscode';
import { JestRunnerConfig } from '../jestRunnerConfig';
import { Uri, WorkspaceConfiguration, WorkspaceFolder } from './__mocks__/vscode';
import { isWindows } from '../util';
import * as fs from 'fs';

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
          'C:\\workspace',
          './jestProject',
          'C:\\notWorkspace\\notJestProject\\jest.config.js',
          'C:\\workspace\\jestProject\\src\\index.test.js',
          'C:\\notWorkspace\\notJestProject\\jest.config.js',
        ],
        [
          'windows',
          'configPath is an absolute path (with /)',
          'returned path is only the (normalized) specified config path',
          'C:\\workspace',
          './jestProject',
          'C:/notWorkspace/jestProject/jest.config.js',
          'C:\\workspace\\jestProject\\src\\index.test.js',
          'C:\\notWorkspace\\notJestProject\\jest.config.js',
        ],
        [
          'windows',
          'configPath is a relative path, project path is set',
          'returned path is resolved against workspace and project path',
          'C:\\workspace',
          './jestProject',
          './jest.config.js',
          'C:\\workspace\\jestProject\\src\\index.test.js',
          'C:\\workspace\\jestProject\\jest.config.js',
        ],
        [
          'windows',
          'configPath is a relative path, projectPath is not set',
          'returned path is resolved against workspace path',
          'C:\\workspace',
          undefined,
          './jest.config.js',
          'C:\\workspace\\jestProject\\src\\index.test.js',
          'C:\\workspace\\jest.config.js',
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
            'C:\\workspace',
            './jestProject',
            { '**/*.test.js': 'C:\\notWorkspace\\notJestProject\\jest.config.js' },
            'C:\\workspace\\jestProject\\src\\index.test.js',
            'C:/notWorkspace/notJestProject/jest.config.js',
          ],
          [
            'windows',
            'matched glob specifies an absolute path (with /)',
            'returned path is only the specified config path',
            'C:\\workspace',
            './jestProject',
            { '**/*.test.js': 'C:/notWorkspace/notJestProject/jest.config.js' },
            'C:\\workspace\\jestProject\\src\\index.test.js',
            'C:/notWorkspace/notJestProject/jest.config.js',
          ],
          [
            'windows',
            'matched glob specifies a relative path, projectPath is set',
            'returned path is resolved against workspace and project path',
            'C:\\workspace',
            './jestProject',
            { '**/*.test.js': '/jest.config.js' },
            'C:\\workspace\\jestProject\\src\\index.test.js',
            'C:/workspace/jestProject/jest.config.js',
          ],
          [
            'windows',
            'matched glob specifies a relative path, projectPath is not set',
            'returned path is resolved against workspace path',
            'C:\\workspace',
            undefined,
            { '**/*.test.js': '/jest.config.js' },
            'C:\\workspace\\jestProject\\src\\index.test.js',
            'C:/workspace/jest.config.js',
          ],
          [
            'windows',
            'first matched glob takes precedence, relative path',
            'returned path is resolved against workspace and project path',
            'C:\\workspace',
            './jestProject',
            {
              '**/*.test.js': '/jest.config.js',
              '**/*.spec.js': '/jest.unit-config.js',
              '**/*.it.spec.js': '/jest.it-config.js',
            },
            'C:\\workspace\\jestProject\\src\\index.it.spec.js',
            'C:/workspace/jestProject/jest.unit-config.js',
          ],
          [
            'windows',
            'first matched glob takes precedence, absolute path (with \\)',
            'returned path is only the (normalized) specified config path',
            'C:\\workspace',
            './jestProject',
            {
              '**/*.test.js': 'C:\\notWorkspace\\notJestProject\\jest.config.js',
              '**/*.spec.js': 'C:\\notWorkspace\\notJestProject\\jest.unit-config.js',
              '**/*.it.spec.js': 'C:\\notWorkspace\\notJestProject\\jest.it-config.js',
            },
            'C:\\workspace\\jestProject\\src\\index.it.spec.js',
            'C:/notWorkspace/notJestProject/jest.unit-config.js',
          ],
          [
            'windows',
            'first matched glob takes precedence, absolute path (with /)',
            'returned path is only the specified config path',
            'C:\\workspace',
            './jestProject',
            {
              '**/*.test.js': 'C:/notWorkspace/notJestProject/jest.config.js',
              '**/*.spec.js': 'C:/notWorkspace/notJestProject/jest.unit-config.js',
              '**/*.it.spec.js': 'C:/notWorkspace/notJestProject/jest.it-config.js',
            },
            'C:\\workspace\\jestProject\\src\\index.it.spec.js',
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

              expect(jestRunnerConfig.getJestConfigPath(targetPath)).toBe(expectedPath);
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
            './projectPath',
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
            '/home/user/workspace/src/jest.config.mjs',
            '/home/user/workspace/src/jest.config.mjs',
          ],
          // windows

          [
            'windows',
            'projectPath is relative',
            'returns the found jest config (traversing up from target path)',
            'C:\\workspace',
            './jestProject',
            {
              '**/*.test.js': 'C:/notWorkspace/notJestProject/jest.config.js',
            },
            'C:\\workspace\\jestProject\\src\\index.it.spec.js',
            'C:\\workspace\\jestProject\\src\\jest.config.mjs',
            'C:\\workspace\\jestProject\\src\\jest.config.mjs',
          ],
          [
            'windows',
            'projectPath is not set',
            'returns the found jest config path (traversing up from target path)',
            '/home/user/workspace',
            undefined,
            {
              '**/*.test.js': 'C:/notWorkspace/notJestProject/jest.config.js',
            },
            'C:\\workspace\\jestProject\\src\\index.it.spec.js',
            'C:\\workspace\\jestProject\\src\\jest.config.mjs',
            'C:\\workspace\\jestProject\\src\\jest.config.mjs',
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
});
