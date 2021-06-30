import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { TextEncoder } from 'util';
import { describe, it } from 'mocha';

describe('Extension Commands', async () => {
	vscode.window.showInformationMessage('Start config tests.');
	const conf = vscode.workspace.getConfiguration('playwrightrunner');
	let rootDir:vscode.Uri = vscode.Uri.file('.'); 
	if(undefined !== vscode.workspace.workspaceFolders && 0 < vscode.workspace.workspaceFolders.length){
		rootDir = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri;
	}
	//const assetRootDir = rootDir.fsPath.replace(/\\/g, '/');

	it('setup', async () => {

	}).timeout(10000);

	it('playwright.runTest', async () => {
		const fpath = vscode.Uri.joinPath(rootDir, "api-test/test2.test.js");
		const editor = await vscode.window.showTextDocument(fpath, { preview: false });
		await vscode.commands.executeCommand("playwright.runTest");
	}).timeout(10000);

	it('command vscode-paste-image.pasteBase64Image test', async () => {
	}).timeout(10000);

	it('command vscode-paste-image.createImage test', async () => {
	}).timeout(10000);
});
