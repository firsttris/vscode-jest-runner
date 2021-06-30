import * as path from 'path';
import * as assert from 'assert';

import * as vscode from 'vscode';
import { describe, it } from 'mocha';
import { PredefinedVars, resolveTestNameStringInterpolation } from '../../util';

describe('Extension Test Suite (util)', () => {
	vscode.window.showInformationMessage('Start config tests.');
	const conf = vscode.workspace.getConfiguration('playwrightrunner');
	let rootDir:vscode.Uri = vscode.Uri.file('.'); 
	if(undefined !== vscode.workspace.workspaceFolders && 0 < vscode.workspace.workspaceFolders.length){
		rootDir = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri;
	}
	const assetRootDir = rootDir.fsPath.replace(/\\/g, '/');

	it('PredefinedVars ${currentFileDir}', () => {
		const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${currentFileDir}");	
		assert.strictEqual(assetRootDir+'/tests/mainpackage.spec.js', output);
	});

	it('PredefinedVars ${fileExtname}', () => {
		const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${fileExtname}");	
		assert.strictEqual('.js', output);
	});

	it('PredefinedVars ${fileBasenameNoExtension}', () => {
		const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${fileBasenameNoExtension}");	
		assert.strictEqual('mainpackage.spec', output);
	});

	it('PredefinedVars ${fileBasename}', () => {
		const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${fileBasename}");	
		assert.strictEqual('mainpackage.spec.js', output);
	});

	it('PredefinedVars ${fileDirname}', () => {
		const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${fileDirname}");	
		assert.strictEqual(assetRootDir+'/tests', output);
	});
	
	it('PredefinedVars ${workspaceRoot}', () => {
		const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${workspaceRoot}");
		assert.strictEqual(assetRootDir, output);
	});

	it('PredefinedVars ${workspaceRoot}/aaa/bbb', () => {
		const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${workspaceRoot}/aaa/bbb");
		assert.strictEqual(assetRootDir+'/aaa/bbb', output);
	});

	it('PredefinedVars ${workspaceRoot} sub', () => {
		const file = vscode.Uri.joinPath(rootDir, "packages/subpackage/tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${workspaceRoot}");
		assert.strictEqual(assetRootDir, output);
	});

	it('PredefinedVars ${workspaceRoot}/aaa/bbb sub', () => {
		const file = vscode.Uri.joinPath(rootDir, "packages/subpackage/tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${workspaceRoot}/aaa/bbb");
		assert.strictEqual(assetRootDir+'/aaa/bbb', output);
	});

	it('PredefinedVars ${packageRoot}', () => {
		const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${packageRoot}");
		assert.strictEqual(assetRootDir, output);
	});

	it('PredefinedVars ${packageRoot}/aaa/bbb', () => {
		const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${packageRoot}/aaa/bbb");
		assert.strictEqual(assetRootDir+'/aaa/bbb', output);
	});

	it('PredefinedVars ${packageRoot} sub', () => {
		const file = vscode.Uri.joinPath(rootDir, "packages/subpackage/tests/subpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${packageRoot}");
		assert.strictEqual(assetRootDir+'/packages/subpackage', output);
	});

	it('PredefinedVars ${packageRoot}/aaa/bbb sub', () => {
		const file = vscode.Uri.joinPath(rootDir, "packages/subpackage/tests/subpackage.spec.js");
		const output = (new PredefinedVars(file)).replace("${packageRoot}/aaa/bbb");
		assert.strictEqual(assetRootDir+'/packages/subpackage/aaa/bbb', output);
	});
	it('resolveTestNameStringInterpolation %i', () => {
		assert.strictEqual(resolveTestNameStringInterpolation('%i'), '(.*?)');
	});

	it('resolveTestNameStringInterpolation $expected', () => {
		assert.strictEqual(resolveTestNameStringInterpolation('$expected'), '(.*?)');
	});

	it('resolveTestNameStringInterpolation ${i}', () => {
		assert.strictEqual(resolveTestNameStringInterpolation('${i}'), '(.*?)');
	});

	it('resolveTestNameStringInterpolation $a + $b returned value not be less than ${i}', () => {
		assert.strictEqual(resolveTestNameStringInterpolation('$a + $b returned value not be less than ${i}'), '(.*?) + (.*?) returned value not be less than (.*?)');
	});

	it('resolveTestNameStringInterpolation returns $expected when $a is added $b', () => {
		assert.strictEqual(resolveTestNameStringInterpolation('returns $expected when $a is added $b'), 
	'returns (.*?) when (.*?) is added (.*?)'
	);
	});

	it('resolveTestNameStringInterpolation .add(%i, %i) returns ${i}', () => {
		assert.strictEqual(resolveTestNameStringInterpolation('.add(%i, %i) returns ${i}'), '.add((.*?), (.*?)) returns (.*?)');
	});
});
