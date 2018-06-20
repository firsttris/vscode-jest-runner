import * as vscode from 'vscode';

const QUOTES = {
  '"': true,
  // tslint:disable-next-line:prettier
  '\'': true,
  '`': true
};

export function platformWin32(): boolean {
  return process.platform.includes('win32');
}

export function quote(s: string): string {
  const q = platformWin32() ? '"' : `'`;
  return [q, s, q].join('');
}

const TEST_NAME_REGEX = /(describe|it)\(('|"|`)(.*)('|"|`)/;

function unquote(s: string): string {
  if (QUOTES[s[0]]) {
    s = s.substring(1);
  }

  if (QUOTES[s[s.length - 1]]) {
    s = s.substring(0, s.length - 1);
  }

  return s;
}

export function parseTestName(editor: vscode.TextEditor) {
  const { selection, document } = editor;
  if (!selection.isEmpty) {
    return unquote(document.getText(selection));
  }

  const line = selection.start.line;
  const text = document.getText(new vscode.Range(line, 0, line, 100000));

  const match = TEST_NAME_REGEX.exec(text);
  return match ? match[3] : '';
}
