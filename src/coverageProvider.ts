import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logError, logInfo, logWarning } from './util';
import { COVERAGE_FINAL_FILE, DEFAULT_COVERAGE_DIR, testFrameworks } from './testDetection/frameworkDefinitions';
import { parseCoverageDirectory } from './testDetection/configParsing';
import { matchesTestFilePattern } from './testDetection/testFileDetection';

export interface CoverageMap {
  [filePath: string]: FileCoverageData;
}

export interface FileCoverageData {
  path: string;
  statementMap: { [id: string]: LocationRange };
  fnMap: { [id: string]: FunctionMapping };
  branchMap: { [id: string]: BranchMapping };
  s: { [id: string]: number };
  f: { [id: string]: number };
  b: { [id: string]: number[] };
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

export class CoverageProvider {

  private getCoverageDirFromConfigPath(
    configPath: string,
    framework: 'jest' | 'vitest',
  ): string | undefined {
    if (!existsSync(configPath)) {
      return undefined;
    }
    return parseCoverageDirectory(configPath, framework);
  }

  private getCoverageDirectoryFromWorkspace(
    workspaceFolder: string,
    framework: 'jest' | 'vitest',
  ): string | undefined {
    const frameworkDef = testFrameworks.find(f => f.name === framework);
    const configFiles = frameworkDef ? frameworkDef.configFiles : [];

    for (const configFile of configFiles) {
      const configPath = join(workspaceFolder, configFile);
      if (existsSync(configPath)) {
        const coverageDir = this.getCoverageDirFromConfigPath(
          configPath,
          framework,
        );
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
        coverageDir = this.getCoverageDirectoryFromWorkspace(
          workspaceFolder,
          framework,
        );
      }

      if (!coverageDir) {
        const baseDir = configPath ? dirname(configPath) : workspaceFolder;
        coverageDir = join(baseDir, DEFAULT_COVERAGE_DIR);
      }

      const coveragePath = join(coverageDir, COVERAGE_FINAL_FILE);

      if (!existsSync(coveragePath)) {
        logInfo(`Coverage file not found at: ${coveragePath}`);
        logInfo(
          `Make sure you have ${framework === 'vitest' ? '@vitest/coverage-v8 or @vitest/coverage-istanbul' : 'jest'} configured with JSON reporter.`,
        );
        return undefined;
      }

      const content = readFileSync(coveragePath, 'utf-8');

      if (!content || content.trim() === '' || content.trim() === '{}') {
        logWarning(
          'Coverage file is empty. This may indicate a configuration issue.',
        );
        logInfo(
          `For ${framework}, ensure coverageReporters includes "json" in your config.`,
        );
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

  private createCoverageCount(
    counts: number[],
  ): vscode.TestCoverageCount | undefined {
    if (counts.length === 0) return undefined;
    const covered = counts.filter((count) => count > 0).length;
    return new vscode.TestCoverageCount(covered, counts.length);
  }

  public convertToVSCodeCoverage(
    coverageMap: CoverageMap,
    workspaceFolder: string,
  ): DetailedFileCoverage[] {
    const fileCoverages: DetailedFileCoverage[] = [];

    for (const [filePath, coverageData] of Object.entries(coverageMap)) {
      try {
        if (
          filePath.includes('node_modules') ||
          matchesTestFilePattern(filePath)
        ) {
          continue;
        }

        const uri = vscode.Uri.file(filePath);
        const statements = Object.values(coverageData.s);
        const statementCoverage = new vscode.TestCoverageCount(
          statements.filter((c) => c > 0).length,
          statements.length,
        );

        const branchCoverage = this.createCoverageCount(
          Object.values(coverageData.b).flat(),
        );
        const declarationCoverage = this.createCoverageCount(
          Object.values(coverageData.f),
        );

        fileCoverages.push(
          new DetailedFileCoverage(
            uri,
            statementCoverage,
            branchCoverage,
            declarationCoverage,
            coverageData,
          ),
        );
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

        details.push(new vscode.StatementCoverage(executionCount, range));
      }

      for (const [id, fn] of Object.entries(data.fnMap)) {
        const executionCount = data.f[id] || 0;
        const range = this.convertLocationToRange(fn.loc);

        details.push(
          new vscode.DeclarationCoverage(
            fn.name || `Function ${id}`,
            executionCount,
            range,
          ),
        );
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
          details.push(
            new vscode.StatementCoverage(executionCount, range, branches),
          );
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
