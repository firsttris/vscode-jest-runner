
import * as vscode from 'vscode';
import { TestRunExecutor } from '../testController/TestRunExecutor';
import { TestRunnerConfig } from '../testRunnerConfig';
import { CoverageProvider } from '../coverageProvider';
import * as path from 'path';
import * as fs from 'fs';

// Mock dependencies
jest.mock('vscode', () => ({
    workspace: {
        getWorkspaceFolder: jest.fn().mockReturnValue({ uri: { fsPath: '/mock/cwd' } })
    },
    Uri: {
        file: jest.fn().mockImplementation((f) => ({ fsPath: f }))
    },
    TestMessage: jest.fn(),
    TestRunRequest: jest.fn(),
    TestItem: jest.fn(),
    FileCoverage: class { },
    TestCoverageCount: class { }
}));
jest.mock('fs');
jest.mock('child_process');
jest.mock('../testRunnerConfig');
jest.mock('../coverageProvider');
jest.mock('../execution/TestCollector', () => ({
    collectTestsByFile: jest.fn().mockImplementation(() => {
        const map = new Map();
        map.set('/mock/cwd/test.ts', [{ label: 'test' }]);
        return map;
    })
}));
jest.mock('../execution/TestArgumentBuilder', () => ({
    buildTestArgs: jest.fn().mockReturnValue(['test']),
    buildTestArgsFast: jest.fn().mockReturnValue(['test']),
    canUseFastMode: jest.fn().mockReturnValue(false)
}));
jest.mock('../execution/TestProcessRunner', () => ({
    executeTestCommand: jest.fn().mockResolvedValue({ output: '', structuredResultsProcessed: false }),
    executeTestCommandFast: jest.fn(),
    logTestExecution: jest.fn()
}));
jest.mock('../testDetection/testFileDetection', () => ({
    getTestFrameworkForFile: jest.fn().mockReturnValue('bun')
}));
jest.mock('../utils/ShellUtils', () => ({
    parseShellCommand: jest.fn().mockReturnValue(['bun', 'test'])
}));

describe('TestRunExecutor Bun Cleanup', () => {
    let executor: TestRunExecutor;
    let mockController: any;
    let mockConfig: any;
    let mockCoverageProvider: any;
    let mockRun: any;

    beforeEach(() => {
        mockRun = {
            started: jest.fn(),
            end: jest.fn(),
            failed: jest.fn(),
            addCoverage: jest.fn()
        };
        mockController = {
            createTestRun: jest.fn().mockReturnValue(mockRun),
            items: new Map()
        };
        mockConfig = {
            cwd: '/mock/cwd',
            getTestCommand: jest.fn().mockReturnValue('bun test'),
            getEnvironmentForRun: jest.fn().mockReturnValue({}),
            getJestConfigPath: jest.fn(),
            getVitestConfigPath: jest.fn()
        };
        mockCoverageProvider = {
            readCoverageFromFile: jest.fn(),
            convertToVSCodeCoverage: jest.fn().mockReturnValue([])
        };

        executor = new TestRunExecutor(
            mockController as vscode.TestController,
            mockConfig as TestRunnerConfig,
            mockCoverageProvider as CoverageProvider
        );

        jest.clearAllMocks();
    });

    it('should delete previous coverage/lcov.info when running Bun with coverage', async () => {
        const testRequest = {
            include: [{ uri: vscode.Uri.file('/mock/cwd/test.ts') }],
            profile: { kind: 2 } // Coverage
        } as unknown as vscode.TestRunRequest;

        const token = { isCancellationRequested: false } as vscode.CancellationToken;

        // Mock fs existence
        (fs.existsSync as jest.Mock).mockImplementation((p) => {
            if (p === path.join('/mock/cwd', 'coverage', 'lcov.info')) return true;
            return false;
        });

        await executor.coverageHandler(testRequest, token);

        expect(fs.unlinkSync).toHaveBeenCalledWith(path.join('/mock/cwd', 'coverage', 'lcov.info'));
    });
});
