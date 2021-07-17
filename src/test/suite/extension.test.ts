import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { TextEncoder } from 'util';
import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import * as fs from 'fs';

describe('Extension Commands', async () => {
	vscode.window.showInformationMessage('Start config tests.');
	const conf = vscode.workspace.getConfiguration('playwrightrunner');
	let rootDir:vscode.Uri = vscode.Uri.file('.'); 
	if(undefined !== vscode.workspace.workspaceFolders && 0 < vscode.workspace.workspaceFolders.length){
		rootDir = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri;
	}
	const assetRootDir = rootDir.fsPath.replace(/\\/g, '/');

	const setAssertFile = async(output:string) => {
		const cfgfile = vscode.Uri.file(path.join(assetRootDir, 'test.playwright.config.js'));
		await vscode.workspace.fs.writeFile(cfgfile, new TextEncoder().encode(ddd(output)));
		await conf.update('playwrightConfigPath', 'test.playwright.config.js');
	};

	describe('playwright', () => {
		before( async () => {
			await conf.update('playwrightRunOptions', undefined);
			await conf.update('playwrightDebugOptions', undefined);
			await conf.update('playwrightConfigPath', undefined);
		});
		after( async () => {
			await conf.update('playwrightRunOptions', undefined);
			await conf.update('playwrightDebugOptions', undefined);
			await conf.update('playwrightConfigPath', undefined);
		});

		beforeEach( async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			const editor = await vscode.window.showTextDocument(fpath, { preview: false });
		});
	
		afterEach( async () => {
			await conf.update('playwrightRunOptions', undefined);
			await conf.update('playwrightDebugOptions', undefined);
			await conf.update('playwrightConfigPath', undefined);
		});

		it('playwright.runTest', async () => {
			const output = 'reports/runTest.playwright.result.json';
			await setAssertFile(output);
			await vscode.commands.executeCommand("playwright.runTest");
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('120s');

		it('playwright.runCurrentFile', async () => {
			const output = 'reports/runTestFile.playwright.result.json';
			await setAssertFile(output);
			await vscode.commands.executeCommand("playwright.runCurrentFile");
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('120s');

		it('playwright.runTestPath', async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			const output = 'reports/runTestPath.playwright.result.json';
			await setAssertFile(output);
			await vscode.commands.executeCommand("playwright.runTestPath", fpath);
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('120s');

		it('playwright.runTestAndUpdateSnapshots', async () => {
			const output = 'reports/runTestAndUpdateSnapshots.playwright.result.json';
			await setAssertFile(output);
			await vscode.commands.executeCommand("playwright.runTestAndUpdateSnapshots");
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('120s');

		it('playwright.debugTest', async () => {
			const output = 'reports/debugTest.playwright.result.json';
			await setAssertFile(output);
			await vscode.commands.executeCommand("playwright.debugTest");
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('120s');

		it('playwright.debugCurrentFile', async () => {
			const output = 'reports/debugCurrentFile.playwright.result.json';
			await setAssertFile(output);
			await vscode.commands.executeCommand("playwright.debugCurrentFile");
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('120s');

		it('playwright.debugTestPath', async () => {
			const output = 'reports/debugTestPath.playwright.result.json';
			await setAssertFile(output);
			const fpath = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			await vscode.commands.executeCommand("playwright.debugTestPath", fpath);
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('120s');

		/*it('playwright.inspectTest', async () => {
			const output = 'reports/inspectTest.playwright.result.json';
			await setAssertFile(output);
			await vscode.commands.executeCommand("playwright.inspectTest");
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('120s');*/

		it('playwright.runPrevTest', async () => {
			const output = 'reports/runPrevTest.playwright.result.json';
			await setAssertFile(output);
			await vscode.commands.executeCommand("playwright.runTest");
			await conf.update('playwrightConfigPath', undefined);
			await vscode.commands.executeCommand("playwright.runPrevTest");
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('120s');

		/*it('playwright.runCurrentFileWithCoverage', async () => {
			const output = 'reports/runTestFileWithCoverage.playwright.result.json';
			await setAssertFile(output);
			await vscode.commands.executeCommand("playwright.runCurrentFileWithCoverage");
			await waitExistCheckFile(assetRootDir+'/'+output);
		}).timeout('10s');*/
	});
});


function ddd(output:string):string {
return `module.exports = {
    reporter:[ ['dot'], [ 'json', {  outputFile: '${output}' }] ]
}`;
}
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