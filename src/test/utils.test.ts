import { isWindows, searchPathToParent, validateCodeLensOptions } from '../util';
import * as fs from 'fs';

const its = {
  windows: isWindows() ? it : it.skip,
  linux: ['linux', 'darwin'].includes(process.platform) ? it : it.skip,
};

describe('validateCodeLensOptions', () =>
  it.each([
    [
      ['a', 'run', 'RUN', 'watch', 'debug', 'other', 'debug', 'debug', 'watch', 'run'],
      ['run', 'watch', 'debug'],
    ],
    [[], []],
  ])('should turn "jestrunner.codeLens" options  into something valid', (input, expected) => {
    expect(validateCodeLensOptions(input)).toEqual(expected);
  }));

describe('searchPathToParent', () => {
  const scenarios: Array<
    [os: string, fileAsStartPath: string, folderAsStartPath: string, workspacePath: string, traversedPaths: string[]]
  > = [
    [
      'linux',
      '/home/user/workspace/package/src/file.ts',
      '/home/user/workspace/package/src',
      '/home/user/workspace',
      ['/home/user/workspace/package/src', '/home/user/workspace/package', '/home/user/workspace'],
    ],
    [
      'windows',
      'C:\\Users\\user\\workspace\\package\\src\\file.ts',
      'C:\\Users\\user\\workspace\\package\\src',
      'C:\\Users\\user\\workspace',
      ['C:\\Users\\user\\workspace\\package\\src', 'C:\\Users\\user\\workspace\\package', 'C:\\Users\\user\\workspace'],
    ],
  ];
  describe.each(scenarios)('on %s', (os, fileAsStartPath, folderAsStartPath, workspacePath, traversedPaths) => {
    // const fileAsStartPath = '/home/user/workspace/package/src/file.ts';
    // const folderAsStartPath = '/home/user/workspace/package/src';
    // const workspacePath = '/home/user/workspace';
    // const traversedPaths = ['/home/user/workspace/package/src', '/home/user/workspace/package', '/home/user/workspace'];
    beforeEach(() => {
      jest.spyOn(fs, 'statSync').mockImplementation((path): any => {
        if (path === fileAsStartPath) {
          return { isFile: () => true, isDirectory: () => false };
        }
        return { isFile: () => false, isDirectory: () => true };
      });
    });

    its[os]('starts traversal at the starting (directory) path', () => {
      const mockCallback = jest.fn().mockReturnValue('found');
      searchPathToParent(folderAsStartPath, workspacePath, mockCallback);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(traversedPaths[0]);
    });
    its[os]('starts traversal at the folder of the starting (file) path', () => {
      const mockCallback = jest.fn().mockReturnValue('found');
      searchPathToParent(fileAsStartPath, workspacePath, mockCallback);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(traversedPaths[0]);
    });
    its[os]('traverses up to and includes the ancestor path', () => {
      const mockCallback = jest.fn().mockReturnValue(false);
      searchPathToParent(fileAsStartPath, workspacePath, mockCallback);
      expect(mockCallback).toHaveBeenCalledTimes(traversedPaths.length);
      for (const path of traversedPaths) {
        expect(mockCallback).toHaveBeenCalledWith(path);
      }
    });
    its[os]('continues traversal if callback returns 0', () => {
      const mockCallback = jest.fn().mockReturnValue(0);
      const result = searchPathToParent(fileAsStartPath, workspacePath, mockCallback);
      expect(result).toBe(false);
    });
    its[os]('continues traversal if callback returns null', () => {
      const mockCallback = jest.fn().mockReturnValue(null);
      const result = searchPathToParent(fileAsStartPath, workspacePath, mockCallback);
      expect(result).toBe(false);
    });
    its[os]('continues traversal if callback returns void (undefined)', () => {
      const mockCallback = jest.fn().mockReturnValue(undefined);
      const result = searchPathToParent(fileAsStartPath, workspacePath, mockCallback);
      expect(result).toBe(false);
    });
    its[os]('continues traversal if callback returns false', () => {
      const mockCallback = jest.fn().mockReturnValue(undefined);
      const result = searchPathToParent(fileAsStartPath, workspacePath, mockCallback);
      expect(result).toBe(false);
    });
    its[os]('it stops traversal when the callback returns a string', () => {
      const mockCallback = jest.fn().mockReturnValueOnce(false).mockReturnValue('found');
      searchPathToParent(fileAsStartPath, workspacePath, mockCallback);
      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenCalledWith(traversedPaths[0]);
      expect(mockCallback).toHaveBeenCalledWith(traversedPaths[1]);
    });
    its[os]('returns the non-falsy value returned by the callback', () => {
      const mockCallback = jest.fn().mockReturnValueOnce(false).mockReturnValue('found');
      const result = searchPathToParent(fileAsStartPath, workspacePath, mockCallback);
      expect(result).toBe('found');
    });
    its[os]('returns false if the traversal completes without the callback returning a string', () => {
      const mockCallback = jest.fn().mockReturnValue(false);
      const result = searchPathToParent(fileAsStartPath, workspacePath, mockCallback);
      expect(result).toBe(false);
    });
  });
});
