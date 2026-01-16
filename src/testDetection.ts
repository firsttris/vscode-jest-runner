import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logError, logWarning } from './util';

const testDetectionCache = new Map<string, boolean>();

const viteConfigFiles = [
  'vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts', 'vite.config.cjs', 'vite.config.cts'
];

export function viteConfigHasTestAttribute(configPath: string): boolean {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return /\btest\s*[:=]/.test(content);
  } catch (error) {
    logError(`Error reading vite config file: ${configPath}`, error);
    return false;
  }
}

const vitestDetectionCache = new Map<string, boolean>();

export function clearTestDetectionCache(): void {
  testDetectionCache.clear();
}

export function clearVitestDetectionCache(): void {
  vitestDetectionCache.clear();
}

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
    configFiles: [
      'vitest.config.js', 'vitest.config.ts', 'vitest.config.mjs', 'vitest.config.mts', 'vitest.config.cjs', 'vitest.config.cts'
    ],
    binaryName: 'vitest',
  },
];

export type TestFrameworkName = 'jest' | 'vitest' | 'cypress' | 'playwright';

function isFrameworkUsedIn(directoryPath: string, frameworkName: string, cache: Map<string, boolean>): boolean {
  if (cache.has(directoryPath)) {
    return cache.get(directoryPath)!;
  }

  try {
    const framework = testFrameworks.find((f) => f.name === frameworkName);
    if (!framework) {
      return false;
    }

    const possibleBinaryPaths = [
      path.join(directoryPath, 'node_modules', '.bin', framework.binaryName),
      path.join(directoryPath, 'node_modules', '.bin', `${framework.binaryName}.cmd`),
    ];

    for (const binPath of possibleBinaryPaths) {
      if (fs.existsSync(binPath)) {
        cache.set(directoryPath, true);
        return true;
      }
    }

    for (const configFile of framework.configFiles) {
      if (fs.existsSync(path.join(directoryPath, configFile))) {
        cache.set(directoryPath, true);
        return true;
      }
    }

    if (frameworkName === 'vitest') {
      for (const viteConfig of viteConfigFiles) {
        const viteConfigPath = path.join(directoryPath, viteConfig);
        if (fs.existsSync(viteConfigPath) && viteConfigHasTestAttribute(viteConfigPath)) {
          cache.set(directoryPath, true);
          return true;
        }
      }
    }

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

    cache.set(directoryPath, false);
    return false;
  } catch (error) {
    logError(`Error checking for ${frameworkName}`, error);
    return false;
  }
}

export function isJestUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'jest', testDetectionCache);
}

export function isVitestUsedIn(directoryPath: string): boolean {
  return isFrameworkUsedIn(directoryPath, 'vitest', vitestDetectionCache);
}

export function detectTestFramework(directoryPath: string): TestFrameworkName | undefined {
  const packageJsonPath = path.join(directoryPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

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

  const configOrder = ['vitest', 'jest', 'cypress', 'playwright'];
  for (const frameworkName of configOrder) {
    const framework = testFrameworks.find((f) => f.name === frameworkName);
    if (framework) {
      for (const configFile of framework.configFiles) {
        if (fs.existsSync(path.join(directoryPath, configFile))) {
          return framework.name as TestFrameworkName;
        }
      }
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

export function findTestFrameworkDirectory(filePath: string, targetFramework?: 'jest' | 'vitest'): { directory: string; framework: TestFrameworkName } | undefined {
  let currentDir = path.dirname(filePath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));

  if (!workspaceFolder) return undefined;

  const rootPath = workspaceFolder.uri.fsPath;

  while (currentDir && currentDir.startsWith(rootPath)) {
    const framework = detectTestFramework(currentDir);

    if (framework) {
      if (targetFramework) {
        if (framework === targetFramework) {
          return { directory: currentDir, framework };
        }
        return undefined;
      } else {
        if (framework === 'jest' || framework === 'vitest') {
          return { directory: currentDir, framework };
        }
        return undefined;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  if (targetFramework) {
    if (targetFramework === 'jest' && isJestUsedIn(rootPath)) {
      return { directory: rootPath, framework: 'jest' };
    }
    if (targetFramework === 'vitest' && isVitestUsedIn(rootPath)) {
      return { directory: rootPath, framework: 'vitest' };
    }
  } else {
    if (isVitestUsedIn(rootPath)) {
      return { directory: rootPath, framework: 'vitest' };
    }
    if (isJestUsedIn(rootPath)) {
      return { directory: rootPath, framework: 'jest' };
    }
  }

  return undefined;
}

export function findJestDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'jest');
  return result?.directory;
}

export function findVitestDirectory(filePath: string): string | undefined {
  const result = findTestFrameworkDirectory(filePath, 'vitest');
  return result?.directory;
}

export function isJestTestFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const testPattern = /\.(test|spec)\.(js|jsx|ts|tsx)$/i;

  if (!testPattern.test(fileName)) {
    return false;
  }

  return !!findJestDirectory(filePath);
}

export function isVitestTestFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const testPattern = /\.(test|spec)\.(js|jsx|ts|tsx)$/i;

  if (!testPattern.test(fileName)) {
    return false;
  }

  return !!findVitestDirectory(filePath);
}

export function isTestFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const testPattern = /\.(test|spec)\.(js|jsx|ts|tsx)$/i;

  if (!testPattern.test(fileName)) {
    return false;
  }

  return !!findTestFrameworkDirectory(filePath);
}

export function getTestFrameworkForFile(filePath: string): TestFrameworkName | undefined {
  const result = findTestFrameworkDirectory(filePath);
  return result?.framework;
}
