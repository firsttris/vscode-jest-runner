import * as vscode from 'vscode';
import { isWindows, normalizePath, quote, PredefinedVars } from './util';

export class PlaywrightRunnerConfig {
  /**
   * The command that runs playwright.
   * Defaults to: node "node_modules/.bin/playwright"
   */
  public static get playwrightCommand(): string {
    const cmd = vscode.workspace.getConfiguration().get<string>('playwrightrunner.playwrightCommand');
    if (cmd) {
      const editor = vscode.window.activeTextEditor;
      if(editor) {
        return (new PredefinedVars(editor.document.uri)).replace(cmd).trim();
      }
      return cmd;
    }
    return `node ${quote(this.playwrightBinPath)}`;
  }

  public static get playwrightBinPath(): string {
    const defaultPath = isWindows() ? './node_modules/playwright/lib/cli/cli.js' : './node_modules/.bin/playwright';
    let playwrightPath = vscode.workspace.getConfiguration().get<string>('playwrightrunner.playwrightPath');
    const filepath = playwrightPath || defaultPath;
    
    const editor = vscode.window.activeTextEditor;
    if(editor) {
      return (new PredefinedVars(editor.document.uri)).replace(filepath).trim();
    }
    return filepath;
  }

  public static get projectPath(): string {
    const filepath = vscode.workspace.getConfiguration().get<string>('playwrightrunner.projectPath') || '${packageRoot}';
    const editor = vscode.window.activeTextEditor;
    if(editor) {
      return (new PredefinedVars(editor.document.uri)).replace(filepath).trim();
    }
    return filepath;
  }

  public static get playwrightConfigPath(): string | undefined {
    const filepath = vscode.workspace.getConfiguration().get<string>('playwrightrunner.playwrightConfigPath');
    if(!filepath) {return;}
    const editor = vscode.window.activeTextEditor;
    if(editor) {
      return (new PredefinedVars(editor.document.uri)).replace(filepath).trim();
    }
    return filepath;
  }

  public static get runOptions(): string[] {
    return vscode.workspace.getConfiguration().get<string[]>('playwrightrunner.playwrightRunOptions') || [];
  }

  public static get debugOptions(): Partial<vscode.DebugConfiguration> {
    const debugOptions = vscode.workspace.getConfiguration().get<Partial<vscode.DebugConfiguration>>('playwrightrunner.playwrightDebugOptions');
    return debugOptions || {};
  }
}
