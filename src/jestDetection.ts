import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Cache for Jest detection results
const jestDetectionCache = new Map<string, boolean>();

/**
 * Checks if Jest is used in the specified directory
 */
export function isJestUsedIn(directoryPath: string): boolean {
  // Return cached result if available
  if (jestDetectionCache.has(directoryPath)) {
    return jestDetectionCache.get(directoryPath)!;
  }

  try {
    // Check for Jest binary (fastest and most reliable check)
    const possibleBinaryPaths = [
      path.join(directoryPath, 'node_modules', '.bin', 'jest'),
      path.join(directoryPath, 'node_modules', '.bin', 'jest.cmd'), // For Windows
    ];

    for (const binPath of possibleBinaryPaths) {
      if (fs.existsSync(binPath)) {
        jestDetectionCache.set(directoryPath, true);
        return true;
      }
    }

    // Check for Jest config files
    const configFiles = ['jest.config.js', 'jest.config.ts', 'jest.config.json'];
    for (const configFile of configFiles) {
      if (fs.existsSync(path.join(directoryPath, configFile))) {
        jestDetectionCache.set(directoryPath, true);
        return true;
      }
    }

    // Check package.json
    const packageJsonPath = path.join(directoryPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      if (
        packageJson.dependencies?.jest ||
        packageJson.devDependencies?.jest ||
        packageJson.peerDependencies?.jest ||
        packageJson.jest
      ) {
        jestDetectionCache.set(directoryPath, true);
        return true;
      }
    }

    // Not found
    jestDetectionCache.set(directoryPath, false);
    return false;
  } catch (error) {
    console.error('Error checking for Jest:', error);
    return false;
  }
}

/**
 * Finds the nearest directory containing Jest (going up the directory tree)
 */
export function findJestDirectory(filePath: string): string | undefined {
  let currentDir = path.dirname(filePath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));

  if (!workspaceFolder) return undefined;

  const rootPath = workspaceFolder.uri.fsPath;

  // Walk up directories until we find Jest or reach workspace root
  while (currentDir && currentDir.startsWith(rootPath)) {
    if (isJestUsedIn(currentDir)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Check workspace root as last resort
  if (isJestUsedIn(rootPath)) {
    return rootPath;
  }

  return undefined;
}

/**
 * Checks if a file is a Jest test file
 */
export function isJestTestFile(filePath: string): boolean {
  // Quick pattern check first
  const fileName = path.basename(filePath);
  const testPattern = /\.(test|spec)\.(js|jsx|ts|tsx)$/i;

  if (!testPattern.test(fileName)) {
    return false;
  }

  // Then check if it's in a Jest directory
  return !!findJestDirectory(filePath);
}
