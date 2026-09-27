import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as parser from '../parser';
import { testFileCache } from '../testDetection/testFileCache';
import { getOrCreateFileTestItem } from '../testDiscovery';
import {
	setupTestController,
	type TestControllerSetup,
	TestItem,
} from './testControllerSetup';

jest.mock('child_process');

describe('JestTestController - file watcher', () => {
	let setup: TestControllerSetup;

	beforeEach(() => {
		jest.clearAllMocks();
		setup = setupTestController();
	});

	afterEach(() => {
		setup.controller?.dispose();
		jest.restoreAllMocks();
	});

	it('should reparse file on change', () => {
		const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
			.mock.results[0].value;
		const changeCallback = (mockWatcher.onDidChange as jest.Mock).mock
			.calls[0][0];

		const mockTestController = (vscode.tests.createTestController as jest.Mock)
			.mock.results[0].value;
		const testFilePath = '/workspace/test.ts';
		const testItem = new TestItem(
			testFilePath,
			'test.ts',
			vscode.Uri.file(testFilePath),
		);
		mockTestController.items.add(testItem);

		(parser.parseTestFile as jest.Mock).mockClear();

		changeCallback({ fsPath: testFilePath });

		expect(parser.parseTestFile).toHaveBeenCalledWith(testFilePath);
	});

	it('should reparse a nested file on change', () => {
		const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
			.mock.results[0].value;
		const changeCallback = (mockWatcher.onDidChange as jest.Mock).mock
			.calls[0][0];

		const mockTestController = (vscode.tests.createTestController as jest.Mock)
			.mock.results[0].value;
		const testFilePath = path.join('/workspace', 'src', 'nested.test.ts');
		getOrCreateFileTestItem(
			mockTestController,
			setup.mockWorkspaceFolder,
			testFilePath,
		);
		expect(mockTestController.items.get(testFilePath)).toBeUndefined();

		jest
			.spyOn(vscode.workspace, 'getWorkspaceFolder')
			.mockReturnValue(setup.mockWorkspaceFolder);
		(parser.parseTestFile as jest.Mock).mockClear();

		changeCallback(vscode.Uri.file(testFilePath));

		expect(parser.parseTestFile).toHaveBeenCalledWith(testFilePath);
	});

	it('should reparse file on save', () => {
		const saveCallback = (vscode.workspace.onDidSaveTextDocument as jest.Mock)
			.mock.calls[0][0];

		const mockTestController = (vscode.tests.createTestController as jest.Mock)
			.mock.results[0].value;
		const testFilePath = '/workspace/test.ts';
		const testItem = new TestItem(
			testFilePath,
			'test.ts',
			vscode.Uri.file(testFilePath),
		);
		mockTestController.items.add(testItem);

		(parser.parseTestFile as jest.Mock).mockClear();

		saveCallback({ uri: vscode.Uri.file(testFilePath) });

		expect(parser.parseTestFile).toHaveBeenCalledWith(testFilePath);
	});

	it('should parse a saved file once, not again for the watcher event', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-runner-watch-'));
		try {
			const testFilePath = path.join(dir, 'saved.test.ts');
			fs.writeFileSync(testFilePath, '');
			const saveCallback = (vscode.workspace.onDidSaveTextDocument as jest.Mock)
				.mock.calls[0][0];
			const mockWatcher = (
				vscode.workspace.createFileSystemWatcher as jest.Mock
			).mock.results[0].value;
			const changeCallback = (mockWatcher.onDidChange as jest.Mock).mock
				.calls[0][0];
			const mockTestController = (
				vscode.tests.createTestController as jest.Mock
			).mock.results[0].value;
			mockTestController.items.add(
				new TestItem(
					testFilePath,
					'saved.test.ts',
					vscode.Uri.file(testFilePath),
				),
			);
			jest.spyOn(testFileCache, 'isTestFile').mockReturnValue(true);
			(parser.parseTestFile as jest.Mock).mockClear();

			saveCallback({ uri: vscode.Uri.file(testFilePath) });
			changeCallback(vscode.Uri.file(testFilePath));

			expect(parser.parseTestFile).toHaveBeenCalledTimes(1);

			// A later change on disk (e.g. git checkout) is parsed again.
			const later = new Date(Date.now() + 5000);
			fs.utimesSync(testFilePath, later, later);
			changeCallback(vscode.Uri.file(testFilePath));

			expect(parser.parseTestFile).toHaveBeenCalledTimes(2);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('should add new test file on create', () => {
		const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
			.mock.results[0].value;
		const createCallback = (mockWatcher.onDidCreate as jest.Mock).mock
			.calls[0][0];

		const mockTestController = (vscode.tests.createTestController as jest.Mock)
			.mock.results[0].value;
		const previousItemCount = mockTestController.items.size;

		createCallback(vscode.Uri.file('/workspace/new-test.ts'));

		expect(mockTestController.items.size).toBeGreaterThanOrEqual(
			previousItemCount,
		);
	});

	it('should remove test file on delete', () => {
		const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
			.mock.results[0].value;
		const deleteCallback = (mockWatcher.onDidDelete as jest.Mock).mock
			.calls[0][0];

		const mockTestController = (vscode.tests.createTestController as jest.Mock)
			.mock.results[0].value;
		const testFilePath = '/workspace/test.ts';
		const testItem = new TestItem(
			testFilePath,
			'test.ts',
			vscode.Uri.file(testFilePath),
		);
		mockTestController.items.add(testItem);

		deleteCallback(vscode.Uri.file(testFilePath));

		expect(mockTestController.items.get(testFilePath)).toBeUndefined();
	});

	it('should ignore changes to files outside workspace', () => {
		const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
			.mock.results[0].value;
		const createCallback = (mockWatcher.onDidCreate as jest.Mock).mock
			.calls[0][0];

		(parser.parseTestFile as jest.Mock).mockClear();

		createCallback(vscode.Uri.file('/other/path/test.ts'));

		expect(parser.parseTestFile).not.toHaveBeenCalled();
	});

	it('should not add non-test files on create', () => {
		const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
			.mock.results[0].value;
		const createCallback = (mockWatcher.onDidCreate as jest.Mock).mock
			.calls[0][0];

		const mockTestController = (vscode.tests.createTestController as jest.Mock)
			.mock.results[0].value;

		jest.spyOn(testFileCache, 'isTestFile').mockReturnValue(false);

		const initialItemCount = mockTestController.items.size;
		(parser.parseTestFile as jest.Mock).mockClear();

		createCallback(vscode.Uri.file('/workspace/regular-file.ts'));

		expect(parser.parseTestFile).not.toHaveBeenCalled();
		expect(mockTestController.items.size).toBe(initialItemCount);
	});
});
