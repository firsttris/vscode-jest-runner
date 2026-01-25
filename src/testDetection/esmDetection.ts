import * as fs from 'fs';
import * as path from 'path';
import { logDebug, searchPathToParent } from '../util';
import { testFrameworks } from './frameworkDefinitions';

/**
 * Detects if a project uses ESM (ECMAScript Modules) for Jest.
 * Checks:
 * 1. package.json "type": "module"
 * 2. jest.config extensionsToTreatAsEsm
 * 3. ts-jest useESM: true
 */
export function isEsmProject(projectDir: string, jestConfigPath?: string): boolean {
  // Check package.json for "type": "module"
  const packageJsonPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);
      if (pkg.type === 'module') {
        logDebug(`ESM detected: package.json has "type": "module"`);
        return true;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check jest.config for ESM indicators
  const jestFramework = testFrameworks.find(f => f.name === 'jest');
  const configFiles = jestFramework ? jestFramework.configFiles : [];

  const configPath = jestConfigPath || searchPathToParent<string>(
    projectDir,
    projectDir,
    (currentFolderPath: string) => {
      for (const configFilename of configFiles) {
        const currentFolderConfigPath = path.join(currentFolderPath, configFilename);
        if (fs.existsSync(currentFolderConfigPath)) {
          return currentFolderConfigPath;
        }
      }
    },
  );
  if (configPath && fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');

      // Check for extensionsToTreatAsEsm
      if (/extensionsToTreatAsEsm\s*[:=]/.test(content)) {
        logDebug(`ESM detected: jest.config has extensionsToTreatAsEsm`);
        return true;
      }

      // Check for ts-jest useESM: true
      if (/useESM\s*[:=]\s*true/.test(content)) {
        logDebug(`ESM detected: jest.config has useESM: true`);
        return true;
      }
    } catch {
      // Ignore read errors
    }
  }

  return false;
}
