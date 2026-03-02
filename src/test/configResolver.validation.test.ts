import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
  Document,
  TextEditor,
  Uri,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from './__mocks__/vscode';
import { normalizePath } from '../utils/PathUtils';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cacheManager } from '../cache/CacheManager';

jest.mock('../cache/CacheManager', () => ({
  cacheManager: {
    getConfigPath: jest.fn(),
    setConfigPath: jest.fn(),
    invalidateAll: jest.fn(),
  },
}));

describe('Issue #459: package.json without "jest" key', () => {
  let jestRunnerConfig: TestRunnerConfig;
  const workspacePath = path.resolve('/home/user/workspace');
  const targetPath = path.resolve('/home/user/workspace/src/test.spec.ts');
  const packageJsonPath = path.resolve(workspacePath, 'package.json');

  beforeEach(() => {
    cacheManager.invalidateAll();
    jestRunnerConfig = new TestRunnerConfig();

    jest
      .spyOn(vscode.workspace, 'getWorkspaceFolder')
      .mockReturnValue(
        new WorkspaceFolder(new Uri(workspacePath) as any) as any,
      );

    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
      new WorkspaceConfiguration({
        'jestrunner.projectPath': undefined,
        'jestrunner.configPath': undefined,
        'jestrunner.useNearestConfig': true,
      }),
    );

    jest
      .spyOn(vscode.window, 'activeTextEditor', 'get')
      .mockReturnValue(
        new TextEditor(new Document(new Uri(targetPath) as any)) as any,
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should NOT use package.json if it does not contain a "jest" key', () => {
    // Mock fs.existsSync to only find package.json
    jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      const normalized = normalizePath(filePath as string);
      return normalized === normalizePath(packageJsonPath);
    });

    // Mock fs.readFileSync to return package.json content without "jest" key
    jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
      if (
        normalizePath(filePath as string) === normalizePath(packageJsonPath)
      ) {
        return JSON.stringify({
          name: 'my-project',
          dependencies: {},
        });
      }
      throw new Error(`Unexpected file read: ${filePath}`);
    });

    // Mocking statSync specifically for loop checks in ConfigResolver
    jest.spyOn(fs, 'statSync').mockImplementation((p): any => {
      if (normalizePath(p as string) === normalizePath(packageJsonPath)) {
        return { isFile: () => true, isDirectory: () => false };
      }
      if (normalizePath(p as string).startsWith(normalizePath(workspacePath))) {
        return { isFile: () => false, isDirectory: () => true };
      }
      throw new Error('Unexpected statSync');
    });

    const configPath = jestRunnerConfig.getJestConfigPath(targetPath);

    // Should be empty string (or undefined/null depending on implementation) because package.json is invalid
    // and no other config exists.
    expect(configPath).toBe('');
  });

  it('should use package.json if it DOES contain a "jest" key', () => {
    // Mock fs.existsSync to only find package.json
    jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      const normalized = normalizePath(filePath as string);
      return normalized === normalizePath(packageJsonPath);
    });

    // Mock fs.readFileSync to return package.json content WITH "jest" key
    jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
      if (
        normalizePath(filePath as string) === normalizePath(packageJsonPath)
      ) {
        return JSON.stringify({
          name: 'my-project',
          jest: {
            verbose: true,
          },
        });
      }
      throw new Error(`Unexpected file read: ${filePath}`);
    });

    jest.spyOn(fs, 'statSync').mockImplementation((p): any => {
      if (normalizePath(p as string) === normalizePath(packageJsonPath)) {
        return { isFile: () => true, isDirectory: () => false };
      }
      if (normalizePath(p as string).startsWith(normalizePath(workspacePath))) {
        return { isFile: () => false, isDirectory: () => true };
      }
      return { isFile: () => false, isDirectory: () => true };
    });

    const configPath = jestRunnerConfig.getJestConfigPath(targetPath);

    expect(configPath).toBe(normalizePath(packageJsonPath));
  });
});
