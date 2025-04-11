import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';
import { parse } from './parser';
import {
  escapeRegExp,
  updateTestNameIfUsingProperties,
  pushMany,
  extractTestNameFromId,
  TestNode,
  shouldIncludeFile,
} from './util';
import { JestRunnerConfig } from './jestRunnerConfig';

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

  // Modified run handler to accept additional args
  private async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    additionalArgs: string[] = [],
  ) {
    const run = this.testController.createTestRun(request);
    const queue: vscode.TestItem[] = [];

    if (request.include) {
      request.include.forEach((test) => queue.push(test));
    } else {
      this.testController.items.forEach((test) => queue.push(test));
    }

    while (queue.length > 0 && !token.isCancellationRequested) {
      const test = queue.shift()!;

      if (request.exclude?.includes(test)) {
        continue;
      }

      if (test.children.size > 0) {
        test.children.forEach((child) => queue.push(child));
        continue;
      }

      // Run the test
      run.started(test);

      try {
        // Execute Jest for this specific test with additional args
        const result = this.executeJestTest(test, additionalArgs);

        if (result.success) {
          run.passed(test);
        } else {
          run.failed(test, new vscode.TestMessage(result.message));
        }
      } catch (error) {
        run.failed(test, new vscode.TestMessage(`Error: ${error}`));
      }
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
    const testName = extractTestNameFromId(test);

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(test.uri!)?.uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Could not determine workspace folder');
      return;
    }

    // Get the base debug configuration from the unified method
    const debugConfig = this.jestConfig.getDebugConfiguration();
    const standardArgs = this.jestConfig.buildJestArgs(filePath, testName, false);
    pushMany(debugConfig.args, standardArgs);

    // Start debugging with the workspace folder context
    return vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(test.uri!), debugConfig);
  }

  private executeJestTest(test: vscode.TestItem, additionalArgs: string[] = []): { success: boolean; message: string } {
    const filePath = test.uri!.fsPath;
    const testName = extractTestNameFromId(test);

    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(test.uri!)?.uri.fsPath;
      if (!workspaceFolder) {
        return { success: false, message: 'Could not determine workspace folder' };
      }

      // Use the shared buildJestArgs method instead of manually building args
      const args = this.jestConfig.buildJestArgs(filePath, testName, true, additionalArgs);

      // Use the jestCommand getter to determine the correct command to use
      const command = `${this.jestConfig.jestCommand} ${args.join(' ')}`;
      console.log('command', command);

      const output = execSync(command, {
        cwd: this.jestConfig.cwd,
        encoding: 'utf-8',
        env: { ...process.env, FORCE_COLOR: 'true' },
      });

      return { success: true, message: output };
    } catch (error) {
      return {
        success: false,
        message: error.stdout || error.message || 'Test failed',
      };
    }
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
