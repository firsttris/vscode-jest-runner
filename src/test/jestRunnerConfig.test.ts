import * as vscode from 'vscode';
import { JestRunnerConfig } from '../jestRunnerConfig';
import { Uri, WorkspaceConfiguration, WorkspaceFolder } from './__mocks__/vscode';
import { isWindows } from '../util';

const describes = {
  windows: isWindows() ? describe : describe.skip,
  linux: ['linux', 'darwin'].includes(process.platform) ? describe : describe.skip,
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
        })
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
        })
      );

      expect(jestRunnerConfig.cwd).toBe('/home/user/project/jestProject');
    });
  });
});
