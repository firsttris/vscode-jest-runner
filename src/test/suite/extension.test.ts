import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { TextEncoder } from 'util';
import { describe, it, before, after, beforeEach, afterEach } from 'mocha';

describe('Extension Commands', async () => {
	vscode.window.showInformationMessage('Start config tests.');
	const conf = vscode.workspace.getConfiguration('playwrightrunner');
	let rootDir:vscode.Uri = vscode.Uri.file('.'); 
	if(undefined !== vscode.workspace.workspaceFolders && 0 < vscode.workspace.workspaceFolders.length){
		rootDir = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri;
	}
	//const assetRootDir = rootDir.fsPath.replace(/\\/g, '/');

	describe('jest', () => {
		before( async () => {
			await conf.update('jestRunOptions', undefined);
			await conf.update('jestDebugOptions', undefined);
		});
		after( async () => {
			await conf.update('jestRunOptions', undefined);
			await conf.update('jestDebugOptions', undefined);
		});

		beforeEach( async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "api-test/test1.test.js");
			const editor = await vscode.window.showTextDocument(fpath, { preview: false });
		});
	
		afterEach( async () => {
			await conf.update('jestRunOptions', undefined);
			await conf.update('jestDebugOptions', undefined);
		});

		it('playwright.runTest', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=runTest.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTest");
		}).timeout(30000);

		it('playwright.runTestPath', async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "api-test/test2.test.js");
			await conf.update('jestRunOptions', ['--json','--outputFile=runTestPath.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTestPath", fpath);
		}).timeout(30000);

		it('playwright.runTestAndUpdateSnapshots', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=runTestAndUpdateSnapshots.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTestAndUpdateSnapshots");
		}).timeout(30000);

		it('playwright.runTestFile', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=runTestFile.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTestFile");
		}).timeout(30000);

		it('playwright.debugTest', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=debugTest.jest.result.json']);
			await vscode.commands.executeCommand("playwright.debugTest");
		}).timeout(30000);

		it('playwright.debugTestPath', async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "api-test/test2.test.js");
			await conf.update('jestRunOptions', ['--json','--outputFile=debugTestPath.jest.result.json']);
			await vscode.commands.executeCommand("playwright.debugTestPath", fpath);
		}).timeout(30000);

		it('playwright.inspectorTest', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=inspectorTest.jest.result.json']);
			await vscode.commands.executeCommand("playwright.inspectorTest");
		}).timeout(30000);

		it('playwright.runPrevTest', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=runPrevTest.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTest");
			await vscode.commands.executeCommand("playwright.runPrevTest");
		}).timeout(30000);

		it('playwright.runTestFileWithCoverage', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=runTestFileWithCoverage.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTestFileWithCoverage");
		}).timeout(30000);
	});

	describe('playwright', () => {
		before( async () => {
			await conf.update('playwrightRunOptions', undefined);
			await conf.update('playwrightDebugOptions', undefined);
		});
		after( async () => {
			await conf.update('playwrightRunOptions', undefined);
			await conf.update('playwrightDebugOptions', undefined);
		});

		beforeEach( async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			const editor = await vscode.window.showTextDocument(fpath, { preview: false });
		});
	
		afterEach( async () => {
			await conf.update('playwrightRunOptions', undefined);
			await conf.update('playwrightDebugOptions', undefined);
		});

		it('playwright.runTest', async () => {
			await conf.update('playwrightRunOptions', ['--json','--outputFile=runTest.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTest");
		}).timeout(30000);

		it('playwright.runTestPath', async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			await conf.update('playwrightRunOptions', ['--json','--outputFile=runTestPath.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTestPath", fpath);
		}).timeout(30000);

		it('playwright.runTestAndUpdateSnapshots', async () => {
			await conf.update('playwrightRunOptions', ['--json','--outputFile=runTestAndUpdateSnapshots.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTestAndUpdateSnapshots");
		}).timeout(30000);

		it('playwright.runTestFile', async () => {
			await conf.update('playwrightRunOptions', ['--json','--outputFile=runTestFile.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTestFile");
		}).timeout(30000);

		it('playwright.debugTest', async () => {
			await conf.update('playwrightDebugOptions', ['--json','--outputFile=debugTest.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.debugTest");
		}).timeout(30000);

		it('playwright.debugTestPath', async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			await conf.update('playwrightDebugOptions', ['--json','--outputFile=debugTestPath.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.debugTestPath", fpath);
		}).timeout(30000);

		it('playwright.inspectorTest', async () => {
			await conf.update('playwrightDebugOptions', ['--json','--outputFile=inspectorTest.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.inspectorTest");
		}).timeout(30000);

		it('playwright.runPrevTest', async () => {
			await conf.update('playwrightRunOptions', ['--json','--outputFile=runPrevTest.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTest");
			await vscode.commands.executeCommand("playwright.runPrevTest");
		}).timeout(30000);

		it('playwright.runTestFileWithCoverage', async () => {
			await conf.update('playwrightRunOptions', ['--json','--outputFile=runTestFileWithCoverage.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTestFileWithCoverage");
		}).timeout(30000);
	});
});
