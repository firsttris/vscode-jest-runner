import * as fs from 'node:fs';
import * as moduleLib from 'node:module';
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as testDetection from '../testDetection/testFileDetection';
import { TestRunnerConfig } from '../testRunnerConfig';
import { isWindows, normalizePath } from '../utils/PathUtils';
import {
  Document,
  TextEditor,
  Uri,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from './__mocks__/vscode';

const itNonWindows = isWindows() ? it.skip : it;

describe('TestRunnerConfig', () => {
  beforeEach(() => {
    // Default to 'jest' framework to prevent leakage and ensure predictable test behavior
    jest
      .spyOn(testDetection, 'getTestFrameworkForFile')
      .mockReturnValue('jest');
  });

  describe('getDebugConfiguration', () => {
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

      // Mock createRequire to return a mock require function with resolve
      const mockRequire = {
        resolve: jest.fn().mockImplementation((pkg: string) => {
          if (pkg === 'jest/package.json') {
            return '/home/user/project/node_modules/jest/package.json';
          }
          if (pkg === 'vitest/package.json') {
            return '/workspace/node_modules/vitest/package.json';
          }
          throw new Error(`Cannot find module '${pkg}'`);
        }),
      };
      jest
        .spyOn(moduleLib, 'createRequire')
        .mockReturnValue(mockRequire as any);

      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (String(path).endsWith('jest/package.json')) {
          return JSON.stringify({ bin: './bin/jest.js' });
        }
        if (String(path).endsWith('vitest/package.json')) {
          return JSON.stringify({ bin: { vitest: './vitest.mjs' } });
        }
        return '{}';
      });

      // Default to 'jest' framework to prevent leakage and ensure predictable test behavior
      jest
        .spyOn(testDetection, 'getTestFrameworkForFile')
        .mockReturnValue('jest');
    });

    it('should return default debug configuration', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.changeDirectoryToWorkspaceRoot': true,
        }),
      );

      // Mock fs.existsSync to handle both Yarn PnP check and binary path check
      jest.spyOn(fs, 'existsSync').mockImplementation((checkPath: any) => {
        const pathStr = String(checkPath);
        // Return false for Yarn PnP path
        if (pathStr.includes('.yarn/releases')) {
          return false;
        }
        // Return false for Vitest config/scripts by default to simulate Jest env
        if (pathStr.includes('vitest') || pathStr.includes('vite.config')) {
          return false;
        }
        // Return true for Jest .bin
        if (pathStr.includes('.bin/jest')) {
          return true;
        }
        if (pathStr.includes('jest/bin/jest.js')) {
          return true;
        }

        // Default permissive for others (jest.config.js checks etc)
        return true;
      });

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config).toMatchObject({
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
        name: 'Debug Jest Tests',
        request: 'launch',
        type: 'node',
      });
      // On non-Windows, binary is resolved via .bin symlink
      if (!isWindows()) {
        expect(config.program).toBe(
          '/home/user/project/node_modules/jest/bin/jest.js',
        );
        expect(config.args).toEqual(['--runInBand']);
      }
      expect(config.cwd).toBeTruthy(); // cwd may vary based on test setup
    });

    it('should fallback to npx if binary is missing', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      jest.spyOn(fs, 'existsSync').mockImplementation((checkPath: any) => {
        const pathStr = normalizePath(String(checkPath));
        if (pathStr.includes('.yarn/releases')) {
          return false;
        }
        // Simulate missing .bin binary
        if (pathStr.includes('.bin/jest')) {
          return false;
        }
        if (pathStr.includes('jest/bin/jest.js')) {
          return false;
        }
        // Allow jest.config.js etc to be found so framework detection works
        return true;
      });

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBeUndefined();
      expect(config.runtimeExecutable).toBe('npx');
      expect(config.args).toContain('--no-install');
    });

    it('should fallback to npx if binary is missing for Vitest', () => {
      const vitestFilePath = '/workspace/test.spec.ts';
      jest
        .spyOn(vscode.window, 'activeTextEditor', 'get')
        .mockReturnValue(
          new TextEditor(new Document(new Uri(vitestFilePath) as any)) as any,
        );

      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      jest
        .spyOn(testDetection, 'getTestFrameworkForFile')
        .mockReturnValue('vitest');

      jest.spyOn(fs, 'existsSync').mockImplementation((checkPath: any) => {
        const pathStr = normalizePath(String(checkPath));
        if (pathStr.includes('.yarn/releases')) {
          return false;
        }
        // Simulate missing .bin binary
        if (pathStr.includes('.bin/vitest')) {
          return false;
        }
        if (pathStr.includes('vitest/vitest.mjs')) {
          return false;
        }
        return false;
      });

      const config = jestRunnerConfig.getDebugConfiguration(vitestFilePath);

      expect(config.program).toBeUndefined();
      expect(config.runtimeExecutable).toBe('npx');
      expect(config.args).toContain('--no-install');
    });

    it('should use default npx configuration even when Yarn PnP is detected', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      // Mock Yarn PnP directory structure (which should now be ignored)
      const expectedPath = path.join('/home/user/project', '.yarn', 'releases');
      jest.spyOn(fs, 'existsSync').mockImplementation((checkPath: any) => {
        if (checkPath === expectedPath) {
          return true;
        }
        // Fail script resolution to force npx fallback
        if (String(checkPath).includes('jest/bin/jest.js')) {
          return false;
        }
        return false;
      });
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['yarn-3.2.0.cjs' as any]);

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.runtimeExecutable).toBe('npx');
      expect(config.args).toEqual(['--no-install', 'jest', '--runInBand']);
    });

    it('should parse custom jest command', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.jestCommand': 'node ./node_modules/jest/bin/jest.js',
        }),
      );

      // Mock no Yarn PnP
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBe('node');
      expect(config.args).toEqual(['./node_modules/jest/bin/jest.js']);
      expect(config.runtimeExecutable).toBeUndefined();
    });

    it('should parse custom jest command with quoted arguments', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.jestCommand':
            'node "node_modules/.bin/jest" --config="jest.config.js"',
        }),
      );

      // Mock no Yarn PnP
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBe('node');
      expect(config.args).toEqual([
        'node_modules/.bin/jest',
        '--config=jest.config.js',
      ]);
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
          'jestrunner.changeDirectoryToWorkspaceRoot': true,
        }),
      );

      const config = jestRunnerConfig.getDebugConfiguration();

      const expectedPath = isWindows()
        ? path.resolve('/home/user/project/packages/app').replace(/\//g, '\\')
        : '/home/user/project/packages/app';
      expect(config.cwd).toBe(expectedPath);
    });

    it('should not set cwd when changeDirectoryToWorkspaceRoot is false', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.changeDirectoryToWorkspaceRoot': false,
        }),
      );

      // Mock no Yarn PnP
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.cwd).toBeUndefined();
    });

    it('should use custom jest command when configured', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.jestCommand': 'node ./custom-jest.js',
        }),
      );

      // Mock no Yarn PnP
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBe('node');
      expect(config.args).toEqual(['./custom-jest.js']);
    });
  });

  describe('getDebugConfiguration with Vitest', () => {
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

    it('should return vitest debug configuration for vitest files', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          return String(filePath).includes('vitest.config');
        });

      jest
        .spyOn(testDetection, 'getTestFrameworkForFile')
        .mockReturnValue('vitest');

      const config = jestRunnerConfig.getDebugConfiguration(
        '/workspace/test.spec.ts',
      );

      expect(config.name).toBe('Debug Vitest Tests');
      expect(config.args).toContain('vitest');
      expect(config.args).toContain('run');
    });

    it('should return jest debug configuration for jest files', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          return String(filePath).includes('jest.config');
        });

      const config = jestRunnerConfig.getDebugConfiguration(
        '/workspace/test.spec.ts',
      );

      expect(config.name).toBe('Debug Jest Tests');
      expect(config.args).toContain('jest');
    });
  });

  describe('getDebugConfiguration with Rstest', () => {
    let jestRunnerConfig: TestRunnerConfig;
    const rstestFilePath = '/workspace/tests/example.test.ts';

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
      jest
        .spyOn(vscode.window, 'activeTextEditor', 'get')
        .mockReturnValue(
          new TextEditor(new Document(new Uri(rstestFilePath) as any)) as any,
        );

      jest
        .spyOn(testDetection, 'getTestFrameworkForFile')
        .mockReturnValue('rstest');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return rstest debug configuration with resolved binary and config path', () => {
      const mockRequire = {
        resolve: jest.fn().mockImplementation((pkg: string) => {
          if (pkg === '@rstest/core/package.json') {
            return '/workspace/node_modules/@rstest/core/package.json';
          }
          throw new Error(`Cannot find module '${pkg}'`);
        }),
      };
      jest
        .spyOn(moduleLib, 'createRequire')
        .mockReturnValue(mockRequire as any);

      jest.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        if (String(filePath).endsWith('@rstest/core/package.json')) {
          return JSON.stringify({ bin: { rstest: './dist/rstest.mjs' } });
        }
        return '{}';
      });

      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          const normalizedPath = normalizePath(String(filePath));
          if (normalizedPath.includes('.yarn/releases')) {
            return false;
          }
          return normalizedPath.endsWith('/@rstest/core/dist/rstest.mjs');
        });

      jest
        .spyOn(jestRunnerConfig, 'getRstestConfigPath')
        .mockReturnValue('/workspace/rstest.config.ts');

      const config = jestRunnerConfig.getDebugConfiguration(
        rstestFilePath,
        'works',
      );

      expect(config.name).toBe('Debug Rstest Tests');
      expect(config.program).toBe(
        '/workspace/node_modules/@rstest/core/dist/rstest.mjs',
      );
      expect(config.args).toEqual([
        '--config',
        '/workspace/rstest.config.ts',
        rstestFilePath,
        '-t',
        'works',
      ]);
    });

    it('should fallback to npx when rstest binary cannot be resolved', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = jestRunnerConfig.getDebugConfiguration(rstestFilePath);

      expect(config.program).toBeUndefined();
      expect(config.runtimeExecutable).toBe('npx');
      expect(config.args).toEqual(
        expect.arrayContaining(['--no-install', 'rstest', rstestFilePath]),
      );
    });
  });

  describe('getDebugConfiguration with enableESM', () => {
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
      const mockRequire = {
        resolve: jest.fn().mockImplementation((pkg: string) => {
          if (pkg === 'jest/package.json') {
            return '/home/user/project/node_modules/jest/package.json';
          }
          if (pkg === 'vitest/package.json') {
            return '/workspace/node_modules/vitest/package.json';
          }
          throw new Error(`Cannot find module '${pkg}'`);
        }),
      };
      jest
        .spyOn(moduleLib, 'createRequire')
        .mockReturnValue(mockRequire as any);

      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (String(path).endsWith('jest/package.json')) {
          return JSON.stringify({ bin: './bin/jest.js' });
        }
        if (String(path).endsWith('vitest/package.json')) {
          return JSON.stringify({ bin: { vitest: './vitest.mjs' } });
        }
        return '{}';
      });
      // Mock fs.existsSync to handle both Yarn PnP check and binary path check
      jest.spyOn(fs, 'existsSync').mockImplementation((checkPath: any) => {
        if (String(checkPath).includes('.yarn/releases')) {
          return false;
        }
        return true;
      });
    });

    itNonWindows(
      'should set NODE_OPTIONS when enableESM is true for Jest',
      () => {
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
          new WorkspaceConfiguration({
            'jestrunner.enableESM': true,
          }),
        );

        jest.spyOn(fs, 'existsSync').mockReturnValue(true);

        const config = jestRunnerConfig.getDebugConfiguration();

        expect(config.program).toBe(
          '/home/user/project/node_modules/jest/bin/jest.js',
        );
        expect(config.args).toEqual(['--runInBand']);
        expect(config.env).toEqual({
          NODE_OPTIONS: '--experimental-vm-modules',
        });
      },
    );

    itNonWindows(
      'should not set NODE_OPTIONS when enableESM is false for Jest',
      () => {
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
          new WorkspaceConfiguration({
            'jestrunner.enableESM': false,
          }),
        );

        jest.spyOn(fs, 'existsSync').mockReturnValue(true);

        const config = jestRunnerConfig.getDebugConfiguration();

        expect(config.program).toBe(
          '/home/user/project/node_modules/jest/bin/jest.js',
        );
        expect(config.args).toEqual(['--runInBand']);
        expect(config.env).toBeUndefined();
      },
    );

    it('should merge NODE_OPTIONS with existing env from debugOptions', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableESM': true,
          'jestrunner.debugOptions': {
            env: { NODE_ENV: 'test', CUSTOM_VAR: 'value' },
          },
        }),
      );

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.env).toEqual({
        NODE_ENV: 'test',
        CUSTOM_VAR: 'value',
        NODE_OPTIONS: '--experimental-vm-modules',
      });
    });

    itNonWindows('should not affect Vitest debug configuration', () => {
      const vitestFilePath = '/workspace/test.spec.ts';

      jest
        .spyOn(vscode.window, 'activeTextEditor', 'get')
        .mockReturnValue(
          new TextEditor(new Document(new Uri(vitestFilePath) as any)) as any,
        );

      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableESM': true,
        }),
      );

      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
            if (String(path).endsWith('vitest/package.json')) {
              return JSON.stringify({ bin: { vitest: './vitest.mjs' } });
            }
            if (String(path).endsWith('jest/package.json')) {
              return JSON.stringify({ bin: './bin/jest.js' });
            }
            return '{}';
          });

          if (String(filePath).includes('.yarn/releases')) {
            return false;
          }
          if (String(filePath).includes('vitest.config')) {
            return true;
          }
          if (String(filePath).includes('vitest.mjs')) {
            return true;
          }
          if (String(filePath).includes('jest.js')) {
            return true;
          }
          return true;
        });

      jest
        .spyOn(testDetection, 'getTestFrameworkForFile')
        .mockReturnValue('vitest');

      const config = jestRunnerConfig.getDebugConfiguration(vitestFilePath);

      expect(config.name).toBe('Debug Vitest Tests');
      expect(config.program).toBe('/workspace/node_modules/vitest/vitest.mjs');
      expect(config.env).toBeUndefined();
    });
  });

  describe('getDebugConfiguration with Deno', () => {
    let jestRunnerConfig: TestRunnerConfig;
    const mockFilePath = '/workspace/main.test.ts';

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('/workspace') as any) as any,
        );
      jest
        .spyOn(vscode.window, 'activeTextEditor', 'get')
        .mockReturnValue(
          new TextEditor(new Document(new Uri(mockFilePath) as any)) as any,
        );

      jest
        .spyOn(testDetection, 'getTestFrameworkForFile')
        .mockReturnValue('deno');
    });

    it('configures deno debug correctly', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.denoRunOptions': ['--allow-read'],
        }),
      );

      const config = jestRunnerConfig.getDebugConfiguration(mockFilePath);

      expect(config.type).toBe('node');
      expect(config.port).toBe(9229);
      expect(config.attachSimplePort).toBe(9229);
      expect(config.runtimeExecutable).toBe('deno');
      expect(config.runtimeArgs).toEqual(
        expect.arrayContaining([
          'test',
          '--inspect-brk',
          '--allow-all',
          '--allow-read',
          mockFilePath,
        ]),
      );
    });
  });
});
