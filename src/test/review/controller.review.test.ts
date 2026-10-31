import * as vscode from 'vscode';
import * as Settings from '../../config/Settings';
import { CoverageProvider, DetailedFileCoverage } from '../../coverageProvider';
import * as parser from '../../parser';
import { DebugHandler } from '../../testController/DebugHandler';
import { TestConfigWatcher } from '../../testController/TestConfigWatcher';
import { TestFileWatcher } from '../../testController/TestFileWatcher';
import { testFileCache } from '../../testDetection/testFileCache';
import { TestRunner } from '../../testRunner';
import {
	CancellationToken,
	TestItem,
	TestCoverageCount,
} from '../__mocks__/vscode';

jest.mock('child_process');

function folder(path: string, index: number): vscode.WorkspaceFolder {
	return { uri: vscode.Uri.file(path), name: path, index };
}

function mockWatcher() {
	return {
		onDidChange: jest.fn(),
		onDidCreate: jest.fn(),
		onDidDelete: jest.fn(),
		dispose: jest.fn(),
	};
}

afterEach(() => {
	jest.restoreAllMocks();
	Object.defineProperty(vscode.workspace, 'workspaceFolders', {
		value: undefined,
		configurable: true,
	});
});

describe('TestFileWatcher (multi-root)', () => {
	it('adds a created file under the workspace folder that contains it, not one sharing a path prefix', () => {
		const app = folder('/ws/app', 0);
		const e2e = folder('/ws/app-e2e', 1);
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			value: [app, e2e],
			configurable: true,
		});
		jest
			.spyOn(vscode.workspace, 'getWorkspaceFolder')
			.mockImplementation((uri: vscode.Uri) =>
				uri.fsPath.startsWith('/ws/app-e2e/') ? e2e : app,
			);
		const watcher = mockWatcher();
		(vscode.workspace.createFileSystemWatcher as jest.Mock).mockReturnValue(
			watcher,
		);
		jest.spyOn(testFileCache, 'isTestFile').mockReturnValue(true);
		jest
			.spyOn(parser, 'parseTestFile')
			.mockReturnValue({ root: { children: [] } } as any);

		const controller = vscode.tests.createTestController('id', 'label');
		new TestFileWatcher(controller, {
			getAllPotentialSourceFiles: () => '**/*.ts',
		} as any);

		const file = '/ws/app-e2e/src/login.test.ts';
		watcher.onDidCreate.mock.calls[0][0](vscode.Uri.file(file));

		// Discovery nests it as <folder item /ws/app-e2e/src> -> file.
		expect(controller.items.get(file)).toBeUndefined();
		expect(
			controller.items.get('/ws/app-e2e/src')?.children.get(file),
		).toBeDefined();
	});
});

describe('TestConfigWatcher', () => {
	it('watches a custom configPath relative to projectPath, as ConfigResolver resolves it', () => {
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			value: [folder('/ws', 0)],
			configurable: true,
		});
		jest
			.spyOn(Settings, 'getJestConfigPath')
			.mockReturnValue('jest.it.config.js');
		jest
			.spyOn(Settings, 'getVitestConfigPath')
			.mockReturnValue(undefined as any);
		jest.spyOn(Settings, 'getProjectPath').mockReturnValue('packages/app');
		const create = (
			vscode.workspace.createFileSystemWatcher as jest.Mock
		).mockImplementation(() => mockWatcher());
		create.mockClear();

		const configWatcher = new TestConfigWatcher();

		const watched = create.mock.calls.map((c) => c[0]);
		expect(watched).toContain('/ws/packages/app/jest.it.config.js');
		configWatcher.dispose();
	});
});

describe('DebugHandler', () => {
	it('debugs only the selected test of the first file when another whole file is also selected', async () => {
		const ws = folder('/ws', 0);
		jest.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue(ws);
		jest.spyOn(vscode.debug, 'startDebugging').mockResolvedValue(true);

		const fileA = '/ws/a.test.ts';
		const fileB = '/ws/b.test.ts';
		const a1 = new TestItem(
			`${fileA}:it:1:first`,
			'first',
			vscode.Uri.file(fileA),
		);
		const a2 = new TestItem(
			`${fileA}:it:5:second`,
			'second',
			vscode.Uri.file(fileA),
		);
		const fileAItem = new TestItem(fileA, 'a.test.ts', vscode.Uri.file(fileA));
		fileAItem.children.add(a1);
		fileAItem.children.add(a2);
		const b1 = new TestItem(
			`${fileB}:it:1:other`,
			'other',
			vscode.Uri.file(fileB),
		);
		const fileBItem = new TestItem(fileB, 'b.test.ts', vscode.Uri.file(fileB));
		fileBItem.children.add(b1);

		const controller = vscode.tests.createTestController('id', 'label');
		controller.items.add(fileAItem as any);
		controller.items.add(fileBItem as any);
		const getDebugConfiguration = jest.fn().mockReturnValue({});
		const handler = new DebugHandler(controller, {
			getDebugConfiguration,
		} as any);

		await handler.debugHandler(
			{ include: [a1, fileBItem], exclude: [] } as any,
			new CancellationToken() as any,
		);

		expect(getDebugConfiguration).toHaveBeenCalledWith(fileA, 'first');
	});
});

describe('TestRunner debug (CodeLens / commands)', () => {
	it('starts debugging in the workspace folder of the file, so ${workspaceFolder} in debugOptions resolves in multi-root workspaces', async () => {
		const pkg = folder('/ws/pkg-b', 1);
		jest.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue(pkg);
		const startDebugging = jest
			.spyOn(vscode.debug, 'startDebugging')
			.mockResolvedValue(true);

		const runner = new TestRunner({
			getDebugConfiguration: () => ({
				type: 'node',
				request: 'launch',
				name: 'Debug Jest Tests',
				skipFiles: ['${workspaceFolder}/node_modules/**'],
			}),
		} as any);

		await runner.debugTestsOnPath('/ws/pkg-b/src/x.test.ts');

		expect(startDebugging).toHaveBeenCalledWith(pkg, expect.any(Object));
	});
});

describe('CoverageProvider.loadDetailedCoverage', () => {
	it('gives every branch a valid range, also the implicit else of an `if` without else (Istanbul writes {start:{},end:{}})', async () => {
		// Real Istanbul output for: function f(a){ if(a){return 1} return 2 }
		const data = {
			path: '/ws/src/f.js',
			statementMap: {},
			fnMap: {},
			s: {},
			f: {},
			branchMap: {
				'0': {
					loc: {
						start: { line: 1, column: 15 },
						end: { line: 1, column: 30 },
					},
					type: 'if',
					locations: [
						{ start: { line: 1, column: 15 }, end: { line: 1, column: 30 } },
						{ start: {}, end: {} },
					],
					line: 1,
				},
			},
			b: { '0': [1, 0] },
		} as any;
		const fileCoverage = new DetailedFileCoverage(
			vscode.Uri.file(data.path),
			new TestCoverageCount(0, 0) as any,
			undefined,
			undefined,
			data,
		);

		const details = (await new CoverageProvider().loadDetailedCoverage(
			fileCoverage,
			new CancellationToken() as any,
		)) as any[];

		const branchLocations = details.flatMap((d) =>
			(d.branches ?? []).map((b: any) => b.location),
		);
		expect(branchLocations).toHaveLength(2);
		// The mock Range keeps its two Position arguments as startLine/startColumn.
		const coords = branchLocations.flatMap((loc: any) =>
			[loc.start ?? loc.startLine, loc.end ?? loc.startColumn].flatMap(
				(pos: any) => [pos.line, pos.character],
			),
		);
		const invalid = coords.filter(
			(c: unknown) => !(Number.isInteger(c) && (c as number) >= 0),
		);
		expect(invalid).toEqual([]);
	});
});
