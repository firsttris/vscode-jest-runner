import * as fs from 'fs';
import * as path from 'path';
import { logDebug, searchPathToParent } from '../util';
import { testFrameworks } from './frameworkDefinitions';

export function isEsmProject(projectDir: string, jestConfigPath?: string): boolean {
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

      if (/extensionsToTreatAsEsm\s*[:=]/.test(content)) {
        logDebug(`ESM detected: jest.config has extensionsToTreatAsEsm`);
        return true;
      }

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
