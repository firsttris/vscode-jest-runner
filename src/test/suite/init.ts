import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { describe, it } from 'mocha';

it('init', async () => {
	let rootDir:vscode.Uri = vscode.Uri.file('.'); 
	if(undefined !== vscode.workspace.workspaceFolders && 0 < vscode.workspace.workspaceFolders.length){
		rootDir = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri;
	}
	const finishflg = rootDir.fsPath+"/reports/npm.finish";
	if(fs.existsSync(finishflg)) {
		fs.rmSync(finishflg);
	}

    const terminal: vscode.Terminal = vscode.window.createTerminal('npm');
	terminal.show();
    terminal.sendText("npm i");
    terminal.sendText("cd packages/subpackage");
    terminal.sendText("npm i");
	terminal.sendText(`echo 1 > "${finishflg}"`);
	return waitExistCheckFile(finishflg);
}).timeout('120s');

function waitExistCheckFile(checkfile:string ): Promise<void>{
	if(fs.existsSync(checkfile)) {
		fs.rmSync(checkfile);
	}
	let count = 120;
	return new Promise((resolve, reject) => {
		const fn = () => {
			if(fs.existsSync(checkfile)) {
				resolve();
			} else if(count--<0) {
				reject();
			} else {
				setTimeout(fn, 1000);
			}
		};
		fn();
	});
}
