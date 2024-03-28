import { parse, ParsedNode } from './parser';
import { CodeLens, CodeLensProvider, Range, TextDocument } from 'vscode';
import { findFullTestName, escapeRegExp, CodeLensOption } from './util';

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

  const fullTestName = escapeRegExp(findFullTestName(parsedNode.start.line, parseResults));

  codeLens.push(...codeLensOptions.map((option) => getCodeLensForOption(range, option, fullTestName)));

  return codeLens;
}

export class JestRunnerCodeLensProvider implements CodeLensProvider {
  private lastSuccessfulCodeLens: CodeLens[] = [];

  constructor(private readonly codeLensOptions: CodeLensOption[]) {}

  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    try {
      const parseResults = parse(document.fileName, document.getText(), { plugins: { decorators: 'legacy' } }).root
        .children;
      this.lastSuccessfulCodeLens = parseResults.flatMap((parseResult) =>
        getTestsBlocks(parseResult, parseResults, this.codeLensOptions)
      );
    } catch (e) {
      console.error('jest-editor-support parser returned error', e);
    }
    return this.lastSuccessfulCodeLens;
  }
}
