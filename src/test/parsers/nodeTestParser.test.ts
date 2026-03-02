import { parseNodeTestFile } from '../../parsers/nodeTestParser';
import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
}));

describe('Node Test Parser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseNodeTestFile', () => {
    it('should parse nested describe blocks correctly', () => {
      const code = `
      import { describe, it } from 'node:test';
      import assert from 'node:assert';

      describe('math functions', () => {
        describe('add', () => {
          it('should add two positive numbers', () => {
            assert.strictEqual(add(2, 3), 5);
          });

          it('should add negative numbers', () => {
            assert.strictEqual(add(-1, -2), -3);
          });
        });

        describe('subtract', () => {
          it('should subtract two numbers', () => {
            assert.strictEqual(subtract(5, 3), 2);
          });
        });
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);

      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      const mainDescribe = result.root.children[0];
      expect(mainDescribe.name).toBe('math functions');
      expect(mainDescribe.children).toHaveLength(2);

      const addDescribe = mainDescribe.children[0];
      expect(addDescribe.name).toBe('add');
      expect(addDescribe.children).toHaveLength(2);
      expect(addDescribe.children[0].name).toBe(
        'should add two positive numbers',
      );
      expect(addDescribe.children[1].name).toBe('should add negative numbers');

      const subtractDescribe = mainDescribe.children[1];
      expect(subtractDescribe.name).toBe('subtract');
      expect(subtractDescribe.children).toHaveLength(1);
      expect(subtractDescribe.children[0].name).toBe(
        'should subtract two numbers',
      );
    });

    it('should parse simple test() calls', () => {
      const code = `
      import { test } from 'node:test';

      test('first test', () => {
        console.log('test 1');
      });

      test('second test', () => {
        console.log('test 2');
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(2);
      expect(result.root.children[0].name).toBe('first test');
      expect(result.root.children[0].type).toBe('test');
      expect(result.root.children[1].name).toBe('second test');
      expect(result.root.children[1].type).toBe('test');
    });

    it('should parse it() calls', () => {
      const code = `
      import { it } from 'node:test';

      it('should work', () => {
        expect(true).toBe(true);
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('should work');
      expect(result.root.children[0].type).toBe('test');
    });

    it('should parse test.only()', () => {
      const code = `
      import { test } from 'node:test';

      test.only('focused test', () => {
        console.log('only this runs');
      });

      test('normal test', () => {
        console.log('this is skipped');
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(2);
      expect(result.root.children[0].name).toBe('focused test');
      expect(result.root.children[1].name).toBe('normal test');
    });

    it('should parse test.skip()', () => {
      const code = `
      import { test } from 'node:test';

      test.skip('skipped test', () => {
        console.log('this is skipped');
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('skipped test');
    });

    it('should parse test.todo()', () => {
      const code = `
      import { test } from 'node:test';

      test.todo('todo test', () => {
        console.log('not yet implemented');
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('todo test');
    });

    it('should parse describe.only()', () => {
      const code = `
      import { describe, it } from 'node:test';

      describe.only('focused suite', () => {
        it('test inside', () => {});
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('focused suite');
      expect(result.root.children[0].type).toBe('describe');
    });

    it('should parse describe.skip()', () => {
      const code = `
      import { describe, it } from 'node:test';

      describe.skip('skipped suite', () => {
        it('test inside', () => {});
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('skipped suite');
      expect(result.root.children[0].type).toBe('describe');
    });

    it('should parse template literal test names', () => {
      const code = `
      import { test } from 'node:test';

      test(\`template literal test\`, () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('template literal test');
    });

    it('should handle template literals with expressions', () => {
      const code = `
      import { test } from 'node:test';
      const value = 42;

      test(\`test with \${value} expression\`, () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toContain('${...}');
    });

    it('should capture correct line and column positions', () => {
      const code = `import { test } from 'node:test';

test('positioned test', () => {
  console.log('test');
});`;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].start.line).toBe(3);
      expect(result.root.children[0].start.column).toBe(0);
    });

    it('should set file path correctly', () => {
      const code = `
      import { test } from 'node:test';
      test('test', () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const filePath = '/path/to/my-test.js';
      const result = parseNodeTestFile(filePath, code);

      expect(result.file).toBe(filePath);
      expect(result.root.children[0].file).toBe(filePath);
    });

    it('should parse TypeScript files', () => {
      const code = `
      import { describe, it } from 'node:test';

      interface TestInterface {
        value: number;
      }

      describe('TypeScript test', () => {
        it('should handle types', () => {
          const obj: TestInterface = { value: 42 };
        });
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.ts', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('TypeScript test');
    });

    it('should handle empty file', () => {
      const code = '';

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(0);
    });

    it('should handle file with no tests', () => {
      const code = `
      import { describe } from 'node:test';
      const x = 1;
      console.log('no tests here');
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(0);
    });

    it('should remove duplicate tests from same position', () => {
      const code = `
      import { test } from 'node:test';
      test('unique test', () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
    });

    it('should read file from path when content not provided', () => {
      const code = `
      import { test } from 'node:test';
      test('file read test', () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js');

      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/test.js', 'utf-8');
      expect(result.root.children).toHaveLength(1);
    });

    it('should parse it.only()', () => {
      const code = `
      import { it } from 'node:test';

      it.only('focused it test', () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('focused it test');
    });

    it('should parse it.skip()', () => {
      const code = `
      import { it } from 'node:test';

      it.skip('skipped it test', () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('skipped it test');
    });

    it('should handle mixed test and describe at root level', () => {
      const code = `
      import { describe, test } from 'node:test';

      test('root level test', () => {});

      describe('suite', () => {
        test('nested test', () => {});
      });

      test('another root test', () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(3);
      expect(result.root.children[0].type).toBe('test');
      expect(result.root.children[1].type).toBe('describe');
      expect(result.root.children[1].children).toHaveLength(1);
      expect(result.root.children[2].type).toBe('test');
    });

    it('should handle JSX syntax in test files', () => {
      const code = `
      import { test } from 'node:test';
      import React from 'react';

      test('renders component', () => {
        const element = <div>Hello</div>;
      });
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.tsx', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('renders component');
    });

    it('should ignore non-test function calls', () => {
      const code = `
      import { test } from 'node:test';

      function customTest(name, fn) { fn(); }

      customTest('not a real test', () => {});
      test('real test', () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('real test');
    });

    it('should not match invalid modifiers', () => {
      const code = `
      import { test } from 'node:test';

      test.invalid('not valid', () => {});
      test('valid test', () => {});
    `;

      (fs.readFileSync as jest.Mock).mockReturnValue(code);
      const result = parseNodeTestFile('/path/to/test.js', code);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].name).toBe('valid test');
    });
  });
});
