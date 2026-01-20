import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mm from 'micromatch';
import { logError, logDebug, resolveConfigPathOrMapping } from './util';

const testDetectionCache = new Map<string, boolean>();

const viteConfigFiles = [
  'vite.config.js',
  'vite.config.ts',
  'vite.config.mjs',
  'vite.config.mts',
  'vite.config.cjs',
  'vite.config.cts',
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
    configFiles: [
      'jest.config.js',
      'jest.config.ts',
      'jest.config.json',
      'jest.config.cjs',
      'jest.config.mjs',
    ],
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
      'vitest.config.js',
      'vitest.config.ts',
      'vitest.config.mjs',
      'vitest.config.mts',
      'vitest.config.cjs',
      'vitest.config.cts',
    ],
    binaryName: 'vitest',
  },
];

export type TestFrameworkName = 'jest' | 'vitest' | 'cypress' | 'playwright';

function isFrameworkUsedIn(
  directoryPath: string,
  frameworkName: string,
  cache: Map<string, boolean>,
): boolean {
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
      path.join(
        directoryPath,
        'node_modules',
        '.bin',
        `${framework.binaryName}.cmd`,
      ),
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
        if (
          fs.existsSync(viteConfigPath) &&
          viteConfigHasTestAttribute(viteConfigPath)
        ) {
          cache.set(directoryPath, true);
          return true;
        }
      }
    }

    const packageJsonPath = path.join(directoryPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8'),
        );

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

export function detectTestFramework(
  directoryPath: string,
): TestFrameworkName | undefined {
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
          if (
            fs.existsSync(viteConfigPath) &&
            viteConfigHasTestAttribute(viteConfigPath)
          ) {
            return 'vitest';
          }
        }
      }
    }
  }

  for (const framework of testFrameworks) {
    if (
      fs.existsSync(
        path.join(directoryPath, 'node_modules', '.bin', framework.binaryName),
      ) ||
      fs.existsSync(
        path.join(
          directoryPath,
          'node_modules',
          '.bin',
          `${framework.binaryName}.cmd`,
        ),
      )
    ) {
      return framework.name as TestFrameworkName;
    }
  }

  return undefined;
}

export function findTestFrameworkDirectory(
  filePath: string,
  targetFramework?: 'jest' | 'vitest',
): { directory: string; framework: TestFrameworkName } | undefined {
  let currentDir = path.dirname(filePath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(filePath),
  );

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

export function getTestMatchFromJestConfig(
  configPath: string,
): string[] | undefined {
  try {
    const content = fs.readFileSync(configPath, 'utf8');

    const testMatchStart = content.indexOf('testMatch');
    if (testMatchStart !== -1) {
      const arrayStart = content.indexOf('[', testMatchStart);
      if (arrayStart !== -1) {
        let bracketCount = 1;
        let arrayEnd = arrayStart + 1;
        while (arrayEnd < content.length && bracketCount > 0) {
          const char = content[arrayEnd];
          if (char === '[') bracketCount++;
          else if (char === ']') bracketCount--;
          arrayEnd++;
        }

        if (bracketCount === 0) {
          const arrayContent = content.substring(arrayStart + 1, arrayEnd - 1);
          const patterns: string[] = [];
          const stringRegex = /['"`]((?:\\.|[^'"`\\])*?)['"`]/g;
          let stringMatch;
          while ((stringMatch = stringRegex.exec(arrayContent)) !== null) {
            patterns.push(stringMatch[1]);
          }
          if (patterns.length > 0) {
            logDebug(
              `Found testMatch patterns in ${configPath}: ${patterns.join(', ')}`,
            );
            return patterns;
          }
        }
      }
    }

    if (configPath.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(content);
        if (pkg.jest?.testMatch) {
          return Array.isArray(pkg.jest.testMatch)
            ? pkg.jest.testMatch
            : undefined;
        }
      } catch {
      }
    }

    return undefined;
  } catch (error) {
    logError(`Error reading Jest config file: ${configPath}`, error);
    return undefined;
  }
}

export function getIncludeFromVitestConfig(
  configPath: string,
): string[] | undefined {
  try {
    const content = fs.readFileSync(configPath, 'utf8');

    const testBlockRegex = /test\s*:\s*\{/;
    const testBlockMatch = content.match(testBlockRegex);

    if (!testBlockMatch) {
      return undefined;
    }

    let startIndex = testBlockMatch.index! + testBlockMatch[0].length;
    let braceDepth = 1;
    let endIndex = startIndex;

    for (let i = startIndex; i < content.length && braceDepth > 0; i++) {
      if (content[i] === '{') {
        braceDepth++;
      } else if (content[i] === '}') {
        braceDepth--;
      }
      if (braceDepth === 0) {
        endIndex = i;
        break;
      }
    }

    const testBlockContent = content.substring(startIndex, endIndex);

    const includeRegex = /include\s*:\s*\[([^\]]*)\]/;
    const includeMatch = testBlockContent.match(includeRegex);

    if (includeMatch) {
      const arrayContent = includeMatch[1];
      const patterns: string[] = [];
      const stringRegex = /['"`]((?:\\.|[^'"`\\])*?)['"`]/g;
      let stringMatch;
      while ((stringMatch = stringRegex.exec(arrayContent)) !== null) {
        patterns.push(stringMatch[1]);
      }
      if (patterns.length > 0) {
        logDebug(
          `Found include patterns in ${configPath}: ${patterns.join(', ')}`,
        );
        return patterns;
      }
    }

    return undefined;
  } catch (error) {
    logError(`Error reading Vitest config file: ${configPath}`, error);
    return undefined;
  }
}

function getTestFilePatternsForFile(filePath: string): {
	patterns: string[];
	configDir: string;
} {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(
		vscode.Uri.file(filePath),
	);
	if (!workspaceFolder) {
		return {
			patterns: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
			configDir: path.dirname(filePath),
		};
	}

	let currentDir = path.dirname(filePath);
	const rootPath = workspaceFolder.uri.fsPath;

	const customJestConfigPath = vscode.workspace
		.getConfiguration()
		.get('jestrunner.configPath') as string | Record<string, string> | undefined;
	const customVitestConfigPath = vscode.workspace
		.getConfiguration()
		.get('jestrunner.vitestConfigPath') as string | Record<string, string> | undefined;

	const resolvedJestConfigPath = resolveConfigPathOrMapping(customJestConfigPath, filePath);
	const resolvedVitestConfigPath = resolveConfigPathOrMapping(customVitestConfigPath, filePath);

	if (resolvedJestConfigPath) {
		const customConfigFullPath = path.resolve(rootPath, resolvedJestConfigPath);
		if (fs.existsSync(customConfigFullPath)) {
			const patterns = getTestMatchFromJestConfig(customConfigFullPath);
			if (patterns) {
				return { patterns, configDir: path.dirname(customConfigFullPath) };
			}
		}
	}

	if (resolvedVitestConfigPath) {
		const customConfigFullPath = path.resolve(rootPath, resolvedVitestConfigPath);
		if (fs.existsSync(customConfigFullPath)) {
			const patterns = getIncludeFromVitestConfig(customConfigFullPath);
			if (patterns) {
				return { patterns, configDir: path.dirname(customConfigFullPath) };
			}
		}
	}

	while (currentDir && currentDir.startsWith(rootPath)) {
		const framework = detectTestFramework(currentDir);

		if (framework === 'jest') {
			const jestConfigFiles = [
				'jest.config.js',
				'jest.config.ts',
				'jest.config.json',
				'jest.config.cjs',
				'jest.config.mjs',
			];
			for (const configFile of jestConfigFiles) {
				const configPath = path.join(currentDir, configFile);
				if (fs.existsSync(configPath)) {
					const patterns = getTestMatchFromJestConfig(configPath);
					if (patterns) {
						return { patterns, configDir: currentDir };
					}
				}
			}

			const packageJsonPath = path.join(currentDir, 'package.json');
			if (fs.existsSync(packageJsonPath)) {
				const patterns = getTestMatchFromJestConfig(packageJsonPath);
				if (patterns) {
					return { patterns, configDir: currentDir };
				}
			}

			break;
		} else if (framework === 'vitest') {
			const vitestConfigFiles = [
				'vitest.config.js',
				'vitest.config.ts',
				'vitest.config.mjs',
				'vitest.config.mts',
				'vitest.config.cjs',
				'vitest.config.cts',
				'vite.config.js',
				'vite.config.ts',
				'vite.config.mjs',
				'vite.config.mts',
				'vite.config.cjs',
				'vite.config.cts',
			];
			for (const configFile of vitestConfigFiles) {
				const configPath = path.join(currentDir, configFile);
				if (fs.existsSync(configPath)) {
					const patterns = getIncludeFromVitestConfig(configPath);
					if (patterns) {
						return { patterns, configDir: currentDir };
					}
				}
			}

			break;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) break;
		currentDir = parentDir;
	}

	return {
		patterns: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
		configDir: rootPath,
	};
}

export function hasValidCustomConfig(
	configPath: string | undefined,
	frameworkType: 'jest' | 'vitest',
): boolean {
	if (!configPath) {
		return false;
	}

	if (!fs.existsSync(configPath)) {
		return false;
	}

	if (frameworkType === 'jest') {
		const patterns = getTestMatchFromJestConfig(configPath);
		return !!patterns && patterns.length > 0;
	} else {
		const patterns = getIncludeFromVitestConfig(configPath);
		return !!patterns && patterns.length > 0;
	}
}

export function matchesTestFilePattern(filePath: string): boolean {
	const { patterns, configDir } = getTestFilePatternsForFile(filePath);

	let pathToMatch = path.relative(configDir, filePath);

	pathToMatch = pathToMatch.replace(/\\/g, '/');

  for (const pattern of patterns) {
    if (mm.isMatch(pathToMatch, pattern, { nocase: true })) {
      return true;
    }
  }

  return false;
}

export function isJestTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasJestDir = !!findJestDirectory(filePath);
  
  const customJestConfigPath = vscode.workspace
    .getConfiguration()
    .get('jestrunner.configPath') as string | Record<string, string> | undefined;
  
  const resolvedConfigPath = resolveConfigPathOrMapping(customJestConfigPath, filePath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  const fullConfigPath = resolvedConfigPath && workspaceFolder
    ? path.resolve(workspaceFolder.uri.fsPath, resolvedConfigPath)
    : undefined;
  const hasCustomConfig = hasValidCustomConfig(fullConfigPath, 'jest');
  
  return hasJestDir || hasCustomConfig;
}

export function isVitestTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasVitestDir = !!findVitestDirectory(filePath);
  
  const customVitestConfigPath = vscode.workspace
    .getConfiguration()
    .get('jestrunner.vitestConfigPath') as string | Record<string, string> | undefined;
  
  const resolvedConfigPath = resolveConfigPathOrMapping(customVitestConfigPath, filePath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  const fullConfigPath = resolvedConfigPath && workspaceFolder
    ? path.resolve(workspaceFolder.uri.fsPath, resolvedConfigPath)
    : undefined;
  const hasCustomConfig = hasValidCustomConfig(fullConfigPath, 'vitest');
  
  return hasVitestDir || hasCustomConfig;
}

export function isTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasFrameworkDir = !!findTestFrameworkDirectory(filePath);
  
  const customJestConfigPath = vscode.workspace
    .getConfiguration()
    .get('jestrunner.configPath') as string | Record<string, string> | undefined;
  const customVitestConfigPath = vscode.workspace
    .getConfiguration()
    .get('jestrunner.vitestConfigPath') as string | Record<string, string> | undefined;
  
  const resolvedJestConfigPath = resolveConfigPathOrMapping(customJestConfigPath, filePath);
  const resolvedVitestConfigPath = resolveConfigPathOrMapping(customVitestConfigPath, filePath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  const fullJestConfigPath = resolvedJestConfigPath && workspaceFolder
    ? path.resolve(workspaceFolder.uri.fsPath, resolvedJestConfigPath)
    : undefined;
  const fullVitestConfigPath = resolvedVitestConfigPath && workspaceFolder
    ? path.resolve(workspaceFolder.uri.fsPath, resolvedVitestConfigPath)
    : undefined;
  const hasCustomConfig = hasValidCustomConfig(fullJestConfigPath, 'jest') ||
    hasValidCustomConfig(fullVitestConfigPath, 'vitest');
  
  return hasFrameworkDir || hasCustomConfig;
}

export function getTestFrameworkForFile(
  filePath: string,
): TestFrameworkName | undefined {
  const result = findTestFrameworkDirectory(filePath);
  return result?.framework;
}
