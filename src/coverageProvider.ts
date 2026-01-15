import * as vscode from 'vscode';
import { logDebug, logError, logWarning } from './util';

/**
 * Jest/Vitest coverage data structures matching Istanbul/V8 format
 */
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

/**
 * VS Code FileCoverage with associated detailed data
 */
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

/**
 * Parses Jest/Vitest coverage output and converts it to VS Code coverage format
 */
export class CoverageProvider {
  /**
   * Parse coverage JSON from Jest/Vitest output
   */
  public parseCoverageFromOutput(output: string): CoverageMap | undefined {
    try {
      // Jest outputs coverage in the 'coverage' field with --coverage --json
      // Vitest with --coverage outputs coverage data in coverage/ folder, not in JSON output
      
      // Try to find the coverage data in the output (Jest format)
      const jsonMatch = output.match(/("coverage":\{[\s\S]*?\})\s*,\s*"watermarks"/);
      
      if (jsonMatch) {
        const fullJson = `{${jsonMatch[1]}}`;
        const parsed = JSON.parse(fullJson);
        return parsed.coverage as CoverageMap;
      }

      // Try parsing entire output as JSON
      try {
        const parsed = JSON.parse(output);
        if (parsed.coverage) {
          return parsed.coverage as CoverageMap;
        }
        
        // For Vitest, coverage might not be in the JSON output
        // Vitest writes coverage to coverage/ folder by default
        logDebug('JSON parsed but no coverage field found (expected for Vitest)');
      } catch {
        // Not valid JSON, continue
      }

      logDebug('No coverage data found in output');
      return undefined;
    } catch (error) {
      logError('Failed to parse coverage data', error);
      return undefined;
    }
  }

  /**
   * Convert coverage map to VS Code FileCoverage objects
   */
  public convertToVSCodeCoverage(
    coverageMap: CoverageMap,
    workspaceFolder: string,
  ): DetailedFileCoverage[] {
    const fileCoverages: DetailedFileCoverage[] = [];

    for (const [filePath, coverageData] of Object.entries(coverageMap)) {
      try {
        // Skip node_modules and test files typically
        if (filePath.includes('node_modules') || filePath.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
          continue;
        }

        const uri = vscode.Uri.file(filePath);

        // Calculate statement coverage
        const statements = Object.values(coverageData.s);
        const coveredStatements = statements.filter((count) => count > 0).length;
        const statementCoverage = new vscode.TestCoverageCount(
          coveredStatements,
          statements.length - coveredStatements,
        );

        // Calculate branch coverage
        const branches = Object.values(coverageData.b).flat();
        const coveredBranches = branches.filter((count) => count > 0).length;
        const branchCoverage =
          branches.length > 0
            ? new vscode.TestCoverageCount(coveredBranches, branches.length - coveredBranches)
            : undefined;

        // Calculate function/declaration coverage
        const functions = Object.values(coverageData.f);
        const coveredFunctions = functions.filter((count) => count > 0).length;
        const declarationCoverage =
          functions.length > 0
            ? new vscode.TestCoverageCount(coveredFunctions, functions.length - coveredFunctions)
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

  /**
   * Load detailed coverage for a file
   */
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
      // Add statement coverage details
      for (const [id, location] of Object.entries(data.statementMap)) {
        const executionCount = data.s[id] || 0;
        const range = this.convertLocationToRange(location);

        details.push(
          new vscode.StatementCoverage(
            executionCount,
            range,
            // Optional: add branches if this statement has associated branches
          ),
        );
      }

      // Add function/declaration coverage details
      for (const [id, fn] of Object.entries(data.fnMap)) {
        const executionCount = data.f[id] || 0;
        const range = this.convertLocationToRange(fn.loc);

        details.push(new vscode.DeclarationCoverage(fn.name || `Function ${id}`, executionCount, range));
      }

      // Add branch coverage details
      for (const [id, branch] of Object.entries(data.branchMap)) {
        const branchCounts = data.b[id] || [];
        const range = this.convertLocationToRange(branch.loc);

        // Create branch coverage for each branch location
        const branches = branch.locations.map((loc, index) => {
          const branchRange = this.convertLocationToRange(loc);
          const count = branchCounts[index] || 0;
          return new vscode.BranchCoverage(count, branchRange, branch.type);
        });

        // Add a statement coverage for the branch point with the branches
        if (branches.length > 0) {
          // Use the first branch's count as the statement's execution count
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

  /**
   * Convert Istanbul location to VS Code Range
   */
  private convertLocationToRange(location: LocationRange): vscode.Range {
    // Istanbul uses 1-based line numbers, VS Code uses 0-based
    return new vscode.Range(
      new vscode.Position(location.start.line - 1, location.start.column),
      new vscode.Position(location.end.line - 1, location.end.column),
    );
  }
}
