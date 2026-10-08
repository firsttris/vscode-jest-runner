import * as vscode from 'vscode';
import { collectTestsByFile } from '../execution/TestCollector';
import type { TestRunnerConfig } from '../testRunnerConfig';
import { toTestItemsNamePattern } from '../utils/TestNameUtils';

export class DebugHandler {
	constructor(
		private readonly testController: vscode.TestController,
		private readonly testRunnerConfig: TestRunnerConfig,
	) {}

	/**
	 * Debugs the first requested file in one session. A test or describe
	 * block is filtered by the names of its tests; a file or folder (whose
	 * items use their path as id) runs the whole file.
	 */
	public async debugHandler(
		request: vscode.TestRunRequest,
		token: vscode.CancellationToken,
	): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}

		const [first] = collectTestsByFile(request, this.testController);
		if (!first) {
			return;
		}

		const [filePath, tests] = first;
		const runsWholeFile =
			!request.include ||
			request.include.some((item) => item.id === item.uri?.fsPath);
		const testName = runsWholeFile ? undefined : toTestItemsNamePattern(tests);

		const fileUri = vscode.Uri.file(filePath);
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('Could not determine workspace folder');
			return;
		}

		const debugConfig = this.testRunnerConfig.getDebugConfiguration(
			filePath,
			testName,
		);
		await vscode.debug.startDebugging(workspaceFolder, debugConfig);
	}
}
