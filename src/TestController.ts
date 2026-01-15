import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { parse } from './parser';
import { escapeRegExp, updateTestNameIfUsingProperties, pushMany, TestNode, shouldIncludeFile, logInfo, logError, logWarning, logDebug, resolveTestNameStringInterpolation } from './util';
import { TestRunnerConfig } from './testRunnerConfig';
import { getTestFrameworkForFile, type TestFrameworkName } from './testDetection';
import { CoverageProvider, DetailedFileCoverage, type CoverageMap } from './coverageProvider';

interface JestAssertionResult {
  ancestorTitles: string[];
  title: string;
  fullName?: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';
  duration?: number;
  failureMessages?: string[];
  location?: { line: number; column: number } | null;
}

/**
 * Represents a test file result containing multiple test results
 */
interface JestFileResult {
  assertionResults: JestAssertionResult[];
  name: string;
  status: string;
  message: string;
  startTime: number;
  endTime: number;
  summary?: string;
}

/**
 * Root Jest results object
 */
interface JestResults {
  numFailedTestSuites: number;
  numFailedTests: number;
  numPassedTestSuites: number;
  numPassedTests: number;
  numPendingTestSuites: number;
  numPendingTests: number;
  numTotalTestSuites: number;
  numTotalTests: number;
  success: boolean;
  testResults: JestFileResult[];
}

export class JestTestController {
  private testController: vscode.TestController;
  private disposables: vscode.Disposable[] = [];
  private jestConfig: TestRunnerConfig;
  private coverageProvider: CoverageProvider;

  constructor(context: vscode.ExtensionContext) {
    this.jestConfig = new TestRunnerConfig();
    this.coverageProvider = new CoverageProvider();

    this.testController = vscode.tests.createTestController('jestVitestTestController', 'Jest/Vitest Tests');
    context.subscriptions.push(this.testController);

    // Create the standard run profile
    this.testController.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.runHandler(request, token),
      true,
    );

    // Add Debug profile
    this.testController.createRunProfile(
      'Debug',
      vscode.TestRunProfileKind.Debug,
      (request, token) => this.debugHandler(request, token),
      true,
    );

    // Add Coverage profile using the proper Coverage kind
    const coverageProfile = this.testController.createRunProfile(
      'Coverage',
      vscode.TestRunProfileKind.Coverage,
      (request, token) => this.coverageHandler(request, token),
      true,
    );

    // Set up detailed coverage loading
    coverageProfile.loadDetailedCoverage = async (testRun, fileCoverage, token) => {
      if (fileCoverage instanceof DetailedFileCoverage) {
        return this.coverageProvider.loadDetailedCoverage(fileCoverage, token);
      }
      return [];
    };

    // Add Update Snapshots profile
    this.testController.createRunProfile(
      'Update Snapshots',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.runHandler(request, token, ['-u']),
      false, // Not default
    );

    // Start discovering tests when a workspace folder is available
    if (vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        this.discoverTests(workspaceFolder);
      }
    }

    // Watch for file changes to update tests
    this.setupFileWatcher();
  }

  // Function to discover tests in the workspace
  private async discoverTests(workspaceFolder: vscode.WorkspaceFolder) {
    const testFiles = await this.findJestTestFiles(workspaceFolder.uri.fsPath);

    for (const file of testFiles) {
      const fileUri = vscode.Uri.file(file);
      const relativePath = path.relative(workspaceFolder.uri.fsPath, file);

      // Create a test item for the file
      const testItem = this.testController.createTestItem(file, relativePath, fileUri);
      this.testController.items.add(testItem);

      // Parse the file to find individual tests
      this.parseTestsInFile(file, testItem);
    }
  }

  // Parse a test file to find individual tests using the Jest parser
  private parseTestsInFile(filePath: string, parentItem: vscode.TestItem) {
    try {
      // Use the parser from JestRunner to get the test structure
      const testFile = parse(filePath);

      if (!testFile || !testFile.root || !testFile.root.children) {
        return;
      }

      // Process describe blocks and test cases
      this.processTestNodes(testFile.root.children, parentItem, filePath);
    } catch (error) {
      logError(`Error parsing tests in ${filePath}`, error);
    }
  }

  // Process test nodes (recursively)
  private processTestNodes(nodes: TestNode[], parentItem: vscode.TestItem, filePath: string, namePrefix: string = '') {
    for (const node of nodes) {
      // Only process valid nodes
      if (!node.name) {
        continue;
      }

      // Get full test name with proper escaping
      const fullName = namePrefix ? `${namePrefix} ${node.name}` : node.name;

      // Clean up property references in the test name
      const cleanTestName = updateTestNameIfUsingProperties(node.name);
      const cleanFullName = updateTestNameIfUsingProperties(fullName);

      // Create a more reliable ID that avoids special character issues
      const testId = `${filePath}:${node.type}:${node.start?.line || 0}:${escapeRegExp(cleanFullName || fullName)}`;

      // Create test item for this node with the clean name for display
      const testItem = this.testController.createTestItem(testId, cleanTestName || node.name, parentItem.uri);

      // Add proper test info/metadata
      testItem.tags = node.type === 'describe' ? [new vscode.TestTag('suite')] : [new vscode.TestTag('test')];

      // Set the range for navigation/highlighting
      if (node.start && node.start.line > 0) {
        try {
          testItem.range = new vscode.Range(
            new vscode.Position(node.start.line - 1, node.start.column || 0),
            new vscode.Position((node.end?.line || node.start.line) - 1, node.end?.column || 100),
          );
        } catch (error) {
          logError(`Error setting range for ${node.name}`, error);
        }
      }

      // Add this test to the parent
      parentItem.children.add(testItem);

      // If this is a describe block with children, process them recursively
      if (node.children && node.children.length > 0) {
        this.processTestNodes(node.children, testItem, filePath, cleanFullName || fullName);
      }
    }
  }

  // Find Jest test files in the workspace
  private async findJestTestFiles(folderPath: string): Promise<string[]> {
    const pattern = new vscode.RelativePattern(
      folderPath,
      this.jestConfig.getTestFilePattern(),
    );
    const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');

    // Filter files using the shared utility
    return files.map((file) => file.fsPath).filter((filePath) => shouldIncludeFile(filePath, folderPath));
  }

  /**
   * Process test results from Jest output (legacy method for backwards compatibility)
   */
  private processTestResults(output: string, tests: vscode.TestItem[], run: vscode.TestRun): void {
    // Use Jest as default framework for backwards compatibility
    this.processTestResultsWithFramework(output, tests, run, 'jest');
  }

  /**
   * Process coverage data from test output and add to test run
   */
  private processCoverageData(output: string, run: vscode.TestRun, workspaceFolder: string): void {
    try {
      const coverageMap = this.coverageProvider.parseCoverageFromOutput(output);
      
      if (!coverageMap) {
        logDebug('No coverage data found in output. Note: Vitest writes coverage to files, not JSON output.');
        logInfo('For Vitest coverage, ensure you have @vitest/coverage-v8 or @vitest/coverage-istanbul installed.');
        return;
      }

      const fileCoverages = this.coverageProvider.convertToVSCodeCoverage(coverageMap, workspaceFolder);
      
      logInfo(`Adding coverage for ${fileCoverages.length} files`);
      
      for (const fileCoverage of fileCoverages) {
        run.addCoverage(fileCoverage);
      }
    } catch (error) {
      logError('Failed to process coverage data', error);
    }
  }

  /**
   * Execute Jest command asynchronously with cancellation support
   */
  private executeJestCommand(
    command: string,
    args: string[],
    token: vscode.CancellationToken,
    tests: vscode.TestItem[],
    run: vscode.TestRun,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      // Get configurable max buffer size (default 50MB)
      const maxBufferSize = vscode.workspace.getConfiguration('jestrunner').get<number>('maxBufferSize', 50) * 1024 * 1024;
      
      const jestProcess = spawn(command, args, {
        cwd: this.jestConfig.cwd,
        env: { ...process.env, FORCE_COLOR: 'true' },
        shell: true,
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      jestProcess.stdout?.on('data', (data) => {
        if (killed) return;
        
        const chunk = data.toString();
        // Check before adding to prevent exceeding buffer
        if (stdout.length + chunk.length > maxBufferSize) {
          killed = true;
          jestProcess.kill();
          tests.forEach((test) => run.failed(test, new vscode.TestMessage('Test output exceeded maximum buffer size')));
          resolve(null);
          return;
        }
        stdout += chunk;
      });

      jestProcess.stderr?.on('data', (data) => {
        if (killed) return;
        
        const chunk = data.toString();
        // Also limit stderr to prevent memory issues
        if (stderr.length + chunk.length > maxBufferSize) {
          killed = true;
          jestProcess.kill();
          tests.forEach((test) => run.failed(test, new vscode.TestMessage('Error output exceeded maximum buffer size')));
          resolve(null);
          return;
        }
        stderr += chunk;
      });

      jestProcess.on('error', (error) => {
        tests.forEach((test) => run.failed(test, new vscode.TestMessage(`Failed to execute Jest: ${error.message}`)));
        resolve(null);
      });

      jestProcess.on('close', (code) => {
        cancellationListener.dispose();
        
        if (token.isCancellationRequested) {
          tests.forEach((test) => run.skipped(test));
          resolve(null);
          return;
        }

        // Jest returns non-zero exit code on test failures, but that's okay
        if (stdout) {
          resolve(stdout);
        } else if (stderr) {
          // If no stdout but stderr exists, it's likely an error
          tests.forEach((test) => run.failed(test, new vscode.TestMessage(stderr)));
          resolve(null);
        } else {
          tests.forEach((test) => run.failed(test, new vscode.TestMessage('No output from Jest')));
          resolve(null);
        }
      });

      // Handle cancellation
      const cancellationListener = token.onCancellationRequested(() => {
        jestProcess.kill();
        tests.forEach((test) => run.skipped(test));
        resolve(null);
      });
    });
  }

  /**
   * Parse Jest JSON output from command output with improved regex
   */
  private parseJestOutput(output: string): JestResults | undefined {
    try {
      // First try to match complete JSON format (Jest)
      const jsonRegex = /({"numFailedTestSuites":.*?"wasInterrupted":.*?})/s;
      const jsonMatch = output.match(jsonRegex);

      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }

      // Fallback to more general regex
      const fallbackMatch = output.match(/(\{.*"testResults".*\})/s);
      if (fallbackMatch && fallbackMatch[1]) {
        return JSON.parse(fallbackMatch[1]);
      }

      return undefined;
    } catch (e) {
      logDebug(`Failed to parse Jest JSON output: ${e}`);
      return undefined;
    }
  }

  /**
   * Parse Vitest JSON output from command output
   */
  private parseVitestOutput(output: string): JestResults | undefined {
    try {
      // Vitest with --reporter=json outputs JSON directly
      // Try to find the JSON object in the output
      const lines = output.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') && trimmed.includes('"testResults"')) {
          try {
            const parsed = JSON.parse(trimmed);
            // Convert Vitest format to Jest-compatible format if needed
            return this.convertVitestToJestResults(parsed);
          } catch {
            // Continue searching
          }
        }
      }

      // Try full output as JSON
      const jsonMatch = output.match(/(\{[\s\S]*"testResults"[\s\S]*\})/m);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        return this.convertVitestToJestResults(parsed);
      }

      return undefined;
    } catch (e) {
      logDebug(`Failed to parse Vitest JSON output: ${e}`);
      return undefined;
    }
  }

  /**
   * Convert Vitest output format to Jest-compatible format
   */
  private convertVitestToJestResults(vitestOutput: any): JestResults {
    // Vitest's JSON reporter output is similar to Jest's but may have slight differences
    // Both use testResults array with assertionResults
    if (vitestOutput.numFailedTestSuites !== undefined) {
      // Already in Jest-compatible format
      return vitestOutput as JestResults;
    }

    // If Vitest output has different structure, convert it
    const results: JestResults = {
      numFailedTestSuites: vitestOutput.numFailedTestSuites || 0,
      numFailedTests: vitestOutput.numFailedTests || 0,
      numPassedTestSuites: vitestOutput.numPassedTestSuites || 0,
      numPassedTests: vitestOutput.numPassedTests || 0,
      numPendingTestSuites: vitestOutput.numPendingTestSuites || 0,
      numPendingTests: vitestOutput.numPendingTests || 0,
      numTotalTestSuites: vitestOutput.numTotalTestSuites || 0,
      numTotalTests: vitestOutput.numTotalTests || 0,
      success: vitestOutput.success ?? (vitestOutput.numFailedTests === 0),
      testResults: vitestOutput.testResults || [],
    };

    return results;
  }

  /**
   * Process test results from Jest or Vitest output
   */
  private processTestResultsWithFramework(output: string, tests: vscode.TestItem[], run: vscode.TestRun, framework: TestFrameworkName): void {
    const results = framework === 'vitest' 
      ? this.parseVitestOutput(output) 
      : this.parseJestOutput(output);
    
    if (results) {
      this.processTestResultsFromParsed(results, tests, run);
    } else {
      // Fallback to simple parsing
      this.processTestResultsFallback(output, tests, run);
    }
  }

  /**
   * Check if a test title matches a label, supporting it.each template variables
   * like $description, $tags, %s, %p, etc.
   */
  private matchesTestLabel(resultTitle: string, testLabel: string): boolean {
    // Direct match
    if (resultTitle === testLabel) {
      return true;
    }
    
    // Check if label contains template variables (it.each pattern)
    // Template variables: $varName, ${varName}, %s, %p, %d, %i, %f, %j, %o, %#, %%
    const hasTemplateVar = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/i.test(testLabel);
    if (hasTemplateVar) {
      // Convert template to regex pattern and test against result
      const pattern = resolveTestNameStringInterpolation(testLabel);
      try {
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(resultTitle);
      } catch {
        // Invalid regex, fall back to direct comparison
        return false;
      }
    }
    
    return false;
  }

  /**
   * Process test results from parsed JSON
   */
  private processTestResultsFromParsed(results: JestResults, tests: vscode.TestItem[], run: vscode.TestRun): void {
    if (results?.testResults?.[0]?.assertionResults) {
      const testResults = results.testResults[0].assertionResults;
      logDebug(`Processing ${testResults.length} test results for ${tests.length} test items`);

      // Create a map to track which results have been used
      const usedResults = new Set<number>();

      // Process each test with improved matching including location
      tests.forEach((test) => {
        // Get clean test name without describe blocks
        const testName = test.label.split(' ').pop() || test.label;
        const testLine = test.range?.start.line;

        // Find all potential matches
        const potentialMatches = testResults
          .map((r, index) => ({ result: r, index }))
          .filter(
            ({ result: r }) =>
              // Direct title match or template match (for it.each)
              this.matchesTestLabel(r.title, test.label) ||
              // Base name match (without describe blocks)
              this.matchesTestLabel(r.title, testName) ||
              // Full name match
              r.fullName === test.label ||
              // Ancestor titles + title match the label
              (r.ancestorTitles && this.matchesTestLabel(r.ancestorTitles.concat(r.title).join(' '), test.label)),
          );

        let matchingResult: JestAssertionResult | undefined;
        let matchedIndex = -1;
        
        // For it.each tests, we may have multiple results that all match the same template
        // In this case, we aggregate the results - if any fails, the test fails
        const hasTemplateVar = /(\$\{?[A-Za-z0-9_]+\}?|%[psdifjo#%])/i.test(test.label);

        if (potentialMatches.length > 0) {
          if (hasTemplateVar && potentialMatches.length > 1) {
            // This is an it.each test with multiple parameterized results
            // Aggregate all matching results
            logDebug(`Found ${potentialMatches.length} it.each results for "${test.label}"`);
            
            const allResults = potentialMatches.map(m => m.result);
            const failedResults = allResults.filter(r => r.status === 'failed');
            const passedResults = allResults.filter(r => r.status === 'passed');
            
            // Mark all these results as used
            potentialMatches.forEach(m => usedResults.add(m.index));
            
            if (failedResults.length > 0) {
              // At least one failed - report as failed with all failure messages
              const allFailureMessages = failedResults
                .flatMap(r => r.failureMessages || ['Test failed'])
                .map((msg, i) => `[${failedResults[i]?.title || i + 1}]: ${msg}`)
                .join('\n\n');
              run.failed(test, new vscode.TestMessage(allFailureMessages));
            } else if (passedResults.length > 0) {
              // All passed
              run.passed(test);
            } else {
              // All skipped
              run.skipped(test);
            }
            return; // Skip the normal result processing
          } else if (potentialMatches.length === 1) {
            // Only one match, use it
            matchingResult = potentialMatches[0].result;
            matchedIndex = potentialMatches[0].index;
          } else {
            // Multiple matches with same name - use location to disambiguate
            logDebug(`Found ${potentialMatches.length} potential matches for "${test.label}", using location to match`);
            
            // First try: match by line number if available
            if (testLine !== undefined) {
              const locationMatch = potentialMatches.find(
                ({ result: r, index }) => 
                  !usedResults.has(index) && 
                  r.location?.line !== undefined && 
                  r.location.line === testLine + 1 // Jest uses 1-based line numbers
              );
              
              if (locationMatch) {
                matchingResult = locationMatch.result;
                matchedIndex = locationMatch.index;
              }
            }
            
            // Second try: use the first unused result
            if (!matchingResult) {
              const unusedMatch = potentialMatches.find(({ index }) => !usedResults.has(index));
              if (unusedMatch) {
                matchingResult = unusedMatch.result;
                matchedIndex = unusedMatch.index;
              }
            }
          }
        }

        if (matchingResult) {
          // Mark this result as used
          if (matchedIndex >= 0) {
            usedResults.add(matchedIndex);
          }
          
          logDebug(`Found match for "${test.label}" at line ${testLine}: ${matchingResult.status}`);
          if (matchingResult.status === 'passed') {
            run.passed(test);
          } else if (matchingResult.status === 'failed') {
            const message = new vscode.TestMessage(matchingResult.failureMessages?.join('\n') || 'Test failed');
            run.failed(test, message);
          } else {
            // Handle skipped, todo, pending
            run.skipped(test);
          }
        } else {
          logDebug(`No match found for test "${test.label}"`);
          // Default to skipped if no match found
          run.skipped(test);
        }
      });
    } else {
      logWarning('No assertion results found in test output');
      tests.forEach((test) => run.skipped(test));
    }
  }

  /**
   * Fallback test result processing when JSON parsing fails
   */
  private processTestResultsFallback(output: string, tests: vscode.TestItem[], run: vscode.TestRun): void {
    logWarning('Failed to parse test results, falling back to simple parsing');

    // Check for failure indicators
    const hasFail = output.includes('FAIL') || output.includes('✗') || output.includes('×');
    
    if (hasFail) {
      const failLines = output.split('\n').filter((line) => 
        line.includes('●') || line.includes('✗') || line.includes('×') || line.includes('AssertionError')
      );

      tests.forEach((test) => {
        // Check if this specific test name is mentioned in a failure line
        const testFailed = failLines.some(
          (line) =>
            line.includes(test.label) ||
            (test.label.includes(' ') && line.includes(test.label.split(' ').pop() || '')),
        );

        if (testFailed) {
          run.failed(test, new vscode.TestMessage('Test failed'));
        } else {
          run.passed(test);
        }
      });
    } else {
      // All passed
      tests.forEach((test) => run.passed(test));
    }
  }

  // Modified run handler to accept additional args
  private async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    additionalArgs: string[] = [],
  ) {
    return this.executeTests(request, token, additionalArgs, false);
  }

  // Coverage handler using the proper Coverage profile
  private async coverageHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ) {
    // Note: We don't pass --json here, it will be added in executeTests based on framework
    return this.executeTests(request, token, ['--coverage'], true);
  }

  // Main test execution method
  private async executeTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    additionalArgs: string[] = [],
    collectCoverage: boolean = false,
  ) {
    const run = this.testController.createTestRun(request);

    // Group tests by file
    const testsByFile = new Map<string, vscode.TestItem[]>();

    // Collect all tests, grouped by file
    const collectTests = (test: vscode.TestItem) => {
      if (request.exclude?.includes(test)) {
        return;
      }

      if (test.children.size > 0) {
        // Process suite children
        test.children.forEach((child) => collectTests(child));
      } else if (test.uri) {
        // Group individual tests by file path
        const filePath = test.uri.fsPath;
        if (!testsByFile.has(filePath)) {
          testsByFile.set(filePath, []);
        }
        testsByFile.get(filePath)!.push(test);
      }
    };

    // Collect tests from the request
    if (request.include) {
      request.include.forEach((test) => collectTests(test));
    } else {
      this.testController.items.forEach((test) => collectTests(test));
    }

    // Mark all tests as started
    testsByFile.forEach((tests) => {
      tests.forEach((test) => run.started(test));
    });

    if (token.isCancellationRequested) {
      run.end();
      return;
    }

    try {
      // Batch all test files into a single command
      const allFiles = Array.from(testsByFile.keys());
      const allTests = Array.from(testsByFile.values()).flat();

      if (allFiles.length === 0) {
        run.end();
        return;
      }

      // Determine workspace folder
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(allFiles[0]))?.uri.fsPath;
      if (!workspaceFolder) {
        allTests.forEach((test) => run.failed(test, new vscode.TestMessage('Could not determine workspace folder')));
        run.end();
        return;
      }

      // Detect the test framework for the first file (assuming all files use the same framework)
      const framework = getTestFrameworkForFile(allFiles[0]) || 'jest';
      const isVitest = framework === 'vitest';

      // Build command: run all test files in a single invocation
      // Use file pattern if multiple files, otherwise specific file with optional test name pattern
      let args: string[];
      const fileItem = allFiles.length === 1 ? this.testController.items.get(allFiles[0]) : undefined;
      const totalTestsInFile = fileItem?.children.size ?? 0;
      
      if (allFiles.length === 1 && testsByFile.get(allFiles[0])!.length < totalTestsInFile) {
        // Single file with specific tests - use test name pattern
        const tests = testsByFile.get(allFiles[0])!;
        const testNamePattern = tests.length > 1
          ? `(${tests.map((test) => escapeRegExp(updateTestNameIfUsingProperties(test.label))).join('|')})`
          : escapeRegExp(updateTestNameIfUsingProperties(tests[0].label));
        
        if (isVitest) {
          // For Vitest: --reporter=json gives test results, but coverage needs special handling
          // Vitest doesn't include coverage in JSON output, it writes to coverage/ folder
          const vitestAdditionalArgs = [...additionalArgs, '--reporter=json'];
          args = this.jestConfig.buildVitestArgs(allFiles[0], testNamePattern, true, vitestAdditionalArgs);
        } else {
          args = this.jestConfig.buildJestArgs(allFiles[0], testNamePattern, true, [...additionalArgs, '--json']);
        }
      } else {
        // Multiple files or whole file - just pass file paths
        if (isVitest) {
          const vitestConfigPath = this.jestConfig.getVitestConfigPath(allFiles[0]);
          args = [
            'run',
            ...allFiles,
            '--reporter=json',
            ...(vitestConfigPath ? ['--config', vitestConfigPath] : []),
            ...additionalArgs,
          ];
        } else {
          const jestConfigPath = this.jestConfig.getJestConfigPath(allFiles[0]);
          args = [
            ...allFiles,
            '--json',
            ...(jestConfigPath ? ['-c', jestConfigPath] : []),
            ...additionalArgs,
          ];
        }
      }

      const testCommand = isVitest ? this.jestConfig.vitestCommand : this.jestConfig.jestCommand;
      const commandParts = testCommand.split(' ');
      const command = commandParts[0];
      const commandArgs = [...commandParts.slice(1), ...args];
      
      logInfo(`Running batched ${framework} command: ${command} ${commandArgs.join(' ')} (${allTests.length} tests across ${allFiles.length} files)`);

      // Execute test command with spawn for async execution
      const output = await this.executeJestCommand(command, commandArgs, token, allTests, run);
      
      if (output === null) {
        // Cancelled or failed
        run.end();
        return;
      }

      // Process all test results with the appropriate framework parser
      this.processTestResultsWithFramework(output, allTests, run, framework);

      // If collecting coverage, parse and add coverage data
      if (collectCoverage && workspaceFolder) {
        this.processCoverageData(output, run, workspaceFolder);
      }
    } catch (error) {
      const errOutput = error instanceof Error ? error.message : (error ? String(error) : 'Test execution failed');
      testsByFile.forEach((tests) => {
        tests.forEach((test) => run.failed(test, new vscode.TestMessage(errOutput)));
      });
    }

    run.end();
  }

  private async debugHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
    const queue: vscode.TestItem[] = [];

    if (request.include) {
      request.include.forEach((test) => queue.push(test));
    } else {
      this.testController.items.forEach((test) => queue.push(test));
    }

    // Process one test at a time for debugging
    for (const test of queue) {
      if (token.isCancellationRequested) {
        break;
      }

      if (request.exclude?.includes(test)) {
        continue;
      }

      // Only debug leaf nodes (actual tests, not test suites)
      if (test.children.size === 0) {
        await this.debugJestTest(test);
        break; // Only debug the first test to avoid confusion
      } else {
        // Find the first leaf node in this suite
        test.children.forEach((child) => {
          queue.push(child);
        });
      }
    }
  }

  private async debugJestTest(test: vscode.TestItem) {
    const filePath = test.uri!.fsPath;
    const testName = test.children.size === 0 ? test.label : undefined;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(test.uri!);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Could not determine workspace folder');
      return;
    }

    // Get the base debug configuration from the unified method (pass filePath to detect framework)
    const debugConfig = this.jestConfig.getDebugConfiguration(filePath);
    // Use buildTestArgs to support both Jest and Vitest
    const standardArgs = this.jestConfig.buildTestArgs(filePath, testName, false);
    pushMany(debugConfig.args, standardArgs);

    // Start debugging with the workspace folder context
    return vscode.debug.startDebugging(workspaceFolder, debugConfig);
  }

  private setupFileWatcher() {
    const pattern = this.jestConfig.getTestFilePattern();
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange((uri) => {
      const item = this.testController.items.get(uri.fsPath);
      if (item) {
        item.children.replace([]);
        this.parseTestsInFile(uri.fsPath, item);
      }
    });

    watcher.onDidCreate((uri) => {
      if (vscode.workspace.workspaceFolders) {
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
          if (uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
            const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
            const testItem = this.testController.createTestItem(uri.fsPath, relativePath, uri);
            this.testController.items.add(testItem);
            this.parseTestsInFile(uri.fsPath, testItem);
          }
        }
      }
    });

    watcher.onDidDelete((uri) => {
      const item = this.testController.items.get(uri.fsPath);
      if (item) {
        this.testController.items.delete(uri.fsPath);
      }
    });

    this.disposables.push(watcher);
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.testController.dispose();
  }
}
