import * as vscode from 'vscode';
import { isWindows, normalizePath, quote, PredefinedVars } from './util';

export class RunnerConfig {
  private base:vscode.Uri = vscode.Uri.file('.');
  constructor(base:vscode.Uri) {
    this.base = base;
  }

  /**
   * The command that runs jest.
   * Defaults to: node "node_modules/.bin/jest"
   */
  public get jestCommand(): string {
    const cmd = vscode.workspace.getConfiguration().get<string>('playwrightrunner.jestCommand');
    if (cmd) {
      return (new PredefinedVars(this.base)).replace(cmd).trim();
    }

    if (RunnerConfig.isYarnPnpSupportEnabled) {
      return `yarn jest`;
    }
    return `node ${quote(this.jestBinPath)}`;
  }

  public get jestBinPath(): string {
    const defaultPath = isWindows() ? './node_modules/jest/bin/jest.js' : './node_modules/.bin/jest';
    let playwrightPath = vscode.workspace.getConfiguration().get<string>('playwrightrunner.jestPath');
    const filepath = playwrightPath || defaultPath;
    
    return (new PredefinedVars(this.base)).replace(filepath).trim();
  }

  public get projectPath(): string {
    const filepath = vscode.workspace.getConfiguration().get<string>('playwrightrunner.projectPath') || '';
    return (new PredefinedVars(this.base)).replace(filepath).trim();
    return filepath;
  }

  public get jestConfigPath(): string | undefined {
    const filepath = vscode.workspace.getConfiguration().get<string>('playwrightrunner.jestConfigPath');
    if(!filepath) {return;}
    return (new PredefinedVars(this.base)).replace(filepath).trim();
  }

  public get jestRunOptions(): string[] {
    return vscode.workspace.getConfiguration().get<string[]>('playwrightrunner.jestRunOptions') || [];
  }

  public get jestDebugOptions(): Partial<vscode.DebugConfiguration> {
    const debugOptions = vscode.workspace.getConfiguration().get<Partial<vscode.DebugConfiguration>>('playwrightrunner.jestDebugOptions');
    return debugOptions || {};
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
    return `node ${quote(this.playwrightBinPath)}`;
  }

  public get playwrightBinPath(): string {
    const defaultPath = isWindows() ? './node_modules/playwright/lib/cli/cli.js' : './node_modules/.bin/playwright';
    let playwrightPath = vscode.workspace.getConfiguration().get<string>('playwrightrunner.playwrightPath');
    const filepath = playwrightPath || defaultPath;
    
    return (new PredefinedVars(this.base)).replace(filepath).trim();
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
