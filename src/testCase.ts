import * as vscode from 'vscode';
import { parse, findTestCode } from './playwright-editor-support';
import { unquote, resolveTestNameStringInterpolation } from './util';

import { PlaywrightCommandBuilder } from './playwrightCommandBuilder';

export class TestCase {
    public filePath:vscode.Uri = vscode.Uri.file('.');
    public testName:string | undefined = undefined;
  
    public buildRunCommand(options?: string[]):string {
      return PlaywrightCommandBuilder.buildCommand(this.filePath, this.testName, options);
    }
  
    public buildDebugCommand(options?: unknown):vscode.DebugConfiguration {
      return PlaywrightCommandBuilder.getDebugConfig(this.filePath, this.testName, options);
    }
  
    public static toFile(file:vscode.Uri):TestCase {
      const inst = new TestCase();
      inst.filePath = file;
      inst.testName = undefined;
      return inst;
    }
  
    public static async toEditor(testcase?: string):Promise<TestCase> {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw new Error('not found active text editor');
      }
  
      await editor.document.save();
  
      const filePath = editor.document.uri;
      const fileText = editor.document.getText();
      const testName = testcase || this.findCurrentTestName(editor);
  
      const inst = new TestCase();
      inst.filePath = filePath;
      inst.testName = testName;
      return inst;
    }
  
    private static findCurrentTestName(editor: vscode.TextEditor): string | undefined {
      // from selection
      const { selection, document } = editor;
      if (!selection.isEmpty) {
        return unquote(document.getText(selection));
      }
  
      const selectedLine = selection.active.line + 1;
      const filePath = editor.document.fileName;
      const text = editor.document.getText();
      const tests = parse(filePath, text);
      const testcode = findTestCode(tests, selectedLine);
  
      return testcode ? resolveTestNameStringInterpolation(testcode.fullname) : undefined;
    }
  }
  