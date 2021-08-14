import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { describe, it } from 'mocha';
import { parse, findTestCode } from '../../playwright-editor-support';

describe('playwright-editor-support', () => {
	let rootDir:vscode.Uri = vscode.Uri.file('.'); 
	if(undefined !== vscode.workspace.workspaceFolders && 0 < vscode.workspace.workspaceFolders.length){
		rootDir = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri;
	}
  const testcodes = parse(rootDir.fsPath+'/parsetest/test.js');

  it('should find line 1', () => {
    const hit = findTestCode(testcodes, 1);
    assert.deepStrictEqual(hit && hit.fullname, 'testSuiteA');
  });
  
  it('should find line 2', () => {
    const hit = findTestCode(testcodes, 2);
    assert.deepStrictEqual(hit && hit.fullname,'testSuiteA test1()');
  });
  
  it('should find line 4 hoge', () => {
    const hit = findTestCode(testcodes, 4);
    assert.deepStrictEqual(hit && hit.fullname,'testSuiteA test1() should run this test');
  });
  
  it('should find line 13', () => {
    const hit = findTestCode(testcodes, 13);
    assert.deepStrictEqual(hit && hit.fullname,'testSuiteA test2 should run this test');
  });
  
  it('should find line 17', () => {
    const hit = findTestCode(testcodes, 17);
    assert.deepStrictEqual(hit && hit.fullname,'testSuiteA test2 test3');
  });
  
  it('should find line 18', () => {
    const hit = findTestCode(testcodes, 18);
    assert.deepStrictEqual(hit && hit.fullname,'testSuiteA test2 test3 should run this test 3');
  });
  
  it('should find line 37', () => {
    const hit = findTestCode(testcodes, 35);
    assert.deepStrictEqual(hit && hit.fullname,'$a + $b returned value not be less than ${i}');
  });
  
  it('should find line 42', () => {
    const hit = findTestCode(testcodes, 42);
    assert.deepStrictEqual(hit && hit.fullname,'returns $expected when $a is added $b');
  });
  
  it('should find line 50', () => {
    const hit = findTestCode(testcodes, 50);
    assert.deepStrictEqual(hit && hit.fullname,'.add(%i, %i) returns ${i}');
  });
  
});
