import { parse, ParsedNode } from 'jest-editor-support';
import { CodeLens, CodeLensProvider, Range, TextDocument } from 'vscode';
import { findFullTestName, escapeRegExp } from './util';

function getTestsBlocks(parsedNode: ParsedNode, parseResults: ParsedNode[]): CodeLens[] {
  const codeLens: CodeLens[] = [];

  parsedNode.children?.forEach(subNode => {
    codeLens.push(...getTestsBlocks(subNode, parseResults));
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

  codeLens.push(
    new CodeLens(range, {
      arguments: [fullTestName],
      command: 'extension.runJest',
      title: 'Run'
    }),
    new CodeLens(range, {
      arguments: [fullTestName],
      command: 'extension.debugJest',
      title: 'Debug'
    })
  );

  return codeLens;
}

export class JestRunnerCodeLensProvider implements CodeLensProvider {
  private prevResults: CodeLens[] | null = null;
  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    try {
      const text = document.getText()
      const parseResults = parse(document.fileName, text).root.children;
      const codeLens = [];
      parseResults.forEach(parseResult => codeLens.push(...getTestsBlocks(parseResult, parseResults)));
      this.prevResults = codeLens;
      return codeLens;
    } catch (e) {
      // Ignore error and keep showing Run/Debug buttons at same position
      return this.prevResults ?? []  
    }
  }
}