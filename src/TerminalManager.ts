import * as vscode from 'vscode';

export interface TerminalCommandOptions {
    framework?: string;
    cwd?: string;
    env?: Record<string, string>;
    preserveEditorFocus?: boolean;
}

export class TerminalManager {
    private terminal: vscode.Terminal | null = null;
    private currentTerminalName: string | undefined;
    private currentTerminalEnv: Record<string, string> | undefined;
    private currentTerminalCwd: string | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.setup();
    }

    public async runCommand(command: string, options: TerminalCommandOptions): Promise<void> {
        const { framework, cwd, env, preserveEditorFocus } = options;
        const terminalName = framework === 'vitest' ? 'vitest' : 'jest';

        // Check if environment changed
        const envChanged = JSON.stringify(env) !== JSON.stringify(this.currentTerminalEnv);
        // Use shallow comparison for env if possible/better in future?

        // Check if CWD changed
        const cwdChanged = cwd !== this.currentTerminalCwd;

        if (
            !this.terminal ||
            (this.currentTerminalName && this.currentTerminalName !== terminalName) ||
            envChanged ||
            cwdChanged
        ) {
            if (this.terminal) {
                this.terminal.dispose();
            }
            this.terminal = vscode.window.createTerminal({
                name: terminalName,
                cwd,
                env,
            });
            this.currentTerminalName = terminalName;
            this.currentTerminalEnv = env;
            this.currentTerminalCwd = cwd;

            // Wait for terminal to initialize
            await this.terminal.processId;
        }

        this.terminal.show(preserveEditorFocus);
        this.terminal.sendText(command);
    }

    private setup() {
        // When terminal is closed by user, we need to clean up our reference
        const terminalCloseHandler = vscode.window.onDidCloseTerminal(
            (closedTerminal: vscode.Terminal) => {
                if (this.terminal === closedTerminal) {
                    this.terminal = null;
                    this.currentTerminalName = undefined;
                    this.currentTerminalEnv = undefined;
                    this.currentTerminalCwd = undefined;
                }
            },
        );
        this.disposables.push(terminalCloseHandler);
    }

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = null;
        }
    }
}
