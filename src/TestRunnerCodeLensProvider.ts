import { parse } from './parser';
import {
  CodeLens,
  CodeLensProvider,
  Range,
  TextDocument,
  window,
  workspace,
} from 'vscode';
import {
  findFullTestName,
  escapeRegExp,
  CodeLensOption,
  TestNode,
  shouldIncludeFile,
  logError,
} from './util';

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
  private lastSuccessfulCodeLens: CodeLens[] = [];

  constructor(private readonly codeLensOptions: CodeLensOption[]) {}

  private get currentWorkspaceFolderPath(): string | undefined {
    const editor = window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    const workspaceFolder = workspace.getWorkspaceFolder(editor.document.uri);
    return workspaceFolder?.uri.fsPath;
  }

  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    try {
      const workspaceFolderPath = this.currentWorkspaceFolderPath;
      if (
        !workspaceFolderPath ||
        !shouldIncludeFile(document.fileName, workspaceFolderPath)
      ) {
        return this.lastSuccessfulCodeLens;
      }

      const parseResults = parse(document.fileName, document.getText(), {
        plugins: { decorators: 'legacy' },
      }).root.children;
      
      this.lastSuccessfulCodeLens = parseResults.flatMap((parseResult) =>
        getTestsBlocks(parseResult, parseResults, this.codeLensOptions),
      );
    } catch (e) {
      logError('jest-editor-support parser returned error', e);
    }
    return this.lastSuccessfulCodeLens;
  }
}
