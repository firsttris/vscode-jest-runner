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
import * as fs from 'fs';
import * as path from 'path';
import * as testDetection from '../testDetection/testFileDetection';
import * as child_process from 'child_process';

describe('TestRunnerConfig', () => {
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
    });

    it('should return default debug configuration', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.changeDirectoryToWorkspaceRoot': true,
        }),
      );

      // Mock fs.existsSync to handle both Yarn PnP check and binary path check
      jest.spyOn(fs, 'existsSync').mockImplementation((checkPath: any) => {
        // Return false for Yarn PnP path
        if (String(checkPath).includes('.yarn/releases')) {
          return false;
        }
        // Return true for binary path resolution
        return true;
      });

      // Mock npx --which to return binary path
      jest.spyOn(child_process, 'execSync').mockReturnValue('/home/user/project/node_modules/.bin/jest');

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config).toMatchObject({
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
        name: 'Debug Jest Tests',
        request: 'launch',
        type: 'node',
        program: '/home/user/project/node_modules/.bin/jest',
        args: ['--runInBand'],
      });
      expect(config.cwd).toBeTruthy(); // cwd may vary based on test setup
    });

    it('should configure for Yarn PnP when detected', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({}),
      );

      // Mock Yarn PnP directory structure
      const expectedPath = path.join('/home/user/project', '.yarn', 'releases');
      jest.spyOn(fs, 'existsSync').mockImplementation((checkPath: any) => {
        if (checkPath === expectedPath) {
          return true;
        }
        return false;
      });
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        'yarn-3.2.0.cjs' as any,
      ]);

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBe('.yarn/releases/yarn-3.2.0.cjs');
      expect(config.args).toEqual(['jest']);
      expect(config.runtimeExecutable).toBeUndefined();
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
        .spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(
          new TextEditor(new Document(new Uri(mockFilePath) as any)) as any,
        );
      // Mock fs.existsSync to handle both Yarn PnP check and binary path check
      jest.spyOn(fs, 'existsSync').mockImplementation((checkPath: any) => {
        if (String(checkPath).includes('.yarn/releases')) {
          return false;
        }
        return true;
      });
    });

    it('should set NODE_OPTIONS when enableESM is true for Jest', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableESM': true,
        }),
      );

      // Mock npx --which to return binary path
      jest.spyOn(child_process, 'execSync').mockReturnValue('/home/user/project/node_modules/.bin/jest');

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBe('/home/user/project/node_modules/.bin/jest');
      expect(config.args).toEqual(['--runInBand']);
      expect(config.env).toEqual({
        NODE_OPTIONS: '--experimental-vm-modules',
      });
    });

    it('should not set NODE_OPTIONS when enableESM is false for Jest', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableESM': false,
        }),
      );

      // Mock npx --which to return binary path
      jest.spyOn(child_process, 'execSync').mockReturnValue('/home/user/project/node_modules/.bin/jest');

      const config = jestRunnerConfig.getDebugConfiguration();

      expect(config.program).toBe('/home/user/project/node_modules/.bin/jest');
      expect(config.args).toEqual(['--runInBand']);
      expect(config.env).toBeUndefined();
    });

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

    it('should not affect Vitest debug configuration', () => {
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
          if (String(filePath).includes('.yarn/releases')) {
            return false;
          }
          if (String(filePath).includes('vitest.config')) {
            return true;
          }
          return true;
        });

      jest
        .spyOn(testDetection, 'getTestFrameworkForFile')
        .mockReturnValue('vitest');

      // Mock npx --which to return binary path for vitest
      jest.spyOn(child_process, 'execSync').mockReturnValue('/workspace/node_modules/.bin/vitest');

      const config = jestRunnerConfig.getDebugConfiguration(vitestFilePath);

      expect(config.name).toBe('Debug Vitest Tests');
      expect(config.program).toBe('/workspace/node_modules/.bin/vitest');
      expect(config.env).toBeUndefined();
    });
  });
});
