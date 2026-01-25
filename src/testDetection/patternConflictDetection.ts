import * as vscode from 'vscode';
import * as path from 'path';
import { logWarning, logDebug, getOutputChannel } from '../util';
import { DEFAULT_TEST_PATTERNS, TestPatterns } from './frameworkDefinitions';
import { getTestMatchFromJestConfig, getVitestConfig, getConfigPath } from './configParsing';
import * as mm from 'micromatch';

// Track which directories have already shown a warning to avoid spam
const warnedDirectories = new Set<string>();

// File watcher for config changes
let configWatcher: vscode.FileSystemWatcher | undefined;

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


  // Case 3: One has explicit patterns that match or overlap the other's default
  const vitestDefaultPatterns = DEFAULT_TEST_PATTERNS;
  if (!jestIsDefault && vitestIsDefault) {
    // Check if any Jest pattern matches any Vitest default pattern via glob
    const overlap = jestPatterns.some(jp =>
      vitestDefaultPatterns.some(vp => mm.isMatch(jp, vp) || mm.isMatch(vp, jp))
    );
    if (overlap) {
      return {
        ...baseInfo,
        hasConflict: true,
        reason: 'explicit_matches_default',
      };
    }
  }
  if (jestIsDefault && !vitestIsDefault) {
    const overlap = vitestPatterns.some(vp =>
      vitestDefaultPatterns.some(dp => mm.isMatch(vp, dp) || mm.isMatch(dp, vp))
    );
    if (overlap) {
      return {
        ...baseInfo,
        hasConflict: true,
        reason: 'explicit_matches_default',
      };
    }
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
export async function showPatternConflictWarning(
  directoryPath: string,
  conflictInfo: PatternConflictInfo,
  jestConfigPath?: string,
  vitestConfigPath?: string,
): Promise<void> {
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

  const suggestion = 'Configure distinct testMatch (Jest) or test.include (Vitest) patterns to resolve this.';
  const fullMessage = `${message} ${suggestion}`;

  logWarning(fullMessage);

  const buttons = ['Open Output'];
  if (jestConfigPath) buttons.push('Open Jest Config');
  if (vitestConfigPath) buttons.push('Open Vitest Config');

  const selection = await vscode.window.showWarningMessage(
    fullMessage,
    ...buttons,
  );
  if (selection === 'Open Output') {
    getOutputChannel().show();
  } else if (selection === 'Open Jest Config' && jestConfigPath) {
    const uri = vscode.Uri.file(jestConfigPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  } else if (selection === 'Open Vitest Config' && vitestConfigPath) {
    const uri = vscode.Uri.file(vitestConfigPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  }

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

/**
 * Handles config file changes by clearing the warning for that directory and re-checking for conflicts.
 */
async function onConfigFileChanged(uri: vscode.Uri): Promise<void> {
  const directoryPath = path.dirname(uri.fsPath);
  clearPatternConflictWarnings();
  // Immediately re-check for conflicts after clearing the warning
  await checkAndShowPatternConflictForDirectory(directoryPath);
}

/**
 * Checks for pattern conflicts in a directory and shows warning if needed.
 * Called when config files change to immediately re-evaluate conflicts.
 */
export async function checkAndShowPatternConflictForDirectory(directoryPath: string): Promise<void> {
  const jestConfigPath = getConfigPath(directoryPath, 'jest');
  const vitestConfigPath = getConfigPath(directoryPath, 'vitest');

  if (!jestConfigPath && !vitestConfigPath) {
    return; // No configs, no conflict possible
  }

  const jestConfig = jestConfigPath ? getTestMatchFromJestConfig(jestConfigPath) : undefined;
  const vitestConfig = vitestConfigPath ? getVitestConfig(vitestConfigPath) : undefined;

  const conflictInfo = detectPatternConflict(jestConfig, vitestConfig);
  if (conflictInfo.hasConflict) {
    await showPatternConflictWarning(directoryPath, conflictInfo, jestConfigPath, vitestConfigPath);
  }
}

/**
 * Initializes the file watcher for Jest and Vitest config files.
 * Should be called once during extension activation.
 */
export function initConfigFileWatcher(): vscode.Disposable {
  if (configWatcher) {
    configWatcher.dispose();
  }

  // Watch for Jest and Vitest config files
  const configPattern = '**/{jest.config,vitest.config,vite.config}.{js,ts,mjs,mts,cjs,cts,json}';
  configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);

  configWatcher.onDidChange(onConfigFileChanged);
  configWatcher.onDidCreate(onConfigFileChanged);
  configWatcher.onDidDelete(onConfigFileChanged);

  logDebug('Initialized config file watcher for pattern conflict detection');

  return {
    dispose: () => {
      if (configWatcher) {
        configWatcher.dispose();
        configWatcher = undefined;
      }
    },
  };
}

/**
 * Disposes the config file watcher.
 */
export function disposeConfigFileWatcher(): void {
  if (configWatcher) {
    configWatcher.dispose();
    configWatcher = undefined;
  }
}
