import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
  Document,
  TextEditor,
  Uri,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from './__mocks__/vscode';
import * as testDetection from '../testDetection/testFileDetection';

describe('TestRunnerConfig - Bun Debug', () => {
  let jestRunnerConfig: TestRunnerConfig;
  const mockFilePath = '/home/user/project/src/test.bun.ts';

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

    // Mock Bun framework detection
    jest.spyOn(testDetection, 'getTestFrameworkForFile').mockReturnValue('bun');
  });

  it('should include --inspect-wait in runtimeArgs', () => {
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
      new WorkspaceConfiguration({
        'jestrunner.bunDebugOptions': {},
      }),
    );

    const config = jestRunnerConfig.getDebugConfiguration(mockFilePath);

    expect(config.type).toBe('bun');
    expect(config.runtimeExecutable).toBeUndefined();
    expect(config.program).toBe(mockFilePath);
    expect(config.runtimeArgs).toContain('test');
    expect(config.runtimeArgs).toContain('--inspect-wait');
  });

  it('should include custom bunDebugOptions', () => {
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
      new WorkspaceConfiguration({
        'jestrunner.bunDebugOptions': {
          env: { CUSTOM_ENV: 'true' },
        },
      }),
    );

    const config = jestRunnerConfig.getDebugConfiguration(mockFilePath);

    expect(config.env).toEqual({ CUSTOM_ENV: 'true' });
    expect(config.runtimeArgs).toContain('--inspect-wait');
  });
});
