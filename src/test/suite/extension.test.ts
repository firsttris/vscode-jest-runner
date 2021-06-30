import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { TextEncoder } from 'util';
import { describe, it } from 'mocha';

describe('Extension Test Suite (command)', () => {
	vscode.window.showInformationMessage('Start command tests.');

	it('setup', async () => {

	}).timeout(10000);

	it('command vscode-paste-image.pasteImage test', async () => {
	}).timeout(10000);

	it('command vscode-paste-image.pasteBase64Image test', async () => {
	}).timeout(10000);

	it('command vscode-paste-image.createImage test', async () => {
	}).timeout(10000);
});
