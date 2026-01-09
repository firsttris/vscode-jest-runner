import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';
import { parse } from './parser';
import { escapeRegExp, updateTestNameIfUsingProperties, pushMany, TestNode, shouldIncludeFile } from './util';
import { JestRunnerConfig } from './jestRunnerConfig';

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
  private jestConfig: JestRunnerConfig;

  constructor(context: vscode.ExtensionContext) {
    this.jestConfig = new JestRunnerConfig();

    this.testController = vscode.tests.createTestController('jestTestController', 'Jest Tests');
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

    // Add Coverage profile (custom)
    this.testController.createRunProfile(
      'Run with Coverage',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.runHandler(request, token, ['--coverage']),
      true,
    );

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
      console.error(`Error parsing tests in ${filePath}:`, error);
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
          console.error(`Error setting range for ${node.name}: ${error}`);
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
      vscode.workspace.getConfiguration().get('jestrunner.testFilePattern') as string,
    );
    const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');

    // Filter files using the shared utility
    return files.map((file) => file.fsPath).filter((filePath) => shouldIncludeFile(filePath, folderPath));
  }

  /**
   * Process test results from Jest output
   */
  private processTestResults(output: string, tests: vscode.TestItem[], run: vscode.TestRun): void {
    const results = this.parseJestOutput(output);

    if (results?.testResults?.[0]?.assertionResults) {
      const testResults = results.testResults[0].assertionResults;
      console.log(`Processing ${testResults.length} test results for ${tests.length} test items`);

      // Process each test with improved matching
      tests.forEach((test) => {
        // Get clean test name without describe blocks
        const testName = test.label.split(' ').pop() || test.label;

        // Try different matching strategies
        const matchingResult = testResults.find(
          (r) =>
            // Direct title match
            r.title === test.label ||
            // Base name match (without describe blocks)
            r.title === testName ||
            // Full name match
            r.fullName === test.label ||
            // Ancestor titles + title match the label
            (r.ancestorTitles && r.ancestorTitles.concat(r.title).join(' ') === test.label),
        );

        if (matchingResult) {
          console.log(`Found match for "${test.label}": ${matchingResult.status}`);
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
          console.log(`No match found for test "${test.label}"`);
          // Default to skipped if no match found
          run.skipped(test);
        }
      });
    } else {
      console.log('Failed to parse test results, falling back to simple parsing');

      // Instead of using "FAIL" presence to fail all tests,
      // try to be smarter about individual tests
      if (output.includes('FAIL')) {
        const failLines = output.split('\n').filter((line) => line.includes('●'));

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
  }

  /**
   * Parse Jest JSON output from command output with improved regex
   */
  private parseJestOutput(output: string): JestResults | undefined {
    try {
      // First try to match complete JSON format - without using the 's' flag
      const jsonRegex = /({"numFailedTestSuites":[\s\S]*?"wasInterrupted":[\s\S]*?})/;
      const jsonMatch = output.match(jsonRegex);

      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }

      // Fallback to more general regex
      const fallbackMatch = output.match(/(\{[\s\S]*"testResults"[\s\S]*\})/);
      if (fallbackMatch && fallbackMatch[1]) {
        return JSON.parse(fallbackMatch[1]);
      }

      return undefined;
    } catch (e) {
      console.log('Failed to parse Jest JSON output:', e);
      return undefined;
    }
  }

  // Modified run handler to accept additional args
  private async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    additionalArgs: string[] = [],
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
      // Batch all test files into a single Jest command
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

      // Build command: run all test files in a single Jest invocation
      // Use file pattern if multiple files, otherwise specific file with optional test name pattern
      let args: string[];
      if (allFiles.length === 1 && testsByFile.get(allFiles[0])!.length < allTests.length) {
        // Single file with specific tests - use test name pattern
        const tests = testsByFile.get(allFiles[0])!;
        const testNamePattern = tests.length > 1
          ? `(${tests.map((test) => escapeRegExp(updateTestNameIfUsingProperties(test.label))).join('|')})`
          : tests[0].label;
        args = this.jestConfig.buildJestArgs(allFiles[0], testNamePattern, true, [...additionalArgs, '--json']);
      } else {
        // Multiple files or whole file - just pass file paths
        args = [
          ...allFiles,
          '--json',
          ...additionalArgs,
        ];
      }

      const command = `${this.jestConfig.jestCommand} ${args.join(' ')}`;
      console.log('Running batched command:', command, `(${allTests.length} tests across ${allFiles.length} files)`);

      let output: string;
      try {
        output = execSync(command, {
          cwd: this.jestConfig.cwd,
          encoding: 'utf-8',
          env: { ...process.env, FORCE_COLOR: 'true' },
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large test outputs
        });
      } catch (error) {
        // Jest returns non-zero exit code on test failures
        if (error.stdout) {
          output = error.stdout;
        } else {
          allTests.forEach((test) => run.failed(test, new vscode.TestMessage(error.message || 'Test execution failed')));
          run.end();
          return;
        }
      }

      // Process all test results
      this.processTestResults(output, allTests, run);
    } catch (error) {
      const errOutput = error.message || 'Test execution failed';
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

    // Get the base debug configuration from the unified method
    const debugConfig = this.jestConfig.getDebugConfiguration();
    const standardArgs = this.jestConfig.buildJestArgs(filePath, testName, false);
    pushMany(debugConfig.args, standardArgs);

    // Start debugging with the workspace folder context
    return vscode.debug.startDebugging(workspaceFolder, debugConfig);
  }

  private setupFileWatcher() {
    const pattern = vscode.workspace.getConfiguration().get('jestrunner.testFilePattern') as string;
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
