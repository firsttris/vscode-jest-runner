import * as vscode from 'vscode';
import { testFileCache } from '../testDetection/testFileCache';
import { discoverTests } from '../testDiscovery';
import type { TestRunnerConfig } from '../testRunnerConfig';

// Mock vscode
const mockCreateTestItem = jest.fn();
const mockTestController = {
	items: {
		add: jest.fn(),
		get: jest.fn(),
		replace: jest.fn(),
	},
	createTestItem: mockCreateTestItem,
} as unknown as vscode.TestController;

const mockWorkspaceFolder = {
	uri: { fsPath: '/root' },
	name: 'root',
	index: 0,
} as vscode.WorkspaceFolder;

const mockJestConfig = {
	getAllPotentialSourceFiles: () => '**/*.test.ts',
} as TestRunnerConfig;

jest.mock('../parser', () => ({
	parseTestFile: jest.fn(),
}));

jest.mock('../testDetection/testFileCache', () => ({
	testFileCache: {
		isTestFile: jest.fn().mockReturnValue(true),
	},
}));

describe('discoverTests - hierarchical', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(mockCreateTestItem as jest.Mock).mockImplementation((id, label, uri) => ({
			id,
			label,
			uri,
			children: {
				add: jest.fn(),
				get: jest.fn(),
			},
		}));
	});

	it('should create a directory hierarchy for test files', async () => {
		// Mock findFiles to return a deep file
		vscode.workspace.findFiles = jest
			.fn()
			.mockResolvedValue([
				{ fsPath: '/root/packages/pkgA/src/components/button.test.ts' },
			]);

		await discoverTests(
			mockWorkspaceFolder,
			mockTestController,
			mockJestConfig,
		);

		// Expect 'packages' folder to be created
		expect(mockCreateTestItem).toHaveBeenCalledWith(
			expect.stringContaining('packages'),
			'packages',
			expect.anything(),
		);

		// Expect 'pkgA' folder
		expect(mockCreateTestItem).toHaveBeenCalledWith(
			expect.stringContaining('pkgA'),
			'pkgA',
			expect.anything(),
		);

		// Expect 'src' folder
		expect(mockCreateTestItem).toHaveBeenCalledWith(
			expect.stringContaining('src'),
			'src',
			expect.anything(),
		);

		// Expect 'components' folder
		expect(mockCreateTestItem).toHaveBeenCalledWith(
			expect.stringContaining('components'),
			'components',
			expect.anything(),
		);

		// Expect file item
		expect(mockCreateTestItem).toHaveBeenCalledWith(
			'/root/packages/pkgA/src/components/button.test.ts',
			'button.test.ts',
			expect.anything(),
		);
	});

	it('should use projectPath as discovery root when configured', async () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
			get: jest.fn((key: string, defaultValue?: unknown) => {
				if (key === 'jestrunner.projectPath') {
					return 'packages/pkgA';
				}
				return defaultValue;
			}),
		} as any);

		vscode.workspace.findFiles = jest.fn().mockResolvedValue([]);

		await discoverTests(
			mockWorkspaceFolder,
			mockTestController,
			mockJestConfig,
		);

		expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				base: '/root/packages/pkgA',
				pattern: '**/*.test.ts',
			}),
			'**/node_modules/**',
		);
	});

	it('should use absolute projectPath as-is for discovery root', async () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
			get: jest.fn((key: string, defaultValue?: unknown) => {
				if (key === 'jestrunner.projectPath') {
					return '/external/repo';
				}
				return defaultValue;
			}),
		} as any);

		vscode.workspace.findFiles = jest.fn().mockResolvedValue([]);

		await discoverTests(
			mockWorkspaceFolder,
			mockTestController,
			mockJestConfig,
		);

		expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				base: '/external/repo',
				pattern: '**/*.test.ts',
			}),
			'**/node_modules/**',
		);
	});

	it('should not create test items when configured projectPath has no matches', async () => {
		jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
			get: jest.fn((key: string, defaultValue?: unknown) => {
				if (key === 'jestrunner.projectPath') {
					return 'packages/does-not-exist';
				}
				return defaultValue;
			}),
		} as any);

		vscode.workspace.findFiles = jest.fn().mockResolvedValue([]);

		await discoverTests(
			mockWorkspaceFolder,
			mockTestController,
			mockJestConfig,
		);

		expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				base: '/root/packages/does-not-exist',
				pattern: '**/*.test.ts',
			}),
			'**/node_modules/**',
		);
		expect(mockCreateTestItem).not.toHaveBeenCalled();
	});
});
