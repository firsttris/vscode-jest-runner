import {
  isWindows,
  searchPathToParent,
  validateCodeLensOptions,
  getDirName,
  getFileName,
  normalizePath,
  escapeRegExp,
  escapeRegExpForPath,
  escapeSingleQuotes,
  quote,
  unquote,
  pushMany,
  updateTestNameIfUsingProperties,
  resolveConfigPathOrMapping,
  findFullTestName,
  shouldIncludeFile,
} from '../util';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import * as fastGlob from 'fast-glob';
import { isJestTestFile } from '../jestDetection';

const its = {
  windows: isWindows() ? it : it.skip,
  linux: ['linux', 'darwin'].includes(process.platform) ? it : it.skip,
};

// Helper function to create test nodes with required properties
function createTestNode(data: {
  type: string;
  name: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
  children?: any[];
}): any {
  return {
    ...data,
    file: '',
    addChild: () => {},
    filter: () => [],
  };
}

describe('getDirName', () => {
  it('should return the directory name', () => {
    expect(getDirName('/path/to/file.ts')).toBe('/path/to');
    expect(getDirName('/path/to/dir/')).toBe('/path/to');
  });
});

describe('getFileName', () => {
  it('should return the file name', () => {
    expect(getFileName('/path/to/file.ts')).toBe('file.ts');
    expect(getFileName('/path/to/dir/')).toBe('dir');
  });
});

describe('normalizePath', () => {
  its.windows('should replace backslashes with forward slashes on Windows', () => {
    expect(normalizePath('C:\\path\\to\\file.ts')).toBe('C:/path/to/file.ts');
  });

  its.linux('should return the path unchanged on Linux', () => {
    expect(normalizePath('/path/to/file.ts')).toBe('/path/to/file.ts');
  });
});

describe('escapeRegExp', () => {
  it('should escape special regex characters', () => {
    expect(escapeRegExp('test.name')).toBe('test\\.name');
    expect(escapeRegExp('test*name')).toBe('test\\*name');
    expect(escapeRegExp('test+name')).toBe('test\\+name');
    expect(escapeRegExp('test?name')).toBe('test\\?name');
    expect(escapeRegExp('test^name')).toBe('test\\^name');
    expect(escapeRegExp('test$name')).toBe('test\\$name');
    expect(escapeRegExp('test{name}')).toBe('test\\{name\\}');
    expect(escapeRegExp('test[name]')).toBe('test\\[name\\]');
    expect(escapeRegExp('test(name)')).toBe('test\\(name\\)');
    expect(escapeRegExp('test|name')).toBe('test\\|name');
  });

  it('should convert match all patterns (.*?) back to non-escaped form', () => {
    expect(escapeRegExp('test(.*?)name')).toBe('test(.*?)name');
  });
});

describe('escapeRegExpForPath', () => {
  it('should escape special regex characters including backslashes', () => {
    expect(escapeRegExpForPath('test*name')).toBe('test\\*name');
    expect(escapeRegExpForPath('test+name')).toBe('test\\+name');
    expect(escapeRegExpForPath('C:\\path\\to\\file')).toBe('C:\\\\path\\\\to\\\\file');
  });
});

describe('escapeSingleQuotes', () => {
  its.linux('should escape single quotes on Linux', () => {
    expect(escapeSingleQuotes("test'name")).toBe("test'\\''name");
  });

  its.windows('should not escape single quotes on Windows', () => {
    expect(escapeSingleQuotes("test'name")).toBe("test'name");
  });
});

describe('quote', () => {
  its.windows('should wrap string with double quotes on Windows', () => {
    expect(quote('test')).toBe('"test"');
  });

  its.linux('should wrap string with single quotes on Linux', () => {
    expect(quote('test')).toBe("'test'");
  });
});

describe('unquote', () => {
  it('should remove quotes from string', () => {
    expect(unquote('"test"')).toBe('test');
    expect(unquote("'test'")).toBe('test');
    expect(unquote('`test`')).toBe('test');
    expect(unquote('test')).toBe('test');
  });

  it('should only remove quotes at the beginning and end', () => {
    expect(unquote('"te"st"')).toBe('te"st');
    expect(unquote("'te'st'")).toBe("te'st");
  });
});

describe('pushMany', () => {
  it('should push multiple items to an array', () => {
    const arr = [1, 2, 3];
    const result = pushMany(arr, [4, 5, 6]);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result).toBe(6);
  });

  it('should handle empty arrays', () => {
    const arr = [1, 2, 3];
    const result = pushMany(arr, []);
    expect(arr).toEqual([1, 2, 3]);
    expect(result).toBe(3);
  });
});

describe('updateTestNameIfUsingProperties', () => {
  it('should return undefined if input is undefined', () => {
    expect(updateTestNameIfUsingProperties(undefined)).toBeUndefined();
  });

  it('should remove \\.name property from test name', () => {
    expect(updateTestNameIfUsingProperties('MyClass\\.name')).toBe('MyClass');
    expect(updateTestNameIfUsingProperties('test MyClass\\.name')).toBe('test MyClass');
  });

  it('should remove \\.prototype\\. from test name', () => {
    expect(updateTestNameIfUsingProperties('MyClass\\.prototype\\.method')).toBe('method');
    expect(updateTestNameIfUsingProperties('test MyClass\\.prototype\\.method')).toBe('test method');
  });

  it('should handle combined patterns', () => {
    expect(updateTestNameIfUsingProperties('MyClass\\.name\\.prototype\\.method')).toBe('method');
  });

  it('should not modify test names without special patterns', () => {
    expect(updateTestNameIfUsingProperties('simple test name')).toBe('simple test name');
  });
});

describe('findFullTestName', () => {
  it('should return undefined if children is undefined', () => {
    expect(findFullTestName(1, undefined)).toBeUndefined();
  });

  it('should return undefined if children is empty', () => {
    expect(findFullTestName(1, [])).toBeUndefined();
  });

  it('should find test name for describe block', () => {
    const children = [
      createTestNode({
        type: 'describe',
        name: 'My Test Suite',
        start: { line: 1, column: 0 },
        end: { line: 10, column: 0 },
        children: [],
      }),
    ];
    expect(findFullTestName(1, children)).toBe('My Test Suite');
  });

  it('should find test name for test block', () => {
    const children = [
      createTestNode({
        type: 'it',
        name: 'should work',
        start: { line: 5, column: 2 },
        end: { line: 7, column: 2 },
        children: [],
      }),
    ];
    expect(findFullTestName(6, children)).toBe('should work');
  });

  it('should concatenate nested test names', () => {
    const children = [
      createTestNode({
        type: 'describe',
        name: 'My Suite',
        start: { line: 1, column: 0 },
        end: { line: 10, column: 0 },
        children: [
          createTestNode({
            type: 'it',
            name: 'should work',
            start: { line: 5, column: 2 },
            end: { line: 7, column: 2 },
            children: [],
          }),
        ],
      }),
    ];
    expect(findFullTestName(6, children)).toBe('My Suite should work');
  });

  it('should handle template literals with variables', () => {
    const children = [
      createTestNode({
        type: 'it',
        name: 'should work with ${variable}',
        start: { line: 5, column: 2 },
        end: { line: 7, column: 2 },
        children: [],
      }),
    ];
    expect(findFullTestName(6, children)).toBe('should work with (.*?)');
  });

  it('should handle printf-style format strings', () => {
    const children = [
      createTestNode({
        type: 'it',
        name: 'should work with %s',
        start: { line: 5, column: 2 },
        end: { line: 7, column: 2 },
        children: [],
      }),
    ];
    expect(findFullTestName(6, children)).toBe('should work with (.*?)');
  });
});



describe('resolveConfigPathOrMapping', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should return string value as-is', () => {
    expect(resolveConfigPathOrMapping('./jest.config.js', '/path/to/test.ts')).toBe('./jest.config.js');
  });

  it('should return undefined value as-is', () => {
    expect(resolveConfigPathOrMapping(undefined, '/path/to/test.ts')).toBeUndefined();
  });

  it('should match glob pattern and return corresponding value', () => {
    const mapping = {
      '**/*.test.ts': './jest.test.config.js',
      '**/*.spec.ts': './jest.spec.config.js',
    };
    expect(resolveConfigPathOrMapping(mapping, '/path/to/my.test.ts')).toBe('./jest.test.config.js');
    expect(resolveConfigPathOrMapping(mapping, '/path/to/my.spec.ts')).toBe('./jest.spec.config.js');
  });

  it('should normalize paths in matched values', () => {
    const mapping = {
      '**/*.test.ts': 'C:\\\\path\\\\to\\\\jest.config.js',
    };
    const result = resolveConfigPathOrMapping(mapping, '/path/to/my.test.ts');
    // normalizePath is called, so on non-Windows it stays as is, on Windows backslashes are converted
    expect(result).toBeTruthy();
    expect(result).toContain('jest.config.js');
  });

  it('should return undefined if no glob matches', () => {
    jest.spyOn(vscode.window, 'showWarningMessage').mockReturnValue(undefined);
    const mapping = {
      '**/*.test.ts': './jest.test.config.js',
    };
    expect(resolveConfigPathOrMapping(mapping, '/path/to/my.spec.ts')).toBeUndefined();
  });

  it('should show warning message when no glob matches', () => {
    const showWarning = jest.spyOn(vscode.window, 'showWarningMessage').mockReturnValue(undefined);
    const mapping = {
      '**/*.test.ts': './jest.test.config.js',
    };
    resolveConfigPathOrMapping(mapping, '/path/to/my.spec.ts');
    expect(showWarning).toHaveBeenCalledWith(
      expect.stringContaining('None of the glob patterns in the configPath mapping matched'),
    );
  });

  it('should not show warning for empty mapping', () => {
    const showWarning = jest.spyOn(vscode.window, 'showWarningMessage').mockReturnValue(undefined);
    resolveConfigPathOrMapping({}, '/path/to/my.spec.ts');
    expect(showWarning).not.toHaveBeenCalled();
  });
});

describe('validateCodeLensOptions', () =>
  it.each([
    [
      ['a', 'run', 'RUN', 'watch', 'debug', 'other', 'debug', 'debug', 'watch', 'run'],
      ['run', 'watch', 'debug'],
    ],
    [[], []],
    [
      ['coverage', 'current-test-coverage', 'run'],
      ['coverage', 'current-test-coverage', 'run'],
    ],
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

describe('shouldIncludeFile', () => {
  let getConfigurationMock: jest.Mock;
  let configMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup configuration mock
    configMock = {
      get: jest.fn((key: string, defaultValue?: any) => defaultValue),
    };
    
    getConfigurationMock = jest.fn().mockReturnValue(configMock);
    vscode.workspace.getConfiguration = getConfigurationMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when no include/exclude patterns are configured', () => {
    beforeEach(() => {
      configMock.get.mockImplementation((key: string, defaultValue: any) => defaultValue);
    });

    it('should delegate to isJestTestFile when no include/exclude patterns', () => {
      const filePath = '/workspace/src/test.test.ts';
      const workspacePath = '/workspace';
      
      // Mock isJestTestFile to return true
      jest.spyOn(require('../jestDetection'), 'isJestTestFile').mockReturnValue(true);
      
      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(true);
      expect(require('../jestDetection').isJestTestFile).toHaveBeenCalledWith(filePath);
    });

    it('should return false when isJestTestFile returns false', () => {
      const filePath = '/workspace/src/regular.ts';
      const workspacePath = '/workspace';
      
      // Mock isJestTestFile to return false
      jest.spyOn(require('../jestDetection'), 'isJestTestFile').mockReturnValue(false);
      
      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(false);
    });
  });

  describe('when include patterns are configured', () => {
    it('should return true when file matches include pattern', () => {
      const filePath = '/workspace/src/test.test.ts';
      const workspacePath = '/workspace';
      const includePatterns = ['**/*.test.ts'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        return defaultValue;
      });

      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(true);
    });

    it('should return false when file does not match include pattern', () => {
      const filePath = '/workspace/src/test.spec.ts';
      const workspacePath = '/workspace';
      const includePatterns = ['**/*.test.ts'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        return defaultValue;
      });

      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(false);
    });

    it('should return true when file matches any of multiple include patterns', () => {
      const filePath = '/workspace/src/test.spec.ts';
      const workspacePath = '/workspace';
      const includePatterns = ['**/*.test.ts', '**/*.spec.ts'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        return defaultValue;
      });

      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(true);
    });

    it('should handle complex glob patterns', () => {
      const filePath = '/workspace/src/feature/__tests__/component.test.tsx';
      const workspacePath = '/workspace';
      const includePatterns = ['**/__tests__/**/*.test.{ts,tsx}'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        return defaultValue;
      });

      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(true);
    });
  });

  describe('when exclude patterns are configured', () => {
    it('should return false when file matches exclude pattern', () => {
      const filePath = '/workspace/node_modules/lib/test.test.ts';
      const workspacePath = '/workspace';
      const excludePatterns = ['**/node_modules/**'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'exclude') return excludePatterns;
        return defaultValue;
      });

      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(false);
    });

    it('should return true when file does not match exclude pattern', () => {
      const filePath = '/workspace/src/test.test.ts';
      const workspacePath = '/workspace';
      const excludePatterns = ['**/node_modules/**'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'exclude') return excludePatterns;
        return defaultValue;
      });

      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(true);
    });

    it('should return false when file matches any of multiple exclude patterns', () => {
      const filePath = '/workspace/build/test.test.ts';
      const workspacePath = '/workspace';
      const excludePatterns = ['**/node_modules/**', '**/build/**', '**/dist/**'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'exclude') return excludePatterns;
        return defaultValue;
      });

      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(false);
    });
  });

  describe('when both include and exclude patterns are configured', () => {
    it('should return true when file matches include but not exclude', () => {
      const filePath = '/workspace/src/test.test.ts';
      const workspacePath = '/workspace';
      const includePatterns = ['**/*.test.ts'];
      const excludePatterns = ['**/node_modules/**'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        if (key === 'exclude') return excludePatterns;
        return defaultValue;
      });
      
      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(true);
    });

    it('should return false when file matches include but also matches exclude', () => {
      const filePath = '/workspace/node_modules/test.test.ts';
      const workspacePath = '/workspace';
      const includePatterns = ['**/*.test.ts'];
      const excludePatterns = ['**/node_modules/**'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        if (key === 'exclude') return excludePatterns;
        return defaultValue;
      });
      
      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(false);
    });

    it('should return false when file does not match include pattern', () => {
      const filePath = '/workspace/src/regular.ts';
      const workspacePath = '/workspace';
      const includePatterns = ['**/*.test.ts'];
      const excludePatterns = ['**/node_modules/**'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        if (key === 'exclude') return excludePatterns;
        return defaultValue;
      });
      
      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(false);
    });

    it('should prioritize exclude over include when both match', () => {
      const filePath = '/workspace/src/__snapshots__/test.test.ts';
      const workspacePath = '/workspace';
      const includePatterns = ['**/*.test.ts'];
      const excludePatterns = ['**/__snapshots__/**'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        if (key === 'exclude') return excludePatterns;
        return defaultValue;
      });
      
      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(false);
    });
  });

  describe('path normalization', () => {
    it('should normalize file paths before matching', () => {
      const filePath = 'C:\\workspace\\src\\test.test.ts';
      const workspacePath = 'C:\\workspace';
      const includePatterns = ['**/*.test.ts'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        return defaultValue;
      });
      
      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(true);
    });

    it('should handle both relative and absolute path matching', () => {
      const filePath = '/workspace/src/test.test.ts';
      const workspacePath = '/workspace';
      const includePatterns = ['**/*.test.ts'];
      
      configMock.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'include') return includePatterns;
        return defaultValue;
      });
      
      const result = shouldIncludeFile(filePath, workspacePath);
      
      expect(result).toBe(true);
    });
  });
});
