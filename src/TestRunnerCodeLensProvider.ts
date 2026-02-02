import { parseTestFile } from './parser';
import {
  CodeLens,
  CodeLensProvider,
  Range,
  TextDocument,
  workspace,
} from 'vscode';
import { testFileCache } from './testDetection/testFileCache';
import { CodeLensOption } from './util';
import { escapeRegExp, findFullTestName, TestNode } from './utils/TestNameUtils';
import { logError } from './utils/Logger';

const CODE_LENS_CONFIG: Record<
  CodeLensOption,
  { title: string; command: string }
> = {
  run: { title: 'Run', command: 'extension.runJest' },
  debug: { title: 'Debug', command: 'extension.debugJest' },
  watch: { title: 'Run --watch', command: 'extension.watchJest' },
  coverage: { title: 'Run --coverage', command: 'extension.runJestCoverage' },
  'current-test-coverage': {
    title: 'Run --collectCoverageFrom (target file/dir)',
    command: 'extension.runJestCurrentTestCoverage',
  },
};

function getCodeLensForOption(
  range: Range,
  codeLensOption: CodeLensOption,
  fullTestName: string,
): CodeLens {
  const config = CODE_LENS_CONFIG[codeLensOption];
  return new CodeLens(range, {
    arguments: [fullTestName],
    title: config.title,
    command: config.command,
  });
}

function getTestsBlocks(
  parsedNode: TestNode,
  parseResults: TestNode[],
  codeLensOptions: CodeLensOption[],
): CodeLens[] {
  if (parsedNode.type === 'expect') {
    return [];
  }

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

  const fullTestName = escapeRegExp(
    findFullTestName(parsedNode.start.line, parseResults),
  );

  codeLens.push(
    ...codeLensOptions.map((option) =>
      getCodeLensForOption(range, option, fullTestName),
    ),
  );

  return codeLens;
}

export class TestRunnerCodeLensProvider implements CodeLensProvider {
  private lastSuccessfulCodeLens: Map<string, CodeLens[]> = new Map();

  constructor(private readonly codeLensOptions: CodeLensOption[]) { }

  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    try {
      const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
      const workspaceFolderPath = workspaceFolder?.uri.fsPath;
      if (!workspaceFolderPath || !testFileCache.isTestFile(document.fileName)) {
        return [];
      }

      const parseResults = parseTestFile(document.fileName, document.getText()).root.children ?? [];

      const codeLenses = parseResults.flatMap((parseResult) =>
        getTestsBlocks(parseResult, parseResults, this.codeLensOptions),
      );
      this.lastSuccessfulCodeLens.set(document.fileName, codeLenses);
      return codeLenses;
    } catch (e) {
      logError('parser returned error', e);
    }
    return this.lastSuccessfulCodeLens.get(document.fileName) ?? [];
  }
}
