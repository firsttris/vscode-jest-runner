import * as assert from 'assert';
import * as vscode from 'vscode';
import { describe, it } from 'mocha';
import { RunnerConfig } from '../../runnerConfig';

describe('runnerConfig', async () => {
	vscode.window.showInformationMessage('Start config tests.');
	const conf = vscode.workspace.getConfiguration('playwrightrunner');
	let rootDir:vscode.Uri = vscode.Uri.file('.'); 
	if(undefined !== vscode.workspace.workspaceFolders && 0 < vscode.workspace.workspaceFolders.length){
		rootDir = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri;
	}
	const assetRootDir = rootDir.fsPath.replace(/\\/g, '/');
	const config = new RunnerConfig(rootDir);

	describe('playwrightCommand', async () => {
		it('playwrightCommand test 1', async () => {
			await conf.update('playwrightCommand', 'sample');
			assert.strictEqual("sample", config.playwrightCommand);
		});
		it('playwrightCommand test 2', async () => {
			await conf.update('playwrightCommand', undefined);
			assert.strictEqual('npx playwright', config.playwrightCommand);
		});
		it('playwrightCommand test 3', async () => {
			await conf.update('playwrightCommand', undefined);
			assert.strictEqual('npx playwright', config.playwrightCommand);
		});
	});
	
	describe('playwrightBinPath', () => {
		it('playwrightConfigPath test 1', async () => {
			await conf.update('playwrightConfigPath', "aaa.js");
			assert.strictEqual("aaa.js", config.playwrightConfigPath);
		});
		it('playwrightConfigPath test 2', async () => {
			await conf.update('playwrightConfigPath', "${workspaceRoot}/aaa.js");
			assert.strictEqual(assetRootDir+"/aaa.js", config.playwrightConfigPath);
		});
		it('playwrightConfigPath test 3', async () => {
			await conf.update('playwrightConfigPath', undefined);
			assert.strictEqual(undefined, config.playwrightConfigPath);
		});
	});
	
	describe('playwrightRunOptions', () => {
		it('playwrightRunOptions test 1', async () => {
			await conf.update('playwrightRunOptions', ['aa','bb']);
			assert.deepStrictEqual(['aa','bb'], config.playwrightRunOptions);
		});
		it('playwrightRunOptions test 2', async () => {
			await conf.update('playwrightRunOptions', undefined);
			assert.deepStrictEqual([], config.playwrightRunOptions);
		});
	});
	
	describe('playwrightDebugOptions', () => {
		it('playwrightDebugOptions test 1', async () => {
			await conf.update('playwrightDebugOptions', {a:123});
			assert.deepStrictEqual({a:123}, config.playwrightDebugOptions);
		});
		it('playwrightDebugOptions test default', async () => {
			await conf.update('playwrightDebugOptions', undefined);
			assert.deepStrictEqual({}, config.playwrightDebugOptions);
		});
	});
	
	describe('common', () => {
		it('projectPath test 1', async () => {
			const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
			const config = new RunnerConfig(file);
			await conf.update('projectPath', undefined);
			assert.strictEqual(assetRootDir, config.projectPath);
		});
	
		it('projectPath test 2', async () => {
			const file = vscode.Uri.joinPath(rootDir, "packages/subpackage/tests/subpackage.spec.js");
			const config = new RunnerConfig(file);
			await conf.update('projectPath', undefined);
			assert.strictEqual(assetRootDir+'/packages/subpackage', config.projectPath);
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
