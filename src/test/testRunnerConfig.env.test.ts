import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
  Document,
  TextEditor,
  Uri,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from './__mocks__/vscode';

describe('TestRunnerConfig', () => {
  describe('getEnvironmentForRun', () => {
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

    it('should return undefined when enableESM is false (default)', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableESM': false,
        }),
      );

      const env = jestRunnerConfig.getEnvironmentForRun(mockFilePath);
      expect(env).toBeUndefined();
    });

    it('should return NODE_OPTIONS when enableESM is true', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.enableESM': true,
        }),
      );

      const env = jestRunnerConfig.getEnvironmentForRun(mockFilePath);
      expect(env).toEqual({ NODE_OPTIONS: '--experimental-vm-modules' });
    });
  });
});
