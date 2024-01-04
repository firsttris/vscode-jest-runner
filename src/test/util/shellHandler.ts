export type Shell = 'bash' | 'pwsh' | 'powershell' | 'cmd';

export function getArgsForShell(shell: Shell, testFilePath: string): Array<string> {
  if (['pwsh', 'powershell'].includes(shell)) {
    return ['-NoProfile', '-File', testFilePath];
  }
  if (shell === 'bash') {
    return ['--noprofile', testFilePath];
  }
  if (shell === 'cmd') {
    return ['/c', testFilePath];
  }
  throw new Error('unhandled shell');
}

export function getFileExtension(shell: Shell): string {
  if (['pwsh', 'powershell'].includes(shell)) {
    return '.ps1';
  }
  if (shell === 'bash') {
    return '.sh';
  }
  if (shell === 'cmd') {
    return '.bat';
  }
  throw new Error('unhandled shell');
}

export function getCommandPrefix(shell: Shell): string {
  if (shell === 'cmd') {
    return '@echo off\n';
  }
  return '';
}
