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

const DEFAULT_TEST_PATTERNS = ['**/*.{test,spec}.{js,jsx,ts,tsx}'];

interface TestPatterns {
  patterns: string[];
  isRegex: boolean;
  rootDir?: string;
}

export function viteConfigHasTestAttribute(configPath: string): boolean {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return /\btest\s*[:=]/.test(content);
  } catch (error) {
    logError(`Error reading vite config file: ${configPath}`, error);
    return false;
  }
}

function binaryExists(directoryPath: string, binaryName: string): boolean {
  const possibleBinaryPaths = [
    path.join(directoryPath, 'node_modules', '.bin', binaryName),
    path.join(directoryPath, 'node_modules', '.bin', `${binaryName}.cmd`),
    path.join(directoryPath, 'node_modules', binaryName, 'package.json'),
  ];
  return possibleBinaryPaths.some(fs.existsSync);
}

function checkVitestViteConfig(directoryPath: string): boolean {
  return viteConfigFiles.some((viteConfig) => {
    const viteConfigPath = path.join(directoryPath, viteConfig);
    return fs.existsSync(viteConfigPath) && viteConfigHasTestAttribute(viteConfigPath);
  });
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
      'test/jest-e2e.json',
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

    if (binaryExists(directoryPath, framework.binaryName)) {
      cache.set(directoryPath, true);
      return true;
    }

    if (framework.configFiles.some((cfg) => fs.existsSync(path.join(directoryPath, cfg)))) {
      cache.set(directoryPath, true);
      return true;
    }

    if (frameworkName === 'vitest' && checkVitestViteConfig(directoryPath)) {
      cache.set(directoryPath, true);
      return true;
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
      if (framework.configFiles.some((cfg) => fs.existsSync(path.join(directoryPath, cfg)))) {
        return framework.name as TestFrameworkName;
      }
      if (frameworkName === 'vitest' && checkVitestViteConfig(directoryPath)) {
        return 'vitest';
      }
    }
  }

  for (const framework of testFrameworks) {
    if (binaryExists(directoryPath, framework.binaryName)) {
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

function extractTestRegex(config: any): string[] | undefined {
  if (!config.testRegex) return undefined;

  if (typeof config.testRegex === 'string') {
    return [config.testRegex];
  }
  if (Array.isArray(config.testRegex)) {
    return config.testRegex;
  }
  return undefined;
}

function extractRootDir(content: string): string | undefined {
  // Try to extract rootDir from JS/TS config
  const rootDirMatch = content.match(/rootDir['":]?\s*[:=]\s*['"]([^'"]+)['"]/);
  if (rootDirMatch) {
    return rootDirMatch[1];
  }
  return undefined;
}

export function getTestMatchFromJestConfig(
  configPath: string,
): TestPatterns | undefined {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    let rootDir: string | undefined;

    // Try to parse as JSON first (for .json files and package.json)
    if (configPath.endsWith('.json')) {
      try {
        const config = configPath.endsWith('package.json') ? JSON.parse(content).jest : JSON.parse(content);
        if (!config) return undefined;

        rootDir = config.rootDir;
        if (rootDir) {
          logDebug(`Found rootDir in ${configPath}: ${rootDir}`);
        }

        if (config.testMatch && Array.isArray(config.testMatch)) {
          logDebug(`Found testMatch in ${configPath}: ${config.testMatch.join(', ')}`);
          return { patterns: config.testMatch, isRegex: false, rootDir };
        }

        const regexPatterns = extractTestRegex(config);
        if (regexPatterns) {
          logDebug(`Found testRegex in ${configPath}: ${regexPatterns.join(', ')}`);
          return { patterns: regexPatterns, isRegex: true, rootDir };
        }
      } catch {
        // If JSON parsing fails, continue with text parsing below
      }
    }

    // Extract rootDir from JS/TS config
    rootDir = extractRootDir(content);
    if (rootDir) {
      logDebug(`Found rootDir in ${configPath}: ${rootDir}`);
    }

    // Parse testMatch from JS/TS config files
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
            return { patterns, isRegex: false, rootDir };
          }
        }
      }
    }

    // Parse testRegex from JS/TS config files
    const testRegexMatch = content.match(/testRegex['":]?\s*[:=]\s*['"]([^'"]+)['"]/);
    if (testRegexMatch) {
      // Unescape JavaScript string escapes (e.g., \\\\ -> \\, \\. -> .)
      const regex = testRegexMatch[1].replace(/\\\\/g, '\\');
      logDebug(`Found testRegex in ${configPath}: ${regex}`);
      return { patterns: [regex], isRegex: true, rootDir };
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
	isRegex: boolean;
} {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
	if (!workspaceFolder) {
		return {
			patterns: DEFAULT_TEST_PATTERNS,
			configDir: path.dirname(filePath),
			isRegex: false,
		};
	}

	const rootPath = workspaceFolder.uri.fsPath;

	const jestConfigPath = resolveAndValidateCustomConfig('jestrunner.configPath', filePath);
	if (jestConfigPath) {
		const result = getTestMatchFromJestConfig(jestConfigPath);
		// If rootDir is specified in config, resolve it relative to the config file
		// Otherwise use the workspace root (where Jest is typically run from)
		let configDir = rootPath;
		if (result?.rootDir) {
			configDir = path.resolve(path.dirname(jestConfigPath), result.rootDir);
			logDebug(`Resolved rootDir for Jest: ${configDir}`);
		}
		return {
			patterns: result?.patterns ?? DEFAULT_TEST_PATTERNS,
			configDir,
			isRegex: result?.isRegex ?? false,
		};
	}

	const vitestConfigPath = resolveAndValidateCustomConfig('jestrunner.vitestConfigPath', filePath);
	if (vitestConfigPath) {
		const patterns = getIncludeFromVitestConfig(vitestConfigPath);
		// Use the workspace root for pattern matching (where Vitest is typically run from)
		return { patterns: patterns ?? DEFAULT_TEST_PATTERNS, configDir: rootPath, isRegex: false };
	}

	let currentDir = path.dirname(filePath);
	while (currentDir && currentDir.startsWith(rootPath)) {
		const framework = detectTestFramework(currentDir);

		if (framework === 'jest') {
			const jestFramework = testFrameworks.find((f) => f.name === 'jest');
			for (const configFile of [...jestFramework!.configFiles, 'package.json']) {
				const configPath = path.join(currentDir, configFile);
				if (fs.existsSync(configPath)) {
					const result = getTestMatchFromJestConfig(configPath);
					if (result) {
						// If rootDir is specified, resolve it relative to the config file
						let resolvedConfigDir = currentDir;
						if (result.rootDir) {
							resolvedConfigDir = path.resolve(currentDir, result.rootDir);
							logDebug(`Resolved rootDir for Jest: ${resolvedConfigDir}`);
						}
						return { patterns: result.patterns, configDir: resolvedConfigDir, isRegex: result.isRegex};
					}
				}
			}
			return { patterns: DEFAULT_TEST_PATTERNS, configDir: currentDir, isRegex: false };
		} else if (framework === 'vitest') {
			const vitestFramework = testFrameworks.find((f) => f.name === 'vitest');
			const allConfigs = [...vitestFramework!.configFiles, ...viteConfigFiles];
			for (const configFile of allConfigs) {
				const configPath = path.join(currentDir, configFile);
				if (fs.existsSync(configPath)) {
					const patterns = getIncludeFromVitestConfig(configPath);
					if (patterns) return { patterns, configDir: currentDir, isRegex: false };
				}
			}
			return { patterns: DEFAULT_TEST_PATTERNS, configDir: currentDir, isRegex: false };
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) break;
		currentDir = parentDir;
	}

	return {
		patterns: DEFAULT_TEST_PATTERNS,
		configDir: rootPath,
		isRegex: false,
	};
}

function resolveAndValidateCustomConfig(
	configKey: string,
	filePath: string,
): string | undefined {
	const customConfigPath = vscode.workspace.getConfiguration().get(configKey) as string | Record<string, string> | undefined;

	const resolvedConfigPath = resolveConfigPathOrMapping(customConfigPath, filePath);
	if (!resolvedConfigPath) return undefined;

	const basePath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
	if (!basePath) return undefined;

	const fullConfigPath = path.resolve(basePath, resolvedConfigPath);
	if (!fs.existsSync(fullConfigPath)) return undefined;

	return fullConfigPath;
}

export function matchesTestFilePattern(filePath: string): boolean {
	const { patterns, configDir, isRegex } = getTestFilePatternsForFile(filePath);

	// For Vitest: patterns are relative to the config directory (root)
	// For Jest testMatch: patterns are relative to rootDir (which defaults to config directory)
	//   - configDir now contains the resolved rootDir if specified in the Jest config
	// For Jest testRegex: patterns match against ABSOLUTE file path
	const baseDir = configDir;

	// For regex patterns (Jest testRegex), use absolute path
	// For glob patterns (Jest testMatch, Vitest include), use relative path
	const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
	const pathToMatch = isRegex ? filePath.replace(/\\/g, '/') : relativePath;

	logDebug(`Matching file: ${filePath}`);
	logDebug(`Using patterns: ${patterns.join(', ')} (isRegex: ${isRegex})`);
	logDebug(`Base dir: ${baseDir}`);
	logDebug(`Path to match: ${pathToMatch}`);
	for (const pattern of patterns) {
		if (isRegex) {
			// Jest testRegex: match against absolute file path
			try {
				const regex = new RegExp(pattern);
				if (regex.test(pathToMatch)) {
					return true;
				}
			} catch (error) {
				logError(`Invalid testRegex pattern: ${pattern}`, error);
			}
		} else {
			// Use pattern as glob with micromatch
			// Normalize Jest patterns: remove <rootDir>/ prefix if present
			const normalizedPattern = pattern.replace(/^<rootDir>\//i, '');

			if (mm.isMatch(pathToMatch, normalizedPattern, { nocase: true })) {
        logDebug(`File ${filePath} matched pattern ${pattern}`);
				return true;
			}
		}
	}

	return false;
}

export function isJestTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasJestDir = !!findJestDirectory(filePath);
  const hasCustomConfig = !!resolveAndValidateCustomConfig('jestrunner.configPath', filePath);
  
  return hasJestDir || hasCustomConfig;
}

export function isVitestTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasVitestDir = !!findVitestDirectory(filePath);
  const hasCustomConfig = !!resolveAndValidateCustomConfig('jestrunner.vitestConfigPath', filePath);
  
  return hasVitestDir || hasCustomConfig;
}

export function isTestFile(filePath: string): boolean {
  if (!matchesTestFilePattern(filePath)) {
    return false;
  }

  const hasFrameworkDir = !!findTestFrameworkDirectory(filePath);
  const hasCustomConfig = 
    !!resolveAndValidateCustomConfig('jestrunner.configPath', filePath) ||
    !!resolveAndValidateCustomConfig('jestrunner.vitestConfigPath', filePath);
  
  return hasFrameworkDir || hasCustomConfig;
}

export function getTestFrameworkForFile(
  filePath: string,
): TestFrameworkName | undefined {
  const result = findTestFrameworkDirectory(filePath);
  return result?.framework;
}
