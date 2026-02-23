import { pushMany, validateCodeLensOptions } from '../util';
import {
  isWindows,
  getDirName,
  getFileName,
  normalizePath,
  escapeRegExpForPath,
  resolveConfigPathOrMapping,
} from '../utils/PathUtils';
import {
  escapeRegExp,
  escapeSingleQuotes,
  quote,
  unquote,
  resolveTestNameStringInterpolation,
  updateTestNameIfUsingProperties,
  findFullTestName,
} from '../utils/TestNameUtils';
import * as fs from 'node:fs';

const its = {
  windows: isWindows() ? it : it.skip,
  linux: ['linux', 'darwin'].includes(process.platform) ? it : it.skip,
};

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
  its.windows(
    'should replace backslashes with forward slashes on Windows',
    () => {
      expect(normalizePath('C:\\path\\to\\file.ts')).toBe('C:/path/to/file.ts');
    },
  );

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

describe('resolveTestNameStringInterpolation', () => {
  it('should resolve plain $ and ${} placeholders to wildcard pattern', () => {
    expect(resolveTestNameStringInterpolation('xyz by $title')).toBe(
      'xyz by (.*?)',
    );
    expect(resolveTestNameStringInterpolation('xyz by ${title}')).toBe(
      'xyz by (.*?)',
    );
  });

  it('should resolve escaped $ placeholders to wildcard pattern', () => {
    expect(resolveTestNameStringInterpolation('xyz by \\$title')).toBe(
      'xyz by (.*?)',
    );
    expect(resolveTestNameStringInterpolation('xyz by \\\${title}')).toBe(
      'xyz by (.*?)',
    );
  });

  it('should resolve dotted placeholders to wildcard pattern', () => {
    expect(
      resolveTestNameStringInterpolation(
        'should run correctly for id ${test_case.id}',
      ),
    ).toBe('should run correctly for id (.*?)');
    expect(
      resolveTestNameStringInterpolation(
        'should run correctly for id $test_case.id',
      ),
    ).toBe('should run correctly for id (.*?)');
  });
});

describe('escapeRegExpForPath', () => {
  it('should escape special regex characters including backslashes', () => {
    expect(escapeRegExpForPath('test*name')).toBe('test\\*name');
    expect(escapeRegExpForPath('test+name')).toBe('test\\+name');
    expect(escapeRegExpForPath('C:\\path\\to\\file')).toBe(
      'C:\\\\path\\\\to\\\\file',
    );
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
    expect(updateTestNameIfUsingProperties('test MyClass\\.name')).toBe(
      'test MyClass',
    );
  });

  it('should remove \\.prototype\\. from test name', () => {
    expect(
      updateTestNameIfUsingProperties('MyClass\\.prototype\\.method'),
    ).toBe('method');
    expect(
      updateTestNameIfUsingProperties('test MyClass\\.prototype\\.method'),
    ).toBe('test method');
  });

  it('should handle combined patterns', () => {
    expect(
      updateTestNameIfUsingProperties('MyClass\\.name\\.prototype\\.method'),
    ).toBe('method');
  });

  it('should not modify test names without special patterns', () => {
    expect(updateTestNameIfUsingProperties('simple test name')).toBe(
      'simple test name',
    );
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
    expect(
      resolveConfigPathOrMapping('./jest.config.js', '/path/to/test.ts'),
    ).toBe('./jest.config.js');
  });

  it('should return undefined value as-is', () => {
    expect(
      resolveConfigPathOrMapping(undefined, '/path/to/test.ts'),
    ).toBeUndefined();
  });

  it('should match glob pattern and return corresponding value', () => {
    const mapping = {
      '**/*.test.ts': './jest.test.config.js',
      '**/*.spec.ts': './jest.spec.config.js',
    };
    expect(resolveConfigPathOrMapping(mapping, '/path/to/my.test.ts')).toBe(
      './jest.test.config.js',
    );
    expect(resolveConfigPathOrMapping(mapping, '/path/to/my.spec.ts')).toBe(
      './jest.spec.config.js',
    );
  });

  it('should normalize paths in matched values', () => {
    const mapping = {
      '**/*.test.ts': 'C:\\\\path\\\\to\\\\jest.config.js',
    };
    const result = resolveConfigPathOrMapping(mapping, '/path/to/my.test.ts');
    expect(result).toBeTruthy();
    expect(result).toContain('jest.config.js');
  });

  it('should return undefined if no glob matches', () => {
    const mapping = {
      '**/*.test.ts': './jest.test.config.js',
    };
    expect(
      resolveConfigPathOrMapping(mapping, '/path/to/my.spec.ts'),
    ).toBeUndefined();
  });

  it('should return undefined for empty mapping', () => {
    expect(
      resolveConfigPathOrMapping({}, '/path/to/my.spec.ts'),
    ).toBeUndefined();
  });
});

describe('validateCodeLensOptions', () =>
  it.each([
    [
      [
        'a',
        'run',
        'RUN',
        'watch',
        'debug',
        'other',
        'debug',
        'debug',
        'watch',
        'run',
      ],
      ['run', 'watch', 'debug'],
    ],
    [[], []],
    [
      ['coverage', 'current-test-coverage', 'run'],
      ['coverage', 'current-test-coverage', 'run'],
    ],
  ])(
    'should turn "jestrunner.codeLens" options  into something valid',
    (input, expected) => {
      expect(validateCodeLensOptions(input)).toEqual(expected);
    },
  ));

import { parseShellCommand } from '../utils/ShellUtils';

describe('parseShellCommand', () => {
  it('should parse simple command', () => {
    expect(parseShellCommand('npm test')).toEqual(['npm', 'test']);
  });

  it('should handle single quotes', () => {
    expect(parseShellCommand("npm run 'test:watch'")).toEqual([
      'npm',
      'run',
      'test:watch',
    ]);
  });

  it('should handle double quotes', () => {
    expect(parseShellCommand('npm run "test:watch"')).toEqual([
      'npm',
      'run',
      'test:watch',
    ]);
  });

  it('should handle escaped characters', () => {
    expect(parseShellCommand('npm run test\\:watch')).toEqual([
      'npm',
      'run',
      'test:watch',
    ]);
  });

  it('should handle quotes inside words', () => {
    expect(parseShellCommand('npm run test="foo bar"')).toEqual([
      'npm',
      'run',
      'test=foo bar',
    ]);
  });

  it('should handle spaces inside quotes', () => {
    expect(parseShellCommand('echo "hello world"')).toEqual([
      'echo',
      'hello world',
    ]);
  });

  it('should handle empty string', () => {
    expect(parseShellCommand('')).toEqual([]);
  });
});
