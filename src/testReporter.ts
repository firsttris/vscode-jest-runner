import * as vscode from 'vscode';
import * as path from 'path';

export class TestReporter {
    private context: vscode.ExtensionContext;
    private currentPanel: vscode.WebviewPanel | undefined = undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    private createPanel():vscode.WebviewPanel {
        const options = {
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))],
            enableScripts: true,
            retainContextWhenHidden: true
        };
        const panel = vscode.window.createWebviewPanel(
            'Test Report',
            'Test Report',
            vscode.ViewColumn.Two,
            options
        );
        const tplfile = vscode.Uri.file(
            path.join(this.context.extensionPath, 'media', 'report.html')
        );

        const webview = panel.webview;
        vscode.workspace.fs.readFile(tplfile).then( html => {
            webview.html = this.replaceFilePath(webview, html.toString());
        });
        return panel;
    }

    private getPanel():vscode.WebviewPanel {
        if(this.currentPanel) {
            this.currentPanel.reveal(vscode.ViewColumn.Two);
        } else {
            this.currentPanel = this.createPanel();
            this.currentPanel.onDidDispose(() => {
                this.currentPanel = undefined;
            }, null, this.context.subscriptions);
        }
        return this.currentPanel;
    }

    private replaceFilePath(webview:vscode.Webview, text:string) {
        return text.replace(/\.\/([a-z]+\.[a-z]+)/g, (m, filename, o) => {
            const file = vscode.Uri.file(
                path.join(this.context.extensionPath, 'media', filename)
            );
            return webview.asWebviewUri(file).toString();
        });
    }

    public update(jsonfile:vscode.Uri) {
        const panel = this.getPanel();
        vscode.workspace.fs.readFile(jsonfile).then( data => {
            const json = JSON.parse(data.toString());
            panel.webview.postMessage({ command: 'load', json:json });
        });
    }
}
