import * as path from 'path';
import * as assert from 'assert';

import * as vscode from 'vscode';
import { describe, it, before, after } from 'mocha';
import { JestCommandBuilder } from '../../jestCommandBuilder';

describe('jestCommandBuilder', () => {
	vscode.window.showInformationMessage('Start config tests.');
	const conf = vscode.workspace.getConfiguration('playwrightrunner');
	let rootDir:vscode.Uri = vscode.Uri.file('.'); 
	if(undefined !== vscode.workspace.workspaceFolders && 0 < vscode.workspace.workspaceFolders.length){
		rootDir = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri;
	}
	const assetRootDir = rootDir.fsPath.replace(/\\/g, '/');
	const command = 'sample';
	const file = vscode.Uri.joinPath(rootDir, "tests/mainpackage.spec.js");
	const file2 = vscode.Uri.joinPath(rootDir, "packages/subpackage/tests/subpackage.spec.js");

	describe('buildCommand', () => {
		before( async () => {
			await conf.update('jestCommand', command);
			await conf.update('jestConfigPath', undefined);
			await vscode.workspace.openTextDocument(file).then(doc => vscode.window.showTextDocument(doc));
		});
	
		after( async () => {
			await conf.update('jestCommand', undefined);
			await conf.update('jestConfigPath', undefined);
		});
		
		it('test 1', async () => {
			const cmd = JestCommandBuilder.buildCommand(file);
			assert.deepStrictEqual(`${command} "${assetRootDir}/tests/mainpackage.spec.js"`, cmd);
		});	

		it('test 2', async () => {
			const cmd = JestCommandBuilder.buildCommand(file, 'testcase');
			assert.deepStrictEqual(`${command} "${assetRootDir}/tests/mainpackage.spec.js" -t "testcase"`, cmd);
		});	

		it('test 3', async () => {
			const cmd = JestCommandBuilder.buildCommand(file, 'testcase', ['--a','--b']);
			assert.deepStrictEqual(`${command} "${assetRootDir}/tests/mainpackage.spec.js" -t "testcase" --a --b`, cmd);
		});	

		it('test 4', async () => {
			await conf.update('jestConfigPath', 'jest.config.js');
			const cmd = JestCommandBuilder.buildCommand(file, 'testcase');
			assert.deepStrictEqual(`${command} "${assetRootDir}/tests/mainpackage.spec.js" -c "jest.config.js" -t "testcase"`, cmd);
			await conf.update('jestConfigPath', undefined);
		});	
	});
	describe('getDebugConfig', () => {
		before( async () => {
			await conf.update('jestCommand', command);
			await conf.update('jestConfigPath', undefined);
			await vscode.workspace.openTextDocument(file).then(doc => vscode.window.showTextDocument(doc));
		});
	
		after( async () => {
			await conf.update('jestCommand', undefined);
			await conf.update('jestConfigPath', undefined);
		});
		
		it('test 1', async () => {
			const cmd = JestCommandBuilder.getDebugConfig(file);
			assert.deepStrictEqual(cmd, {
				args: [
				  `${assetRootDir}/tests/mainpackage.spec.js`,
				  "--runInBand"
				],
				console: "integratedTerminal",
				cwd: assetRootDir,
				internalConsoleOptions: "neverOpen",
				name: "jest(debug)",
				program: "./node_modules/jest/bin/jest.js",
				request: "launch",
				type: "node",
			});
		});	
		
		it('test 2', async () => {
			const cmd = JestCommandBuilder.getDebugConfig(file, 'testcase');
			assert.deepStrictEqual(cmd, {
				args: [
				  `${assetRootDir}/tests/mainpackage.spec.js`,
				  "-t",
				  "testcase",
				  "--runInBand"
				],
				console: "integratedTerminal",
				cwd: assetRootDir,
				internalConsoleOptions: "neverOpen",
				name: "jest(debug)",
				program: "./node_modules/jest/bin/jest.js",
				request: "launch",
				type: "node",
			});
		});	
		
		it('test 3', async () => {
			const cmd = JestCommandBuilder.getDebugConfig(file, 'testcase', {args:["--aa"], sampleoption1:"aaa", env:{foo:"123"}});
			assert.deepStrictEqual(cmd, {
				args: [
				  `${assetRootDir}/tests/mainpackage.spec.js`,
				  "-t",
				  "testcase",
				  "--runInBand",
				  "--aa"
				],
				console: "integratedTerminal",
				cwd: assetRootDir,
				internalConsoleOptions: "neverOpen",
				name: "jest(debug)",
				program: "./node_modules/jest/bin/jest.js",
				request: "launch",
				type: "node",
				sampleoption1:"aaa",
				env: {
					foo:"123",
				}
			});
		});
		
		it('test 4', async () => {
			await vscode.workspace.openTextDocument(file2).then(doc => vscode.window.showTextDocument(doc));
			const cmd = JestCommandBuilder.getDebugConfig(file2);
			assert.deepStrictEqual(cmd, {
				args: [
				  `${assetRootDir}/packages/subpackage/tests/subpackage.spec.js`,
				  "--runInBand"
				],
				console: "integratedTerminal",
				cwd: assetRootDir+'/packages/subpackage',
				internalConsoleOptions: "neverOpen",
				name: "jest(debug)",
				program: "./node_modules/jest/bin/jest.js",
				request: "launch",
				type: "node",
			});
		});	
	});
});
