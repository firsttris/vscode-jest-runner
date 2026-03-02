import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Jest Runner');
  }
  return outputChannel;
}

export function logInfo(message: string): void {
  const timestamp = new Date().toISOString();
  getOutputChannel().appendLine(`[${timestamp}] [INFO] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  const errorDetails =
    error instanceof Error ? error.stack || error.message : String(error);
  getOutputChannel().appendLine(
    `[${timestamp}] [ERROR] ${message}${error ? ': ' + errorDetails : ''}`,
  );
}

export function logWarning(message: string): void {
  const timestamp = new Date().toISOString();
  getOutputChannel().appendLine(`[${timestamp}] [WARN] ${message}`);
}

export function logDebug(message: string): void {
  const config = vscode.workspace.getConfiguration('jestrunner');
  const enableDebugLogs = config.get<boolean>('enableDebugLogs', false);
  if (enableDebugLogs) {
    const timestamp = new Date().toISOString();
    getOutputChannel().appendLine(`[${timestamp}] [DEBUG] ${message}`);
  }
}
