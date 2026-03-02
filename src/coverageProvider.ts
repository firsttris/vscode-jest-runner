import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import {
  COVERAGE_FINAL_FILE,
  DEFAULT_COVERAGE_DIR,
  testFrameworks,
  TestFrameworkName,
} from './testDetection/frameworkDefinitions';
import { parseCoverageDirectory } from './testDetection/configParsers/jestParser';
import { matchesTestFilePattern } from './testDetection/testFileDetection';
import { logError, logInfo, logWarning } from './utils/Logger';
import { parseLcov, type LcovCoverageData } from './parsers/lcov-parser';

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
    framework: TestFrameworkName,
  ): string | undefined {
    if (!existsSync(configPath)) {
      return undefined;
    }
    return parseCoverageDirectory(configPath, framework);
  }

  private getCoverageDirectoryFromWorkspace(
    workspaceFolder: string,
    framework: TestFrameworkName,
  ): string | undefined {
    const frameworkDef = testFrameworks.find((f) => f.name === framework);
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

  private findLcovRecursively(
    currentDir: string,
    stopAt: string,
  ): string | undefined {
    // Check lcov.info first, then coverage/lcov.info in current directory
    const lcovPath = join(currentDir, 'lcov.info');
    if (existsSync(lcovPath)) {
      return lcovPath;
    }

    const coverageLcovPath = join(currentDir, 'coverage', 'lcov.info');
    if (existsSync(coverageLcovPath)) {
      return coverageLcovPath;
    }

    if (currentDir === stopAt || currentDir === dirname(currentDir)) {
      return undefined;
    }

    return this.findLcovRecursively(dirname(currentDir), stopAt);
  }

  public async readCoverageFromFile(
    workspaceFolder: string,
    framework: TestFrameworkName = 'jest',
    configPath?: string,
    testFilePath?: string, // New optional parameter
  ): Promise<CoverageMap | undefined> {
    try {
      if (this.isLcovFramework(framework)) {
        return await this.handleLcovCoverage(
          workspaceFolder,
          configPath,
          testFilePath,
        );
      }
      return await this.handleJsonCoverage(
        workspaceFolder,
        framework,
        configPath,
      );
    } catch (error) {
      logError(`Failed to read coverage from file: ${error}`);
      return undefined;
    }
  }

  private isLcovFramework(framework: TestFrameworkName): boolean {
    return (
      framework === 'node-test' || framework === 'bun' || framework === 'deno'
    );
  }

  private async handleLcovCoverage(
    workspaceFolder: string,
    configPath?: string,
    testFilePath?: string,
  ): Promise<CoverageMap | undefined> {
    const startDir = testFilePath
      ? dirname(testFilePath)
      : configPath
        ? dirname(configPath)
        : workspaceFolder;
    const lcovPath = this.findLcovRecursively(startDir, workspaceFolder);

    if (lcovPath) {
      logInfo(`Found LCOV file at: ${lcovPath}`);
      return this.readLcovCoverage(lcovPath);
    }

    logInfo(
      `LCOV file not found. ensure it is generated in the project root or package root.`,
    );
    return undefined;
  }

  private async handleJsonCoverage(
    workspaceFolder: string,
    framework: TestFrameworkName,
    configPath?: string,
  ): Promise<CoverageMap | undefined> {
    const coverageDir = this.resolveCoverageDirectory(
      workspaceFolder,
      framework,
      configPath,
    );
    const coveragePath = join(coverageDir, COVERAGE_FINAL_FILE);

    if (!existsSync(coveragePath)) {
      this.logMissingCoverageFile(coveragePath, framework);
      return undefined;
    }

    const content = readFileSync(coveragePath, 'utf-8');
    if (!this.isValidCoverageContent(content, framework)) {
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
  }

  private resolveCoverageDirectory(
    workspaceFolder: string,
    framework: TestFrameworkName,
    configPath?: string,
  ): string {
    if (configPath) {
      const dir = this.getCoverageDirFromConfigPath(configPath, framework);
      if (dir) return dir;
    }

    const dirFromWorkspace = this.getCoverageDirectoryFromWorkspace(
      workspaceFolder,
      framework,
    );
    if (dirFromWorkspace) return dirFromWorkspace;

    const baseDir = configPath ? dirname(configPath) : workspaceFolder;
    return join(baseDir, DEFAULT_COVERAGE_DIR);
  }

  private logMissingCoverageFile(
    path: string,
    framework: TestFrameworkName,
  ): void {
    logInfo(`Coverage file not found at: ${path}`);
    logInfo(
      `Make sure you have ${framework === 'vitest' ? '@vitest/coverage-v8 or @vitest/coverage-istanbul' : 'jest'} configured with JSON reporter.`,
    );
  }

  private isValidCoverageContent(
    content: string,
    framework: TestFrameworkName,
  ): boolean {
    if (!content || content.trim() === '' || content.trim() === '{}') {
      logWarning(
        'Coverage file is empty. This may indicate a configuration issue.',
      );
      logInfo(
        `For ${framework}, ensure coverageReporters includes "json" in your config.`,
      );
      return false;
    }
    return true;
  }

  private async readLcovCoverage(
    lcovPath: string,
  ): Promise<CoverageMap | undefined> {
    try {
      const data = await parseLcov(lcovPath);
      const coverageMap: CoverageMap = {};
      const baseDir = dirname(lcovPath);

      for (const file of data) {
        if (!file.file) {
          continue;
        }
        const fileCoverage = this.processLcovRecord(file, baseDir);
        coverageMap[fileCoverage.path] = fileCoverage;
      }

      return coverageMap;
    } catch (err) {
      logError(`Failed to parse LCOV file: ${err}`);
      return undefined;
    }
  }

  private processLcovRecord(
    file: LcovCoverageData,
    baseDir: string,
  ): FileCoverageData {
    let filePath = file.file!;
    if (!isAbsolute(filePath)) {
      filePath = resolve(baseDir, filePath);
    }

    const lines = file.lines?.details || [];
    const functions = file.functions?.details || [];
    const branches = file.branches?.details || [];

    const s: { [id: string]: number } = {};
    const statementMap: { [id: string]: LocationRange } = {};

    lines.forEach((line, index) => {
      const id = index.toString();
      s[id] = line.hit;
      statementMap[id] = {
        start: { line: line.line, column: 0 },
        end: { line: line.line, column: 0 },
      };
    });

    const f: { [id: string]: number } = {};
    const fnMap: { [id: string]: FunctionMapping } = {};

    functions.forEach((func, index) => {
      const id = index.toString();
      f[id] = func.hit ?? 0;
      fnMap[id] = {
        name: func.name,
        decl: {
          start: { line: func.line, column: 0 },
          end: { line: func.line, column: 0 },
        },
        loc: {
          start: { line: func.line, column: 0 },
          end: { line: func.line, column: 0 },
        },
        line: func.line,
      };
    });

    const b: { [id: string]: number[] } = {};
    const branchMap: { [id: string]: BranchMapping } = {};

    const branchesByLine = new Map<
      number,
      LcovCoverageData['branches']['details']
    >();
    branches.forEach((branch) => {
      if (!branchesByLine.has(branch.line)) {
        branchesByLine.set(branch.line, []);
      }
      branchesByLine.get(branch.line)?.push(branch);
    });

    let branchIdCounter = 0;
    branchesByLine.forEach((lineBranches, line) => {
      const id = branchIdCounter.toString();
      branchIdCounter++;

      b[id] = lineBranches.map((br) => (br.taken ? 1 : 0));
      branchMap[id] = {
        loc: {
          start: { line: line, column: 0 },
          end: { line: line, column: 0 },
        },
        type: 'branch',
        locations: lineBranches.map(() => ({
          start: { line: line, column: 0 },
          end: { line: line, column: 0 },
        })),
        line: line,
      };
    });

    return {
      path: filePath,
      statementMap,
      fnMap,
      branchMap,
      s,
      f,
      b,
    };
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
  ): DetailedFileCoverage[] {
    const fileCoverages: DetailedFileCoverage[] = [];

    for (const [filePath, coverageData] of Object.entries(coverageMap)) {
      if (this.shouldIgnoreFile(filePath)) {
        continue;
      }

      try {
        const coverage = this.processFileCoverage(filePath, coverageData);
        fileCoverages.push(coverage);
      } catch (error) {
        logWarning(`Failed to process coverage for ${filePath}: ${error}`);
      }
    }

    return fileCoverages;
  }

  private shouldIgnoreFile(filePath: string): boolean {
    return (
      filePath.includes('node_modules') || matchesTestFilePattern(filePath)
    );
  }

  private processFileCoverage(
    filePath: string,
    coverageData: FileCoverageData,
  ): DetailedFileCoverage {
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

    return new DetailedFileCoverage(
      uri,
      statementCoverage,
      branchCoverage,
      declarationCoverage,
      coverageData,
    );
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
