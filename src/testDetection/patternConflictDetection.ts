import * as vscode from 'vscode';
import { logWarning, logDebug, getOutputChannel } from '../util';
import { DEFAULT_TEST_PATTERNS, TestPatterns } from './frameworkDefinitions';

// Track which directories have already shown a warning to avoid spam
const warnedDirectories = new Set<string>();

/**
 * Checks if two pattern arrays are effectively equal (same patterns, possibly different order)
 */
function patternsAreEqual(patterns1: string[], patterns2: string[]): boolean {
  if (patterns1.length !== patterns2.length) return false;
  const sorted1 = [...patterns1].sort();
  const sorted2 = [...patterns2].sort();
  return sorted1.every((p, i) => p === sorted2[i]);
}

/**
 * Checks if patterns match the default patterns
 */
function isDefaultPatterns(patterns: string[]): boolean {
  return patternsAreEqual(patterns, DEFAULT_TEST_PATTERNS);
}

/**
 * Gets the effective patterns for a config (explicit or default)
 */
function getEffectivePatterns(config: TestPatterns | undefined): string[] {
  if (!config || config.patterns.length === 0) {
    return DEFAULT_TEST_PATTERNS;
  }
  return config.patterns;
}

export interface PatternConflictInfo {
  hasConflict: boolean;
  reason?: 'both_default' | 'both_same_explicit' | 'explicit_matches_default';
  jestPatterns: string[];
  vitestPatterns: string[];
  jestIsDefault: boolean;
  vitestIsDefault: boolean;
}

/**
 * Detects if there's a pattern conflict between Jest and Vitest configs
 * that would make it impossible to determine which framework to use for a test file.
 */
export function detectPatternConflict(
  jestConfig: TestPatterns | undefined,
  vitestConfig: TestPatterns | undefined,
): PatternConflictInfo {
  const jestPatterns = getEffectivePatterns(jestConfig);
  const vitestPatterns = getEffectivePatterns(vitestConfig);
  const jestIsDefault = !jestConfig || jestConfig.patterns.length === 0;
  const vitestIsDefault = !vitestConfig || vitestConfig.patterns.length === 0;

  const baseInfo = {
    jestPatterns,
    vitestPatterns,
    jestIsDefault,
    vitestIsDefault,
  };

  // Case 1: Both use default patterns
  if (jestIsDefault && vitestIsDefault) {
    return {
      ...baseInfo,
      hasConflict: true,
      reason: 'both_default',
    };
  }

  // Case 2: Both have explicit patterns that are the same
  if (!jestIsDefault && !vitestIsDefault && patternsAreEqual(jestPatterns, vitestPatterns)) {
    return {
      ...baseInfo,
      hasConflict: true,
      reason: 'both_same_explicit',
    };
  }

  // Case 3: One has explicit patterns that match the other's default
  if (!jestIsDefault && vitestIsDefault && isDefaultPatterns(jestPatterns)) {
    return {
      ...baseInfo,
      hasConflict: true,
      reason: 'explicit_matches_default',
    };
  }
  if (jestIsDefault && !vitestIsDefault && isDefaultPatterns(vitestPatterns)) {
    return {
      ...baseInfo,
      hasConflict: true,
      reason: 'explicit_matches_default',
    };
  }

  return {
    ...baseInfo,
    hasConflict: false,
  };
}

/**
 * Shows a warning to the user about pattern conflicts.
 * Only shows the warning once per directory to avoid spam.
 */
export function showPatternConflictWarning(
  directoryPath: string,
  conflictInfo: PatternConflictInfo,
): void {
  if (warnedDirectories.has(directoryPath)) {
    return;
  }
  warnedDirectories.add(directoryPath);

  let message: string;
  switch (conflictInfo.reason) {
    case 'both_default':
      message = `Both Jest and Vitest detected in "${directoryPath}" but neither has explicit test patterns. Cannot determine which framework to use for test files.`;
      break;
    case 'both_same_explicit':
      message = `Both Jest and Vitest detected in "${directoryPath}" with identical test patterns. Cannot determine which framework to use for test files.`;
      break;
    case 'explicit_matches_default':
      message = `Both Jest and Vitest detected in "${directoryPath}" with overlapping test patterns (one explicit, one default). Cannot determine which framework to use for test files.`;
      break;
    default:
      return;
  }

  const suggestion = 'Configure distinct testMatch/testRegex (Jest) or test.include (Vitest) patterns to resolve this.';
  const fullMessage = `${message} ${suggestion}`;

  logWarning(fullMessage);

  vscode.window.showWarningMessage(
    fullMessage,
    'Open Output',
    'Configure Settings',
  ).then(selection => {
    if (selection === 'Open Output') {
      getOutputChannel().show();
    } else if (selection === 'Configure Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'jestrunner');
    }
  });

  logDebug(`Pattern conflict details: Jest patterns=[${conflictInfo.jestPatterns.join(', ')}] (default=${conflictInfo.jestIsDefault}), Vitest patterns=[${conflictInfo.vitestPatterns.join(', ')}] (default=${conflictInfo.vitestIsDefault})`);
}

/**
 * Clears the warned directories cache.
 * Useful for testing or when user changes configuration.
 */
export function clearPatternConflictWarnings(): void {
  warnedDirectories.clear();
}

/**
 * Checks if a warning has already been shown for a directory.
 * Useful for testing.
 */
export function hasWarnedForDirectory(directoryPath: string): boolean {
  return warnedDirectories.has(directoryPath);
}
