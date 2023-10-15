import { tmpdir } from 'os';
import { mkdtempSync } from 'fs';
import { rimrafSync } from 'rimraf';
import * as path from 'path';
import { runJestCommand } from './util/runJestCommand';
import { Shell } from './util/shellHandler';
import { isWindows } from '../util';

const ALL_SHELLS: Array<Shell> = isWindows() ? ['cmd'] : ['bash'];

describe('CommandBuilder', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.resolve(tmpdir(), 'commandBuilder'));
  });

  afterEach(() => {
    rimrafSync(tempDir);
  });

  describe.each(ALL_SHELLS)('mustMatchSelf (%s)', (shell: Shell) => {
    it('single quote', () => mustMatchSelf(shell, `test with ' single quote`));
    it('double quote', () => mustMatchSelf(shell, 'test with " double quote'));
    it('parenthesis', () => mustMatchSelf(shell, 'test with () parenthesis'));
    it('lf', () => mustMatchSelf(shell, `test with \nlf`));
    it('lf#2', () => mustMatchSelf(shell, 'test with \nmanual lf'));
    it('crlf', () => mustMatchSelf(shell, 'test with \r\nmanual crlf'));
    it('backticks', () => mustMatchSelf(shell, 'test with `backticks`'));
    it('regex', () => mustMatchSelf(shell, 'test with regex .*$^|[]'));
    it('prototype .name property', () => mustMatchSelf(shell, 'TestClass.prototype.myFunction.name', 'myFunction'));
    it('mix of quotes and paranthesis', () =>
      mustMatchSelf(shell, 'a "(name)"', 'mix of paranthesis and double quotes'));
  });

  async function mustMatchSelf(shell: Shell, testName: string, expectedTestName?: string) {
    if (shouldSkipMustMatchSelf(shell, testName)) {
      return;
    }
    const jestJson = await runJestCommand(shell, tempDir, testName);
    const expectedPassedTests = [expectedTestName ?? testName];
    return expect(jestJson).toEqual(
      expect.objectContaining({
        passedTests: expectedPassedTests,
      })
    );
  }

  // FIXME: these are broken
  function shouldSkipMustMatchSelf(_shell: Shell, _testName: string): boolean {
    return false;
  }

  describe.each(ALL_SHELLS)('mustMatchAll (%s)', (shell: Shell) => {
    it('all match', () => mustMatchAll(shell, 'test with '));
    it('using %', () => mustMatchAll(shell, 'test with %p'));
    it('using $', () => mustMatchAll(shell, 'test with $var'));
  });

  async function mustMatchAll(shell: Shell, testName: string) {
    const jestJson = await runJestCommand(shell, tempDir, testName);
    expect(jestJson).toEqual(
      expect.objectContaining({
        numPassedTests: 15,
      })
    );
  }
});
