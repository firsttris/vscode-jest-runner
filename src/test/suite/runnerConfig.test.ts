import * as assert from 'assert';
import * as vscode from 'vscode';
import { describe, it } from 'mocha';
import { RunnerConfig } from '../../runnerConfig';

describe('Extension Test Suite (config)', async () => {
	vscode.window.showInformationMessage('Start config tests.');
	const conf = vscode.workspace.getConfiguration('playwrightrunner');
	let rootDir:vscode.Uri = vscode.Uri.file('.'); 
	if(undefined !== vscode.workspace.workspaceFolders && 0 < vscode.workspace.workspaceFolders.length){
		rootDir = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri;
	}
	const assetRootDir = rootDir.fsPath.replace(/\\/g, '/');

	describe('jestCommand', async () => {
		it('jestCommand test 1', async () => {
			await conf.update('jestCommand', 'sample');
			assert.strictEqual("sample", RunnerConfig.jestCommand);
		});
		it('jestCommand test 2', async () => {
			await conf.update('jestCommand', undefined);
			assert.strictEqual('node "./node_modules/jest/bin/jest.js"', RunnerConfig.jestCommand);
		});
		it('jestCommand test 3', async () => {
			await conf.update('jestCommand', undefined);
			assert.strictEqual('node "./node_modules/jest/bin/jest.js"', RunnerConfig.jestCommand);
		});
	});

	describe('jestBinPath', () => {
		it('jestBinPath test 1', async () => {
			await conf.update('jestPath', "abc.js");
			assert.strictEqual("abc.js", RunnerConfig.jestBinPath);
			await conf.update('jestPath', undefined);
		});
	
		it('jestBinPath test 2', async () => {
			await conf.update('jestPath', "${workspaceRoot}/abc.js");
			assert.strictEqual(assetRootDir+"/abc.js", RunnerConfig.jestBinPath);
		});
		it('jestBinPath test 3', async () => {
			await conf.update('jestPath', undefined);
			assert.strictEqual("./node_modules/jest/bin/jest.js", RunnerConfig.jestBinPath);
		});
	});

	describe('jestBinPath', () => {
		it('jestConfigPath test 1', async () => {
			await conf.update('jestConfigPath', "aaa.js");
			assert.strictEqual("aaa.js", RunnerConfig.jestConfigPath);
		});
		it('jestConfigPath test 2', async () => {
			await conf.update('jestConfigPath', "${workspaceRoot}/aaa.js");
			assert.strictEqual(assetRootDir+"/aaa.js", RunnerConfig.jestConfigPath);
		});
		it('jestConfigPath test 3', async () => {
			await conf.update('jestConfigPath', undefined);
			assert.strictEqual(undefined, RunnerConfig.jestConfigPath);
		});
	});

	describe('jestRunOptions', () => {
		it('jestRunOptions test 1', async () => {
			await conf.update('jestRunOptions', ['aa','bb']);
			assert.deepStrictEqual(['aa','bb'], RunnerConfig.jestRunOptions);
		});
		it('jestRunOptions test 2', async () => {
			await conf.update('jestRunOptions', undefined);
			assert.deepStrictEqual([], RunnerConfig.jestRunOptions);
		});
	});

	describe('jestDebugOptions', () => {
		it('jestDebugOptions test 1', async () => {
			await conf.update('jestDebugOptions', {a:123});
			assert.deepStrictEqual({a:123}, RunnerConfig.jestDebugOptions);
		});
		it('jestDebugOptions test default', async () => {
			await conf.update('jestDebugOptions', undefined);
			assert.deepStrictEqual({}, RunnerConfig.jestDebugOptions);
		});
	});

	describe('playwrightCommand', async () => {
		it('playwrightCommand test 1', async () => {
			await conf.update('playwrightCommand', 'sample');
			assert.strictEqual("sample", RunnerConfig.playwrightCommand);
		});
		it('playwrightCommand test 2', async () => {
			await conf.update('playwrightCommand', undefined);
			assert.strictEqual('node "./node_modules/playwright/lib/cli/cli.js"', RunnerConfig.playwrightCommand);
		});
		it('playwrightCommand test 3', async () => {
			await conf.update('playwrightCommand', undefined);
			assert.strictEqual('node "./node_modules/playwright/lib/cli/cli.js"', RunnerConfig.playwrightCommand);
		});
	});
	
	describe('playwrightBinPath', () => {
		it('playwrightBinPath test 1', async () => {
			await conf.update('playwrightPath', "abc.js");
			assert.strictEqual("abc.js", RunnerConfig.playwrightBinPath);
			await conf.update('playwrightPath', undefined);
		});
	
		it('playwrightBinPath test 2', async () => {
			await conf.update('playwrightPath', "${workspaceRoot}/abc.js");
			assert.strictEqual(assetRootDir+"/abc.js", RunnerConfig.playwrightBinPath);
		});
		it('playwrightBinPath test 3', async () => {
			await conf.update('playwrightPath', undefined);
			assert.strictEqual("./node_modules/playwright/lib/cli/cli.js", RunnerConfig.playwrightBinPath);
		});
	});
	
	describe('playwrightBinPath', () => {
		it('playwrightConfigPath test 1', async () => {
			await conf.update('playwrightConfigPath', "aaa.js");
			assert.strictEqual("aaa.js", RunnerConfig.playwrightConfigPath);
		});
		it('playwrightConfigPath test 2', async () => {
			await conf.update('playwrightConfigPath', "${workspaceRoot}/aaa.js");
			assert.strictEqual(assetRootDir+"/aaa.js", RunnerConfig.playwrightConfigPath);
		});
		it('playwrightConfigPath test 3', async () => {
			await conf.update('playwrightConfigPath', undefined);
			assert.strictEqual(undefined, RunnerConfig.playwrightConfigPath);
		});
	});
	
	describe('playwrightRunOptions', () => {
		it('playwrightRunOptions test 1', async () => {
			await conf.update('playwrightRunOptions', ['aa','bb']);
			assert.deepStrictEqual(['aa','bb'], RunnerConfig.playwrightRunOptions);
		});
		it('playwrightRunOptions test 2', async () => {
			await conf.update('playwrightRunOptions', undefined);
			assert.deepStrictEqual([], RunnerConfig.playwrightRunOptions);
		});
	});
	
	describe('playwrightDebugOptions', () => {
		it('playwrightDebugOptions test 1', async () => {
			await conf.update('playwrightDebugOptions', {a:123});
			assert.deepStrictEqual({a:123}, RunnerConfig.playwrightDebugOptions);
		});
		it('playwrightDebugOptions test default', async () => {
			await conf.update('playwrightDebugOptions', undefined);
			assert.deepStrictEqual({}, RunnerConfig.playwrightDebugOptions);
		});
	});
	
	describe('common', () => {
		it('projectPath test 1', async () => {
			const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			await vscode.workspace.openTextDocument(file).then(doc => vscode.window.showTextDocument(doc));
			await conf.update('projectPath', undefined);
			assert.strictEqual(assetRootDir, RunnerConfig.projectPath);
		});
	
		it('projectPath test 2', async () => {
			const file = vscode.Uri.joinPath(rootDir, "packages/subpackage/tests/subpackage.spec.js");
			await vscode.workspace.openTextDocument(file).then(doc => vscode.window.showTextDocument(doc));
			await conf.update('projectPath', undefined);
			assert.strictEqual(assetRootDir+'/packages/subpackage', RunnerConfig.projectPath);
		});
	
		it('isYarnPnpSupportEnabled test false', async () => {
			await conf.update('enableYarnPnpSupport', false);
			assert.strictEqual(false, RunnerConfig.isYarnPnpSupportEnabled);
		});
	
		it('isYarnPnpSupportEnabled test true', async () => {
			await conf.update('enableYarnPnpSupport', true);
			assert.strictEqual(true, RunnerConfig.isYarnPnpSupportEnabled);
		});
	
		it('isYarnPnpSupportEnabled test undefined', async () => {
			await conf.update('enableYarnPnpSupport', undefined);
			assert.strictEqual(false, RunnerConfig.isYarnPnpSupportEnabled);
		});
		
		it('isCodeLensDisabled test false', async () => {
			await conf.update('disableCodeLens', false);
			assert.strictEqual(false, RunnerConfig.isCodeLensDisabled);
		});
		it('isCodeLensDisabled test true', async () => {
			await conf.update('disableCodeLens', true);
			assert.strictEqual(true, RunnerConfig.isCodeLensDisabled);
		});
		it('isCodeLensDisabled test undefined', async () => {
			await conf.update('disableCodeLens', undefined);
			assert.strictEqual(false, RunnerConfig.isCodeLensDisabled);
		});
	
		it('changeDirectoryToWorkspaceRoot test false', async () => {
			await conf.update('changeDirectoryToWorkspaceRoot', false);
			assert.strictEqual(false, RunnerConfig.changeDirectoryToWorkspaceRoot);
		});
		it('changeDirectoryToWorkspaceRoot test true', async () => {
			await conf.update('changeDirectoryToWorkspaceRoot', true);
			assert.strictEqual(true, RunnerConfig.changeDirectoryToWorkspaceRoot);
		});
		it('changeDirectoryToWorkspaceRoot test undefined', async () => {
			await conf.update('changeDirectoryToWorkspaceRoot', undefined);
			assert.strictEqual(true, RunnerConfig.changeDirectoryToWorkspaceRoot);
		});
	});
});
