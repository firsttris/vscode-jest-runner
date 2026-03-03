import type * as vscode from 'vscode';

export function collectTestsByFile(
	request: vscode.TestRunRequest,
	testController: vscode.TestController,
): Map<string, vscode.TestItem[]> {
	const testsByFile = new Map<string, vscode.TestItem[]>();

	const collectTests = (test: vscode.TestItem) => {
		if (request.exclude?.includes(test)) {
			return;
		}

		if (test.children.size > 0) {
			test.children.forEach(collectTests);
		} else if (test.uri) {
			const filePath = test.uri.fsPath;
			if (!testsByFile.has(filePath)) {
				testsByFile.set(filePath, []);
			}
			testsByFile.get(filePath)?.push(test);
		}
	};

	if (request.include) {
		request.include.forEach(collectTests);
	} else {
		testController.items.forEach(collectTests);
	}

	return testsByFile;
}
