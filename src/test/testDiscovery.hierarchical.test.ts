
import * as vscode from 'vscode';
import { discoverTests } from '../testDiscovery';
import { TestRunnerConfig } from '../testRunnerConfig';
import { testFileCache } from '../testDetection/testFileCache';

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
        vscode.workspace.findFiles = jest.fn().mockResolvedValue([
            { fsPath: '/root/packages/pkgA/src/components/button.test.ts' },
        ]);

        await discoverTests(mockWorkspaceFolder, mockTestController, mockJestConfig);

        // Expect 'packages' folder to be created
        expect(mockCreateTestItem).toHaveBeenCalledWith(
            expect.stringContaining('packages'),
            'packages',
            expect.anything()
        );

        // Expect 'pkgA' folder
        expect(mockCreateTestItem).toHaveBeenCalledWith(
            expect.stringContaining('pkgA'),
            'pkgA',
            expect.anything()
        );

        // Expect 'src' folder
        expect(mockCreateTestItem).toHaveBeenCalledWith(
            expect.stringContaining('src'),
            'src',
            expect.anything()
        );

        // Expect 'components' folder
        expect(mockCreateTestItem).toHaveBeenCalledWith(
            expect.stringContaining('components'),
            'components',
            expect.anything()
        );

        // Expect file item
        expect(mockCreateTestItem).toHaveBeenCalledWith(
            '/root/packages/pkgA/src/components/button.test.ts',
            'button.test.ts',
            expect.anything()
        );
    });
});
