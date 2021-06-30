import * as assert from 'assert';
import * as vscode from 'vscode';
import { describe, it } from 'mocha';
import { JestRunnerConfig } from '../../jestRunnerConfig';

describe('Extension Test Suite (config)', () => {
	vscode.window.showInformationMessage('Start config tests.');
	const conf = vscode.workspace.getConfiguration('playwrightrunner');

	it('jestCommand test 1', async () => {
		//assert.strictEqual("xxxx", "xxxx");
		await conf.update('jestCommand', undefined);
		assert.strictEqual('node "./node_modules/jest/bin/jest.js"', JestRunnerConfig.jestCommand);
	});
	it('jestCommand test 2', async () => {
		await conf.update('jestCommand', 'sample');
		assert.strictEqual("sample", JestRunnerConfig.jestCommand);
	});
	it('jestCommand test 3', async () => {
		await conf.update('jestCommand', undefined);
		assert.strictEqual('node "./node_modules/jest/bin/jest.js"', JestRunnerConfig.jestCommand);
	});
/*
	it('jestBinPath test 1', async () => {
		await conf.update('jestPath', undefined);
		assert.strictEqual("xxxx", JestRunnerConfig.jestBinPath);
	});
	it('projectPath test 1', async () => {
		await conf.update('projectPath', undefined);
		assert.strictEqual("xxxx", JestRunnerConfig.projectPath);
	});
	it('jestConfigPath test 1', async () => {
		await conf.update('jestConfigPath', undefined);
		assert.strictEqual("xxxx", JestRunnerConfig.jestConfigPath);
	});
	it('jestConfigPath test 2', async () => {
		await conf.update('jestConfigPath', "${workFolder}/aaa.js");
		assert.strictEqual("xxxx", JestRunnerConfig.jestConfigPath);
	});*/
	// ${workFolder}
/*	it('runOptions test 1', async () => {
		assert.strictEqual("xxxx", JestRunnerConfig.runOptions);
	});
	it('debugOptions test 1', async () => {
		assert.strictEqual("xxxx", JestRunnerConfig.debugOptions);
	});
	it('isYarnPnpSupportEnabled test 1', async () => {
		assert.strictEqual("xxxx", JestRunnerConfig.isYarnPnpSupportEnabled);
	});
	it('isCodeLensDisabled test 1', async () => {
		assert.strictEqual("xxxx", JestRunnerConfig.isCodeLensDisabled);
	});
	it('changeDirectoryToWorkspaceRoot test 1',  () => {
		assert.strictEqual("xxxx", JestRunnerConfig.changeDirectoryToWorkspaceRoot);
	});//*/
});
