import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import { pushMany } from '../util';
import { toTestItemNamePattern } from '../utils/TestNameUtils';

export class DebugHandler {
  constructor(
    private readonly testController: vscode.TestController,
    private readonly testRunnerConfig: TestRunnerConfig,
  ) {}

  public async debugHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const queue: vscode.TestItem[] = [];

    if (request.include) {
      request.include.forEach((test) => queue.push(test));
    } else {
      this.testController.items.forEach((test) => queue.push(test));
    }

    for (const test of queue) {
      if (token.isCancellationRequested) {
        break;
      }

      if (request.exclude?.includes(test)) {
        continue;
      }

      if (test.children.size === 0) {
        await this.debugTest(test);
        break;
      } else {
        test.children.forEach((child) => {
          queue.push(child);
        });
      }
    }
  }

  private async debugTest(test: vscode.TestItem): Promise<boolean | undefined> {
    const filePath = test.uri!.fsPath;
    const testName =
      test.children.size === 0 ? toTestItemNamePattern(test) : undefined;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(test.uri!);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Could not determine workspace folder');
      return;
    }

    const debugConfig = this.testRunnerConfig.getDebugConfiguration(filePath);
    const standardArgs = this.testRunnerConfig.buildTestArgs(
      filePath,
      testName,
      false,
    );
    pushMany(debugConfig.args, standardArgs);
    return vscode.debug.startDebugging(workspaceFolder, debugConfig);
  }
}
