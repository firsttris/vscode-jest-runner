import { parse } from 'jest-editor-support';
import { CodeLens, CodeLensProvider, Range, TextDocument } from 'vscode';

export default class JestRunnerCodeLensProvider implements CodeLensProvider {
  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    const parseResults = parse(document.fileName).root.children;

    return parseResults.map(test => {
      const range = new Range(test.start.line - 1, test.start.column, test.end.line - 1, test.end.column);

      return new CodeLens(range, {
        arguments: [test['name']],
        command: 'extension.runJest',
        title: 'Run test'
      });
    });
  }
}
