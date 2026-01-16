import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError, logInfo, logWarning } from './util';

export interface CoverageMap {
  [filePath: string]: FileCoverageData;
}

export interface FileCoverageData {
  path: string;
  statementMap: { [id: string]: LocationRange };
  fnMap: { [id: string]: FunctionMapping };
  branchMap: { [id: string]: BranchMapping };
  s: { [id: string]: number }; // statement execution counts
  f: { [id: string]: number }; // function execution counts
  b: { [id: string]: number[] }; // branch execution counts
}

export interface LocationRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface FunctionMapping {
  name: string;
  decl: LocationRange;
  loc: LocationRange;
  line: number;
}

export interface BranchMapping {
  loc: LocationRange;
  type: string;
  locations: LocationRange[];
  line: number;
}

export class DetailedFileCoverage extends vscode.FileCoverage {
  constructor(
    uri: vscode.Uri,
    statementCoverage: vscode.TestCoverageCount,
    branchCoverage: vscode.TestCoverageCount | undefined,
    declarationCoverage: vscode.TestCoverageCount | undefined,
    public readonly detailedData: FileCoverageData,
  ) {
    super(uri, statementCoverage, branchCoverage, declarationCoverage);
  }
}

const DEFAULT_COVERAGE_DIR = 'coverage';
const COVERAGE_FINAL_FILE = 'coverage-final.json';

const JEST_CONFIG_FILES = ['jest.config.js', 'jest.config.ts', 'jest.config.mjs', 'jest.config.cjs', 'jest.config.json'];
const VITEST_CONFIG_FILES = [
  'vitest.config.js', 'vitest.config.ts', 'vitest.config.mjs', 'vitest.config.mts',
  'vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts',
];

export class CoverageProvider {
  private parseVitestCoverageDir(configPath: string): string | undefined {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const configDir = path.dirname(configPath);
      
      const match = content.match(/reportsDirectory\s*[=:]\s*["']([^"']+)["']/);
      if (match) {
        const reportsDir = match[1];
        logDebug(`Found Vitest reportsDirectory: ${reportsDir}`);
        return path.isAbsolute(reportsDir) 
          ? reportsDir 
          : path.join(configDir, reportsDir);
      }
    } catch (error) {
      logDebug(`Could not parse Vitest config: ${error}`);
    }
    return undefined;
  }

  private parseJestCoverageDirWithBase(configPath: string): string | undefined {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const configDir = path.dirname(configPath);
      
      const match = content.match(/["']?coverageDirectory["']?\s*[=:]\s*["']([^"']+)["']/);
      if (match) {
        const coverageDir = match[1];
        logDebug(`Found Jest coverageDirectory: ${coverageDir}`);
        return path.isAbsolute(coverageDir)
          ? coverageDir
          : path.join(configDir, coverageDir);
      }
    } catch (error) {
      logDebug(`Could not parse Jest config: ${error}`);
    }
    return undefined;
  }

  private getCoverageDirFromConfigPath(
    configPath: string,
    framework: 'jest' | 'vitest',
  ): string | undefined {
    if (!fs.existsSync(configPath)) {
      return undefined;
    }
    
    logDebug(`Parsing coverage dir from config: ${configPath}`);
    return framework === 'vitest'
      ? this.parseVitestCoverageDir(configPath)
      : this.parseJestCoverageDirWithBase(configPath);
  }

  private getCoverageDirectoryFromWorkspace(
    workspaceFolder: string,
    framework: 'jest' | 'vitest',
  ): string | undefined {
    const configFiles = framework === 'vitest' ? VITEST_CONFIG_FILES : JEST_CONFIG_FILES;
    
    for (const configFile of configFiles) {
      const configPath = path.join(workspaceFolder, configFile);
      if (fs.existsSync(configPath)) {
        const coverageDir = this.getCoverageDirFromConfigPath(configPath, framework);
        if (coverageDir) {
          return coverageDir;
        }
      }
    }
    
    return undefined;
  }

  public async readCoverageFromFile(
    workspaceFolder: string,
    framework: 'jest' | 'vitest' = 'jest',
    configPath?: string,
  ): Promise<CoverageMap | undefined> {
    try {
      let coverageDir: string | undefined;
      
      if (configPath) {
        coverageDir = this.getCoverageDirFromConfigPath(configPath, framework);
      }
      
      if (!coverageDir) {
        coverageDir = this.getCoverageDirectoryFromWorkspace(workspaceFolder, framework);
      }
      
      if (!coverageDir) {
        const baseDir = configPath ? path.dirname(configPath) : workspaceFolder;
        coverageDir = path.join(baseDir, DEFAULT_COVERAGE_DIR);
        logDebug(`Using default coverage directory: ${coverageDir}`);
      }

      const coveragePath = path.join(coverageDir, COVERAGE_FINAL_FILE);
      logDebug(`Looking for coverage at: ${coveragePath}`);

      if (!fs.existsSync(coveragePath)) {
        logInfo(`Coverage file not found at: ${coveragePath}`);
        logInfo(`Make sure you have ${framework === 'vitest' ? '@vitest/coverage-v8 or @vitest/coverage-istanbul' : 'jest'} configured with JSON reporter.`);
        return undefined;
      }

      logInfo(`Reading coverage from: ${coveragePath}`);

      const content = fs.readFileSync(coveragePath, 'utf-8');

      if (!content || content.trim() === '' || content.trim() === '{}') {
        logWarning('Coverage file is empty. This may indicate a configuration issue.');
        logInfo(`For ${framework}, ensure coverageReporters includes "json" in your config.`);
        return undefined;
      }

      const coverageMap = JSON.parse(content) as CoverageMap;

      const fileCount = Object.keys(coverageMap).length;
      if (fileCount === 0) {
        logWarning('Coverage map is empty. No files were instrumented.');
        return undefined;
      }

      logInfo(`Loaded coverage for ${fileCount} files from ${coveragePath}`);
      return coverageMap;
    } catch (error) {
      logError(`Failed to read coverage from file: ${error}`);
      return undefined;
    }
  }

  public convertToVSCodeCoverage(
    coverageMap: CoverageMap,
    workspaceFolder: string,
  ): DetailedFileCoverage[] {
    const fileCoverages: DetailedFileCoverage[] = [];

    for (const [filePath, coverageData] of Object.entries(coverageMap)) {
      try {
        if (filePath.includes('node_modules') || filePath.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
          continue;
        }

        const uri = vscode.Uri.file(filePath);

        const statements = Object.values(coverageData.s);
        const coveredStatements = statements.filter((count) => count > 0).length;
        const totalStatements = statements.length;
        const statementCoverage = new vscode.TestCoverageCount(
          coveredStatements,
          totalStatements,
        );

        const branches = Object.values(coverageData.b).flat();
        const coveredBranches = branches.filter((count) => count > 0).length;
        const totalBranches = branches.length;
        const branchCoverage =
          totalBranches > 0
            ? new vscode.TestCoverageCount(coveredBranches, totalBranches)
            : undefined;

        const functions = Object.values(coverageData.f);
        const coveredFunctions = functions.filter((count) => count > 0).length;
        const totalFunctions = functions.length;
        const declarationCoverage =
          totalFunctions > 0
            ? new vscode.TestCoverageCount(coveredFunctions, totalFunctions)
            : undefined;

        const fileCoverage = new DetailedFileCoverage(
          uri,
          statementCoverage,
          branchCoverage,
          declarationCoverage,
          coverageData,
        );

        fileCoverages.push(fileCoverage);
      } catch (error) {
        logWarning(`Failed to process coverage for ${filePath}: ${error}`);
      }
    }

    return fileCoverages;
  }

  public async loadDetailedCoverage(
    fileCoverage: DetailedFileCoverage,
    token: vscode.CancellationToken,
  ): Promise<vscode.FileCoverageDetail[]> {
    if (token.isCancellationRequested) {
      return [];
    }

    const details: vscode.FileCoverageDetail[] = [];
    const data = fileCoverage.detailedData;

    try {
      for (const [id, location] of Object.entries(data.statementMap)) {
        const executionCount = data.s[id] || 0;
        const range = this.convertLocationToRange(location);

        details.push(
          new vscode.StatementCoverage(
            executionCount,
            range,
          ),
        );
      }

      for (const [id, fn] of Object.entries(data.fnMap)) {
        const executionCount = data.f[id] || 0;
        const range = this.convertLocationToRange(fn.loc);

        details.push(new vscode.DeclarationCoverage(fn.name || `Function ${id}`, executionCount, range));
      }

      for (const [id, branch] of Object.entries(data.branchMap)) {
        const branchCounts = data.b[id] || [];
        const range = this.convertLocationToRange(branch.loc);

        const branches = branch.locations.map((loc, index) => {
          const branchRange = this.convertLocationToRange(loc);
          const count = branchCounts[index] || 0;
          return new vscode.BranchCoverage(count, branchRange, branch.type);
        });

        if (branches.length > 0) {
          const executionCount = Math.max(...branchCounts);
          details.push(new vscode.StatementCoverage(executionCount, range, branches));
        }
      }

      return details;
    } catch (error) {
      logError('Failed to load detailed coverage', error);
      return [];
    }
  }

  private convertLocationToRange(location: LocationRange): vscode.Range {
    return new vscode.Range(
      new vscode.Position(location.start.line - 1, location.start.column),
      new vscode.Position(location.end.line - 1, location.end.column),
    );
  }
}
