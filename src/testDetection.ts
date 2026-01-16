import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logError, logWarning } from './util';

// Cache for Jest detection results
const testDetectionCache = new Map<string, boolean>();

// Vite config files that need to be checked for test attribute
const viteConfigFiles = [
  'vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts', 'vite.config.cjs', 'vite.config.cts'
];

/**
 * Checks if a vite config file contains a test attribute (indicating Vitest usage)
 * This is a simple heuristic check that looks for 'test:' or 'test :' pattern in the file
 */
export function viteConfigHasTestAttribute(configPath: string): boolean {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    // Look for test attribute in the config - can be 'test:' or 'test :' (with space before colon)
    // Also handles cases like 'test: {' or '  test:'
    return /\btest\s*[:=]/.test(content);
  } catch (error) {
    logError(`Error reading vite config file: ${configPath}`, error);
    return false;
  }
}

// Cache for Vitest detection results
const vitestDetectionCache = new Map<string, boolean>();

/**
 * Clears the Jest detection cache (useful for testing)
 */
export function clearTestDetectionCache(): void {
  testDetectionCache.clear();
}

/**
 * Clears the Vitest detection cache (useful for testing)
 */
export function clearVitestDetectionCache(): void {
  vitestDetectionCache.clear();
}

// Define test frameworks and their config files
interface TestFramework {
  name: string;
  configFiles: string[];
  binaryName: string;
}

const testFrameworks: TestFramework[] = [
  {
    name: 'jest',
    configFiles: ['jest.config.js', 'jest.config.ts', 'jest.config.json', 'jest.config.cjs', 'jest.config.mjs'],
    binaryName: 'jest',
  },
  {
    name: 'cypress',
    configFiles: ['cypress.config.js', 'cypress.config.ts', 'cypress.json'],
    binaryName: 'cypress',
  },
  {
    name: 'playwright',
    configFiles: ['playwright.config.js', 'playwright.config.ts'],
    binaryName: 'playwright',
  },
  {
    name: 'vitest',
    // Vitest config can be in vitest.config.* - vite.config.* is checked separately for test attribute
    configFiles: [
      'vitest.config.js', 'vitest.config.ts', 'vitest.config.mjs', 'vitest.config.mts', 'vitest.config.cjs', 'vitest.config.cts'
    ],
    binaryName: 'vitest',
  },
];

export type TestFrameworkName = 'jest' | 'vitest' | 'cypress' | 'playwright';

/**
 * Checks if a specific test framework is used in the specified directory
 */
function isFrameworkUsedIn(directoryPath: string, frameworkName: string, cache: Map<string, boolean>): boolean {
  // Return cached result if available
  if (cache.has(directoryPath)) {
    return cache.get(directoryPath)!;
  }

  try {
    const framework = testFrameworks.find((f) => f.name === frameworkName);
    if (!framework) {
      return false;
    }

    // Check for binary (fastest and most reliable check)
    const possibleBinaryPaths = [
      path.join(directoryPath, 'node_modules', '.bin', framework.binaryName),
      path.join(directoryPath, 'node_modules', '.bin', `${framework.binaryName}.cmd`), // For Windows
    ];

    for (const binPath of possibleBinaryPaths) {
      if (fs.existsSync(binPath)) {
        cache.set(directoryPath, true);
        return true;
      }
    }

    // Check for config files
    for (const configFile of framework.configFiles) {
      if (fs.existsSync(path.join(directoryPath, configFile))) {
        cache.set(directoryPath, true);
        return true;
      }
    }

    // Special case for Vitest: check vite.config.* files for test attribute
    if (frameworkName === 'vitest') {
      for (const viteConfig of viteConfigFiles) {
        const viteConfigPath = path.join(directoryPath, viteConfig);
        if (fs.existsSync(viteConfigPath) && viteConfigHasTestAttribute(viteConfigPath)) {
          cache.set(directoryPath, true);
          return true;
        }
      }
    }

    // Check package.json
    const packageJsonPath = path.join(directoryPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        if (
          packageJson.dependencies?.[frameworkName] ||
          packageJson.devDependencies?.[frameworkName] ||
          packageJson.peerDependencies?.[frameworkName] ||
          packageJson[frameworkName]
        ) {
          cache.set(directoryPath, true);
          return true;
        }
      } catch (error) {
        logError(`Error parsing package.json for ${frameworkName}`, error);
      }
    }

    // Not found
    cache.set(directoryPath, false);
    return false;
  } catch (error) {
    logError(`Error checking for ${frameworkName}`, error);
    return false;
  }
}

/**
 * Checks if Jest is used in the specified directory
 */
export function isJestUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'jest', testDetectionCache);
}

/**
 * Checks if Vitest is used in the specified directory
 */
export function isVitestUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'vitest', vitestDetectionCache);
}

/**
 * Detects which test framework is used in a directory
 * @returns Framework name or undefined if none detected
 */
export function detectTestFramework(directoryPath: string): TestFrameworkName | undefined {
  // Check package.json first for any framework
  const packageJsonPath = path.join(directoryPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Check for framework entries in dependencies or config
      // Prioritize vitest if both are present since vitest is often used with vite
      const frameworkOrder = ['vitest', 'jest', 'cypress', 'playwright'];
      for (const frameworkName of frameworkOrder) {
        const framework = testFrameworks.find((f) => f.name === frameworkName);
        if (
          framework &&
          (packageJson.dependencies?.[framework.name] ||
          packageJson.devDependencies?.[framework.name] ||
          packageJson.peerDependencies?.[framework.name] ||
          packageJson[framework.name])
        ) {
          return framework.name as TestFrameworkName;
        }
      }
    } catch (error) {
      logError('Error parsing package.json', error);
    }
  }

  // Check for config files - prioritize vitest
  const configOrder = ['vitest', 'jest', 'cypress', 'playwright'];
  for (const frameworkName of configOrder) {
    const framework = testFrameworks.find((f) => f.name === frameworkName);
    if (framework) {
      for (const configFile of framework.configFiles) {
        if (fs.existsSync(path.join(directoryPath, configFile))) {
          return framework.name as TestFrameworkName;
        }
      }
      // Special case for Vitest: check vite.config.* files for test attribute
      if (frameworkName === 'vitest') {
        for (const viteConfig of viteConfigFiles) {
          const viteConfigPath = path.join(directoryPath, viteConfig);
          if (fs.existsSync(viteConfigPath) && viteConfigHasTestAttribute(viteConfigPath)) {
            return 'vitest';
          }
        }
      }
    }
  }

  // Check for binaries
  for (const framework of testFrameworks) {
    if (
      fs.existsSync(path.join(directoryPath, 'node_modules', '.bin', framework.binaryName)) ||
      fs.existsSync(path.join(directoryPath, 'node_modules', '.bin', `${framework.binaryName}.cmd`))
    ) {
      return framework.name as TestFrameworkName;
    }
  }

  return undefined;
}

/**
 * Finds the nearest directory containing a supported test framework (going up the directory tree)
 * Takes into account other test frameworks that might be closer to the file
 * @param filePath The file path to check
 * @param targetFramework Optional: specific framework to look for ('jest' or 'vitest'). If not provided, returns any supported framework.
 */
export function findTestFrameworkDirectory(filePath: string, targetFramework?: 'jest' | 'vitest'): { directory: string; framework: TestFrameworkName } | undefined {
  let currentDir = path.dirname(filePath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));

  if (!workspaceFolder) return undefined;

  const rootPath = workspaceFolder.uri.fsPath;

  // Walk up directories until we find a test framework or reach workspace root
  while (currentDir && currentDir.startsWith(rootPath)) {
    const framework = detectTestFramework(currentDir);

    if (framework) {
      // If we're looking for a specific framework
      if (targetFramework) {
        if (framework === targetFramework) {
          return { directory: currentDir, framework };
        }
        // If we found a different framework, this file doesn't belong to target framework
        return undefined;
      } else {
        // Return any supported framework (jest or vitest)
        if (framework === 'jest' || framework === 'vitest') {
          return { directory: currentDir, framework };
        }
        // Found a non-supported framework, file doesn't belong to us
        return undefined;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Check workspace root as last resort
  if (targetFramework) {
    if (targetFramework === 'jest' && isJestUsedIn(rootPath)) {
      return { directory: rootPath, framework: 'jest' };
    }
    if (targetFramework === 'vitest' && isVitestUsedIn(rootPath)) {
      return { directory: rootPath, framework: 'vitest' };
    }
  } else {
    // Check for vitest first, then jest
    if (isVitestUsedIn(rootPath)) {
      return { directory: rootPath, framework: 'vitest' };
    }
    if (isJestUsedIn(rootPath)) {
      return { directory: rootPath, framework: 'jest' };
    }
  }

  return undefined;
}

/**
 * Finds the nearest directory containing Jest (going up the directory tree)
 * Takes into account other test frameworks that might be closer to the file
 * @deprecated Use findTestFrameworkDirectory instead
 */
export function findJestDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'jest');
  return result?.directory;
}

/**
 * Finds the nearest directory containing Vitest (going up the directory tree)
 */
export function findVitestDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'vitest');
  return result?.directory;
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

/**
 * Checks if a file is a Vitest test file
 */
export function isVitestTestFile(filePath: string): boolean {
  // Quick pattern check first
  const fileName = path.basename(filePath);
  const testPattern = /\.(test|spec)\.(js|jsx|ts|tsx)$/i;

  if (!testPattern.test(fileName)) {
    return false;
  }

  // Then check if it's in a Vitest directory
  return !!findVitestDirectory(filePath);
}

/**
 * Checks if a file is a test file (Jest or Vitest)
 */
export function isTestFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const testPattern = /\.(test|spec)\.(js|jsx|ts|tsx)$/i;

  if (!testPattern.test(fileName)) {
    return false;
  }

  return !!findTestFrameworkDirectory(filePath);
}

/**
 * Gets the test framework for a specific file
 */
export function getTestFrameworkForFile(filePath: string): TestFrameworkName | undefined {
  const result = findTestFrameworkDirectory(filePath);
  return result?.framework;
}
