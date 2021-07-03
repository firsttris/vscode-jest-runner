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
			await conf.update('jestRunOptions', ['--json','--outputFile=reports/runTest.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTest");
		}).timeout(30000);

		it('playwright.runTestPath', async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "api-test/test2.test.js");
			await conf.update('jestRunOptions', ['--json','--outputFile=reports/runTestPath.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTestPath", fpath);
		}).timeout(30000);

		it('playwright.runTestAndUpdateSnapshots', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=reports/runTestAndUpdateSnapshots.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTestAndUpdateSnapshots");
		}).timeout(30000);

		it('playwright.runTestFile', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=reports/runTestFile.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTestFile");
		}).timeout(30000);

		it('playwright.debugTest', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=reports/debugTest.jest.result.json']);
			await vscode.commands.executeCommand("playwright.debugTest");
		}).timeout(30000);

		it('playwright.debugTestPath', async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "api-test/test2.test.js");
			await conf.update('jestRunOptions', ['--json','--outputFile=reports/debugTestPath.jest.result.json']);
			await vscode.commands.executeCommand("playwright.debugTestPath", fpath);
		}).timeout(30000);

		it('playwright.inspectorTest', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=reports/inspectorTest.jest.result.json']);
			await vscode.commands.executeCommand("playwright.inspectorTest");
		}).timeout(30000);

		it('playwright.runPrevTest', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=reports/runPrevTest.jest.result.json']);
			await vscode.commands.executeCommand("playwright.runTest");
			await vscode.commands.executeCommand("playwright.runPrevTest");
		}).timeout(30000);

		it('playwright.runTestFileWithCoverage', async () => {
			await conf.update('jestRunOptions', ['--json','--outputFile=reports/runTestFileWithCoverage.jest.result.json']);
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
			await conf.update('playwrightRunOptions', ['--json','--outputFile=reports/runTest.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTest");
		}).timeout(30000);

		it('playwright.runTestPath', async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			await conf.update('playwrightRunOptions', ['--json','--outputFile=reports/runTestPath.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTestPath", fpath);
		}).timeout(30000);

		it('playwright.runTestAndUpdateSnapshots', async () => {
			await conf.update('playwrightRunOptions', ['--json','--outputFile=reports/runTestAndUpdateSnapshots.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTestAndUpdateSnapshots");
		}).timeout(30000);

		it('playwright.runTestFile', async () => {
			await conf.update('playwrightRunOptions', ['--json','--outputFile=reports/runTestFile.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTestFile");
		}).timeout(30000);

		it('playwright.debugTest', async () => {
			await conf.update('playwrightDebugOptions', ['--json','--outputFile=reports/debugTest.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.debugTest");
		}).timeout(30000);

		it('playwright.debugTestPath', async () => {
			const fpath = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			await conf.update('playwrightDebugOptions', ['--json','--outputFile=reports/debugTestPath.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.debugTestPath", fpath);
		}).timeout(30000);

		it('playwright.inspectorTest', async () => {
			await conf.update('playwrightDebugOptions', ['--json','--outputFile=reports/inspectorTest.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.inspectorTest");
		}).timeout(30000);

		it('playwright.runPrevTest', async () => {
			await conf.update('playwrightRunOptions', ['--json','--outputFile=reports/runPrevTest.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTest");
			await vscode.commands.executeCommand("playwright.runPrevTest");
		}).timeout(30000);

		it('playwright.runTestFileWithCoverage', async () => {
			await conf.update('playwrightRunOptions', ['--json','--outputFile=reports/runTestFileWithCoverage.playwright.result.json']);
			await vscode.commands.executeCommand("playwright.runTestFileWithCoverage");
		}).timeout(30000);
	});
});
