import { parse, ParsedNode } from 'jest-editor-support';
import { CodeLens, CodeLensProvider, Range, TextDocument } from 'vscode';

function getTestsBlocks(parsedNode: ParsedNode): CodeLens[] {
  const codeLens: CodeLens[] = [];

  parsedNode.children?.forEach(subNode => {
    codeLens.push(...getTestsBlocks(subNode));
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

  codeLens.push(
    new CodeLens(range, {
      arguments: [parsedNode['name']],
      command: 'extension.runJest',
      title: 'Run test'
    })
  );

  return codeLens;
}

export default class JestRunnerCodeLensProvider implements CodeLensProvider {
  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    const parseResults = parse(document.fileName, document.getText()).root.children;

    const codeLens = [];
    parseResults.forEach(parseResult => codeLens.push(...getTestsBlocks(parseResult)));
    return codeLens;
  }
}
