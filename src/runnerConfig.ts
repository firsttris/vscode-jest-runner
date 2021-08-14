import * as vscode from 'vscode';
import { isWindows, normalizePath, quote, PredefinedVars } from './util';

export class RunnerConfig {
  private base:vscode.Uri = vscode.Uri.file('.');
  constructor(base:vscode.Uri) {
    this.base = base;
  }

  public get projectPath(): string {
    const filepath = vscode.workspace.getConfiguration().get<string>('playwrightrunner.projectPath') || '';
    return (new PredefinedVars(this.base)).replace(filepath).trim();
    return filepath;
  }

  public static get isYarnPnpSupportEnabled(): boolean {
    return Boolean(vscode.workspace.getConfiguration().get('playwrightrunner.enableYarnPnpSupport'));
  }

  public static get isCodeLensDisabled(): boolean {
    return Boolean(vscode.workspace.getConfiguration().get('playwrightrunner.disableCodeLens'));
  }

  public static get changeDirectoryToWorkspaceRoot(): boolean {
    return Boolean(vscode.workspace.getConfiguration().get<boolean>('playwrightrunner.changeDirectoryToWorkspaceRoot'));
  }

  /**
   * The command that runs playwright.
   * Defaults to: node "node_modules/.bin/playwright"
   */
   public get playwrightCommand(): string {
    const cmd = vscode.workspace.getConfiguration().get<string>('playwrightrunner.playwrightCommand');
    if (cmd) {
      return (new PredefinedVars(this.base)).replace(cmd).trim();
    }
    return 'npx playwright';
  }

  public get playwrightConfigPath(): string | undefined {
    const filepath = vscode.workspace.getConfiguration().get<string>('playwrightrunner.playwrightConfigPath');
    if(!filepath) {return;}
    return (new PredefinedVars(this.base)).replace(filepath).trim();
  }

  public get playwrightRunOptions(): string[] {
    return vscode.workspace.getConfiguration().get<string[]>('playwrightrunner.playwrightRunOptions') || [];
  }

  public get playwrightDebugOptions(): Partial<vscode.DebugConfiguration> {
    const debugOptions = vscode.workspace.getConfiguration().get<Partial<vscode.DebugConfiguration>>('playwrightrunner.playwrightDebugOptions');
    return debugOptions || {};
  }


}
