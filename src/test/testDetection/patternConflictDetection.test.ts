import * as vscode from 'vscode';
import {
  detectPatternConflict,
  showPatternConflictWarning,
  clearPatternConflictWarnings,
  hasWarnedForDirectory,
  PatternConflictInfo,
  initConfigFileWatcher,
  disposeConfigFileWatcher,
} from '../../testDetection/patternConflictDetection';
import { DEFAULT_TEST_PATTERNS, TestPatterns } from '../../testDetection/frameworkDefinitions';

// Mock the util module
const mockOutputChannel = {
  appendLine: jest.fn(),
  show: jest.fn(),
};
jest.mock('../../util', () => ({
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  getOutputChannel: jest.fn(() => mockOutputChannel),
}));

jest.mock('vscode');

const mockedVscode = vscode as jest.Mocked<typeof vscode>;
const mockedUtil = require('../../util');

describe('patternConflictDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPatternConflictWarnings();
  });

  describe('detectPatternConflict', () => {
    describe('both_default conflict', () => {
      it('should detect conflict when both configs are undefined', () => {
        const result = detectPatternConflict(undefined, undefined);

        expect(result.hasConflict).toBe(true);
        expect(result.reason).toBe('both_default');
        expect(result.jestIsDefault).toBe(true);
        expect(result.vitestIsDefault).toBe(true);
        expect(result.jestPatterns).toEqual(DEFAULT_TEST_PATTERNS);
        expect(result.vitestPatterns).toEqual(DEFAULT_TEST_PATTERNS);
      });

      it('should detect conflict when both configs have empty patterns', () => {
        const jestConfig: TestPatterns = { patterns: [], isRegex: false };
        const vitestConfig: TestPatterns = { patterns: [], isRegex: false };

        const result = detectPatternConflict(jestConfig, vitestConfig);

        expect(result.hasConflict).toBe(true);
        expect(result.reason).toBe('both_default');
      });

      it('should detect conflict when one is undefined and other has empty patterns', () => {
        const vitestConfig: TestPatterns = { patterns: [], isRegex: false };

        const result = detectPatternConflict(undefined, vitestConfig);

        expect(result.hasConflict).toBe(true);
        expect(result.reason).toBe('both_default');
      });
    });

    describe('both_same_explicit conflict', () => {
      it('should detect conflict when both have identical explicit patterns', () => {
        const jestConfig: TestPatterns = {
          patterns: ['**/*.test.ts', '**/*.spec.ts'],
          isRegex: false,
        };
        const vitestConfig: TestPatterns = {
          patterns: ['**/*.test.ts', '**/*.spec.ts'],
          isRegex: false,
        };

        const result = detectPatternConflict(jestConfig, vitestConfig);

        expect(result.hasConflict).toBe(true);
        expect(result.reason).toBe('both_same_explicit');
        expect(result.jestIsDefault).toBe(false);
        expect(result.vitestIsDefault).toBe(false);
      });

      it('should detect conflict when both have same patterns in different order', () => {
        const jestConfig: TestPatterns = {
          patterns: ['**/*.spec.ts', '**/*.test.ts'],
          isRegex: false,
        };
        const vitestConfig: TestPatterns = {
          patterns: ['**/*.test.ts', '**/*.spec.ts'],
          isRegex: false,
        };

        const result = detectPatternConflict(jestConfig, vitestConfig);

        expect(result.hasConflict).toBe(true);
        expect(result.reason).toBe('both_same_explicit');
      });
    });

    describe('explicit_matches_default conflict', () => {
      it('should detect conflict when Jest has explicit patterns equal to defaults and Vitest uses defaults', () => {
        const jestConfig: TestPatterns = {
          patterns: [...DEFAULT_TEST_PATTERNS],
          isRegex: false,
        };

        const result = detectPatternConflict(jestConfig, undefined);

        expect(result.hasConflict).toBe(true);
        expect(result.reason).toBe('explicit_matches_default');
        expect(result.jestIsDefault).toBe(false);
        expect(result.vitestIsDefault).toBe(true);
      });

      it('should detect conflict when Vitest has explicit patterns equal to defaults and Jest uses defaults', () => {
        const vitestConfig: TestPatterns = {
          patterns: [...DEFAULT_TEST_PATTERNS],
          isRegex: false,
        };

        const result = detectPatternConflict(undefined, vitestConfig);

        expect(result.hasConflict).toBe(true);
        expect(result.reason).toBe('explicit_matches_default');
        expect(result.jestIsDefault).toBe(true);
        expect(result.vitestIsDefault).toBe(false);
      });
    });

    describe('no conflict', () => {
      it('should not detect conflict when Jest has distinct explicit patterns', () => {
        const jestConfig: TestPatterns = {
          patterns: ['**/*.jest.ts'],
          isRegex: false,
        };

        const result = detectPatternConflict(jestConfig, undefined);

        expect(result.hasConflict).toBe(false);
        expect(result.reason).toBeUndefined();
      });

      it('should not detect conflict when Vitest has distinct explicit patterns', () => {
        const vitestConfig: TestPatterns = {
          patterns: ['**/*.vitest.ts'],
          isRegex: false,
        };

        const result = detectPatternConflict(undefined, vitestConfig);

        expect(result.hasConflict).toBe(false);
        expect(result.reason).toBeUndefined();
      });

      it('should not detect conflict when both have different explicit patterns', () => {
        const jestConfig: TestPatterns = {
          patterns: ['**/*.spec.ts'],
          isRegex: false,
        };
        const vitestConfig: TestPatterns = {
          patterns: ['**/*.test.ts'],
          isRegex: false,
        };

        const result = detectPatternConflict(jestConfig, vitestConfig);

        expect(result.hasConflict).toBe(false);
        expect(result.reason).toBeUndefined();
      });

      it('should not detect conflict when patterns have different lengths', () => {
        const jestConfig: TestPatterns = {
          patterns: ['**/*.spec.ts'],
          isRegex: false,
        };
        const vitestConfig: TestPatterns = {
          patterns: ['**/*.test.ts', '**/*.vitest.ts'],
          isRegex: false,
        };

        const result = detectPatternConflict(jestConfig, vitestConfig);

        expect(result.hasConflict).toBe(false);
        expect(result.reason).toBeUndefined();
      });
    });
  });

  describe('showPatternConflictWarning', () => {
    let showWarningMessageMock: jest.Mock;
    let executeCommandMock: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      clearPatternConflictWarnings();
      showWarningMessageMock = jest.fn().mockResolvedValue(undefined);
      executeCommandMock = jest.fn().mockResolvedValue(undefined);
      (mockedVscode.window.showWarningMessage as jest.Mock) = showWarningMessageMock;
      (mockedVscode.commands.executeCommand as jest.Mock) = executeCommandMock;
    });

    it('should show warning for both_default conflict', () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'both_default',
        jestPatterns: DEFAULT_TEST_PATTERNS,
        vitestPatterns: DEFAULT_TEST_PATTERNS,
        jestIsDefault: true,
        vitestIsDefault: true,
      };

      showPatternConflictWarning('/project', conflictInfo);

      expect(showWarningMessageMock).toHaveBeenCalledTimes(1);
      expect(showWarningMessageMock).toHaveBeenCalledWith(
        expect.stringContaining('neither has explicit test patterns'),
        'Open Output',
        'Configure Settings',
      );
    });

    it('should show warning for both_same_explicit conflict', () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'both_same_explicit',
        jestPatterns: ['**/*.test.ts'],
        vitestPatterns: ['**/*.test.ts'],
        jestIsDefault: false,
        vitestIsDefault: false,
      };

      showPatternConflictWarning('/project', conflictInfo);

      expect(showWarningMessageMock).toHaveBeenCalledTimes(1);
      expect(showWarningMessageMock).toHaveBeenCalledWith(
        expect.stringContaining('identical test patterns'),
        'Open Output',
        'Configure Settings',
      );
    });

    it('should show warning for explicit_matches_default conflict', () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'explicit_matches_default',
        jestPatterns: DEFAULT_TEST_PATTERNS,
        vitestPatterns: DEFAULT_TEST_PATTERNS,
        jestIsDefault: false,
        vitestIsDefault: true,
      };

      showPatternConflictWarning('/project', conflictInfo);

      expect(showWarningMessageMock).toHaveBeenCalledTimes(1);
      expect(showWarningMessageMock).toHaveBeenCalledWith(
        expect.stringContaining('overlapping test patterns'),
        'Open Output',
        'Configure Settings',
      );
    });

    it('should not show warning twice for the same directory', () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'both_default',
        jestPatterns: DEFAULT_TEST_PATTERNS,
        vitestPatterns: DEFAULT_TEST_PATTERNS,
        jestIsDefault: true,
        vitestIsDefault: true,
      };

      showPatternConflictWarning('/project', conflictInfo);
      showPatternConflictWarning('/project', conflictInfo);

      expect(showWarningMessageMock).toHaveBeenCalledTimes(1);
    });

    it('should show warning for different directories', () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'both_default',
        jestPatterns: DEFAULT_TEST_PATTERNS,
        vitestPatterns: DEFAULT_TEST_PATTERNS,
        jestIsDefault: true,
        vitestIsDefault: true,
      };

      showPatternConflictWarning('/project1', conflictInfo);
      showPatternConflictWarning('/project2', conflictInfo);

      expect(showWarningMessageMock).toHaveBeenCalledTimes(2);
    });

    it('should not show warning when no conflict reason', () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: false,
        jestPatterns: ['**/*.spec.ts'],
        vitestPatterns: ['**/*.test.ts'],
        jestIsDefault: false,
        vitestIsDefault: false,
      };

      showPatternConflictWarning('/project', conflictInfo);

      expect(showWarningMessageMock).not.toHaveBeenCalled();
    });

    it('should include directory path in warning message', () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'both_default',
        jestPatterns: DEFAULT_TEST_PATTERNS,
        vitestPatterns: DEFAULT_TEST_PATTERNS,
        jestIsDefault: true,
        vitestIsDefault: true,
      };

      showPatternConflictWarning('/my/custom/path', conflictInfo);

      expect(showWarningMessageMock).toHaveBeenCalledWith(
        expect.stringContaining('/my/custom/path'),
        'Open Output',
        'Configure Settings',
      );
    });

    it('should execute Open Output callback when selected', async () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'both_default',
        jestPatterns: DEFAULT_TEST_PATTERNS,
        vitestPatterns: DEFAULT_TEST_PATTERNS,
        jestIsDefault: true,
        vitestIsDefault: true,
      };

      showWarningMessageMock.mockResolvedValue('Open Output');

      await showPatternConflictWarning('/project', conflictInfo);

      expect(showWarningMessageMock).toHaveBeenCalled();
      expect(mockOutputChannel.show).toHaveBeenCalled();
    });

    it('should execute Configure Settings callback when selected', async () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'both_default',
        jestPatterns: DEFAULT_TEST_PATTERNS,
        vitestPatterns: DEFAULT_TEST_PATTERNS,
        jestIsDefault: true,
        vitestIsDefault: true,
      };

      showWarningMessageMock.mockResolvedValue('Configure Settings');

      await showPatternConflictWarning('/project', conflictInfo);

      expect(showWarningMessageMock).toHaveBeenCalled();
      expect(executeCommandMock).toHaveBeenCalledWith('workbench.action.openSettings', 'jestrunner');
    });
  });

  describe('clearPatternConflictWarnings', () => {
    it('should clear the warned directories set', () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'both_default',
        jestPatterns: DEFAULT_TEST_PATTERNS,
        vitestPatterns: DEFAULT_TEST_PATTERNS,
        jestIsDefault: true,
        vitestIsDefault: true,
      };

      const showWarningMessageMock = jest.fn().mockResolvedValue(undefined);
      (mockedVscode.window.showWarningMessage as jest.Mock) = showWarningMessageMock;

      showPatternConflictWarning('/project', conflictInfo);
      expect(hasWarnedForDirectory('/project')).toBe(true);

      clearPatternConflictWarnings();
      expect(hasWarnedForDirectory('/project')).toBe(false);

      showPatternConflictWarning('/project', conflictInfo);
      expect(showWarningMessageMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('hasWarnedForDirectory', () => {
    it('should return false for directories that have not been warned', () => {
      expect(hasWarnedForDirectory('/some/path')).toBe(false);
    });

    it('should return true after warning has been shown', () => {
      const conflictInfo: PatternConflictInfo = {
        hasConflict: true,
        reason: 'both_default',
        jestPatterns: DEFAULT_TEST_PATTERNS,
        vitestPatterns: DEFAULT_TEST_PATTERNS,
        jestIsDefault: true,
        vitestIsDefault: true,
      };

      const showWarningMessageMock = jest.fn().mockResolvedValue(undefined);
      (mockedVscode.window.showWarningMessage as jest.Mock) = showWarningMessageMock;

      showPatternConflictWarning('/some/path', conflictInfo);

      expect(hasWarnedForDirectory('/some/path')).toBe(true);
    });
  });
});

describe('configFileWatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('disposeConfigFileWatcher', () => {
    it('should dispose the config file watcher if it exists', () => {
      const mockWatcher = {
        dispose: jest.fn(),
        onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
        onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
        onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      };
      (mockedVscode.workspace.createFileSystemWatcher as jest.Mock).mockReturnValue(mockWatcher);

      // Initialize watcher
      initConfigFileWatcher();

      // Dispose it
      disposeConfigFileWatcher();

      expect(mockWatcher.dispose).toHaveBeenCalled();
    });

    it('should do nothing if no watcher exists', () => {
      // Dispose without initializing
      disposeConfigFileWatcher();

      // Should not throw or do anything
    });
  });
});
