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

/**
 * Whether only some of the tests of `filePath` are requested. `tests` are
 * the file's requested leaf tests, as collected by collectTestsByFile.
 */
export function isPartiallySelected(
	testController: vscode.TestController,
	filePath: string,
	tests: vscode.TestItem[] | undefined,
): boolean {
	if (!tests || tests.length === 0) return false;

	const fileItem = findFileItem(testController, filePath, tests[0]);
	if (!fileItem) return false;

	// tests holds leaf tests, so compare against the file's leaves,
	// not its top-level children (which may be describe blocks).
	return tests.length < countLeafTests(fileItem);
}

function findFileItem(
	testController: vscode.TestController,
	filePath: string,
	test: vscode.TestItem,
): vscode.TestItem | undefined {
	// File items are nested under folder items, so walk up from the test
	// instead of looking them up at the controller root.
	for (let item = test.parent; item; item = item.parent) {
		if (item.id === filePath) return item;
	}
	return testController.items.get(filePath);
}

function countLeafTests(item: vscode.TestItem): number {
	if (item.children.size === 0) return 1;

	let count = 0;
	item.children.forEach((child) => {
		count += countLeafTests(child);
	});
	return count;
}
