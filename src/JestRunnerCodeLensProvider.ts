import { parse } from './parser';
import { CodeLens, CodeLensProvider, Range, TextDocument, window, workspace } from 'vscode';
import { findFullTestName, escapeRegExp, CodeLensOption, normalizePath, TestNode, shouldIncludeFile } from './util';
import { sync } from 'fast-glob';
import { isJestTestFile } from './jestDetection';

function getCodeLensForOption(range: Range, codeLensOption: CodeLensOption, fullTestName: string): CodeLens {
  const titleMap: Record<CodeLensOption, string> = {
    run: 'Run',
    debug: 'Debug',
    watch: 'Run --watch',
    coverage: 'Run --coverage',
    'current-test-coverage': 'Run --collectCoverageFrom (target file/dir)',
  };
  const commandMap: Record<CodeLensOption, string> = {
    run: 'extension.runJest',
    debug: 'extension.debugJest',
    watch: 'extension.watchJest',
    coverage: 'extension.runJestCoverage',
    'current-test-coverage': 'extension.runJestCurrentTestCoverage',
  };
  return new CodeLens(range, {
    arguments: [fullTestName],
    title: titleMap[codeLensOption],
    command: commandMap[codeLensOption],
  });
}

function getTestsBlocks(parsedNode: TestNode, parseResults: TestNode[], codeLensOptions: CodeLensOption[]): CodeLens[] {
  const codeLens: CodeLens[] = [];

  parsedNode.children?.forEach((subNode) => {
    codeLens.push(...getTestsBlocks(subNode, parseResults, codeLensOptions));
  });

  const range = new Range(
    parsedNode.start.line - 1,
    parsedNode.start.column,
    parsedNode.end.line - 1,
    parsedNode.end.column,
  );

  if (parsedNode.type === 'expect') {
    return [];
  }

  const fullTestName = escapeRegExp(findFullTestName(parsedNode.start.line, parseResults));

  codeLens.push(...codeLensOptions.map((option) => getCodeLensForOption(range, option, fullTestName)));

  return codeLens;
}

export class JestRunnerCodeLensProvider implements CodeLensProvider {
  private lastSuccessfulCodeLens: CodeLens[] = [];

  constructor(private readonly codeLensOptions: CodeLensOption[]) {}

  private get currentWorkspaceFolderPath(): string {
    const editor = window.activeTextEditor;
    return workspace.getWorkspaceFolder(editor.document.uri).uri.fsPath;
  }

  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    try {
      // Use the shared utility to determine if we should process this file
      if (!shouldIncludeFile(document.fileName, this.currentWorkspaceFolderPath)) {
        return [];
      }

      const parseResults = parse(document.fileName, document.getText(), { plugins: { decorators: 'legacy' } }).root
        .children;
      this.lastSuccessfulCodeLens = parseResults.flatMap((parseResult) =>
        getTestsBlocks(parseResult, parseResults, this.codeLensOptions),
      );
    } catch (e) {
      console.error('jest-editor-support parser returned error', e);
    }
    return this.lastSuccessfulCodeLens;
  }
}
