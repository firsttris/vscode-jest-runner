import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Cache for Jest detection results
const jestDetectionCache = new Map<string, boolean>();

/**
 * Clears the Jest detection cache (useful for testing)
 */
export function clearJestDetectionCache(): void {
  jestDetectionCache.clear();
}

// Define test frameworks and their config files
interface TestFramework {
  name: string;
  configFiles: string[];
}

const testFrameworks: TestFramework[] = [
  {
    name: 'jest',
    configFiles: ['jest.config.js', 'jest.config.ts', 'jest.config.json'],
  },
  {
    name: 'cypress',
    configFiles: ['cypress.config.js', 'cypress.config.ts', 'cypress.json'],
  },
  {
    name: 'playwright',
    configFiles: ['playwright.config.js', 'playwright.config.ts'],
  },
  {
    name: 'vitest',
    configFiles: ['vitest.config.js', 'vitest.config.ts'],
  },
];

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
    const jestFramework = testFrameworks.find((f) => f.name === 'jest')!;
    for (const configFile of jestFramework.configFiles) {
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
 * Detects which test framework is used in a directory
 * @returns Framework name or undefined if none detected
 */
function detectTestFramework(directoryPath: string): string | undefined {
  // Check package.json first for any framework
  const packageJsonPath = path.join(directoryPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Check for framework entries in dependencies or config
      for (const framework of testFrameworks) {
        if (
          packageJson.dependencies?.[framework.name] ||
          packageJson.devDependencies?.[framework.name] ||
          packageJson.peerDependencies?.[framework.name] ||
          packageJson[framework.name]
        ) {
          return framework.name;
        }
      }
    } catch (error) {
      console.error('Error parsing package.json:', error);
    }
  }

  // Check for config files
  for (const framework of testFrameworks) {
    for (const configFile of framework.configFiles) {
      if (fs.existsSync(path.join(directoryPath, configFile))) {
        return framework.name;
      }
    }
  }

  // Check for binaries
  if (
    fs.existsSync(path.join(directoryPath, 'node_modules', '.bin', 'jest')) ||
    fs.existsSync(path.join(directoryPath, 'node_modules', '.bin', 'jest.cmd'))
  ) {
    return 'jest';
  }

  return undefined;
}

/**
 * Finds the nearest directory containing Jest (going up the directory tree)
 * Takes into account other test frameworks that might be closer to the file
 */
export function findJestDirectory(filePath: string): string | undefined {
  let currentDir = path.dirname(filePath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));

  if (!workspaceFolder) return undefined;

  const rootPath = workspaceFolder.uri.fsPath;

  // Walk up directories until we find a test framework or reach workspace root
  while (currentDir && currentDir.startsWith(rootPath)) {
    const framework = detectTestFramework(currentDir);

    if (framework) {
      // If we found a non-Jest framework that's closer to the file than Jest,
      // then this file is not a Jest test
      if (framework !== 'jest') {
        return undefined;
      }

      // If we found Jest, return this directory
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
