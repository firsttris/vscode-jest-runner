import { CodeLens, CodeLensProvider, Range, TextDocument } from 'vscode';

import { isPlaywrightTest, parse } from './playwright-editor-support';

function getPlaywrightCodeLens(filepath: string, text: string): CodeLens[] {
  const codeLens: CodeLens[] = [];
  const is_playwright = isPlaywrightTest(filepath, text);
  parse(filepath, text).forEach((element) => {
    const range = new Range(element.start.line - 1, element.start.column, element.end.line - 1, element.end.column);
    codeLens.push(
      new CodeLens(range, {
        arguments: [element.fullname],
        command: 'playwright.runTest',
        title: 'Run',
      }),
      new CodeLens(range, {
        arguments: [element.fullname],
        command: 'playwright.debugTest',
        title: 'Debug',
      })
    );
    if (is_playwright) {
      codeLens.push(
        new CodeLens(range, {
          arguments: [element.fullname],
          command: 'playwright.inspectorTest',
          title: 'Inspect',
        })
      );
    }
  });
  return codeLens;
}
export class JestRunnerCodeLensProvider implements CodeLensProvider {
  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    try {
      const text = document.getText();
      return getPlaywrightCodeLens(document.fileName, text);
    } catch (e) {
      // Ignore error and keep showing Run/Debug buttons at same position
      console.error('jest-editor-support parser returned error', e);
    }
  }
}
