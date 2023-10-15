import { parse, ParsedNode } from './parser';
import { CodeLens, CodeLensProvider, Range, TextDocument } from 'vscode';
import { findFullTestName, CodeLensOption } from './codeLensUtil';

function getCodeLensForOption(range: Range, codeLensOption: CodeLensOption, fullTestName: string): CodeLens {
  const titleMap: Record<CodeLensOption, string> = {
    run: 'Run',
    debug: 'Debug',
    watch: 'Run --watch',
    coverage: 'Run --coverage',
  };
  const commandMap: Record<CodeLensOption, string> = {
    run: 'extension.runJest',
    debug: 'extension.debugJest',
    watch: 'extension.watchJest',
    coverage: 'extension.runJestCoverage',
  };
  return new CodeLens(range, {
    arguments: [fullTestName],
    title: titleMap[codeLensOption],
    command: commandMap[codeLensOption],
  });
}

function getTestsBlocks(
  parsedNode: ParsedNode,
  parseResults: ParsedNode[],
  codeLensOptions: CodeLensOption[]
): CodeLens[] {
  const codeLens: CodeLens[] = [];

  parsedNode.children?.forEach((subNode) => {
    codeLens.push(...getTestsBlocks(subNode, parseResults, codeLensOptions));
  });

  const range = new Range(
    parsedNode.start.line - 1,
    parsedNode.start.column,
    parsedNode.end.line - 1,
    parsedNode.end.column
  );

  if (parsedNode.type === 'expect') {
    return [];
  }

  const fullTestName = findFullTestName(parsedNode.start.line, parseResults);

  codeLens.push(...codeLensOptions.map((option) => getCodeLensForOption(range, option, fullTestName)));

  return codeLens;
}

export class JestRunnerCodeLensProvider implements CodeLensProvider {
  constructor(private readonly codeLensOptions: CodeLensOption[]) {}

  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    return this.getCodeLenses(document.fileName, document.getText());
  }

  public async getCodeLenses(documentFileName: string, documentText: string): Promise<CodeLens[]> {
    try {
      const parseResults = parse(documentFileName, documentText, { plugins: { decorators: 'legacy' } }).root.children;
      const codeLens: CodeLens[] = [];
      parseResults.forEach((parseResult) =>
        codeLens.push(...getTestsBlocks(parseResult, parseResults, this.codeLensOptions))
      );
      return codeLens;
    } catch (e) {
      // Ignore error and keep showing Run/Debug buttons at same position
      console.error('jest-editor-support parser returned error', e);
    }
  }
}
