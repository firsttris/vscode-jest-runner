
import parse from '../../../../src/parsers/jestParser';
import { NamedBlock } from '../../../../src/parsers/jestParser/parserNodes';

describe('babelParser extended tests', () => {
  it('should resolve variable references in test names', () => {
    const code = `
      const testName = 'variable test';
      describe('suite', () => {
        it(testName, () => {});
      });
    `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    const test = suite.children[0] as NamedBlock;
    expect(test.name).toBe('variable test');
  });

  it('should resolve template literals with variables', () => {
    const code = `
      const prefix = 'my';
      describe(\`\${prefix} suite\`, () => {
        const type = 'unit';
        it(\`\${type} test\`, () => {});
      });
    `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    expect(suite.name).toBe('my suite');
    const test = suite.children[0] as NamedBlock;
    expect(test.name).toBe('unit test');
  });

  it('should resolve string concatenation', () => {
    const code = `
      describe('part1' + ' ' + 'part2', () => {
        it('start ' + 'end', () => {});
      });
    `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    expect(suite.name).toBe('part1 part2');
    const test = suite.children[0] as NamedBlock;
    expect(test.name).toBe('start end');
  });

  it('should resolve simple member expressions', () => {
    const code = `
       const Obj = { name: 'MyObject' };
       describe(Obj.name, () => {});
     `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    expect(suite.name).toBe('MyObject');
  });

  it('should handle variable scope (shadowing)', () => {
    const code = `
      describe('suite 1', () => {
        const name = 'test A';
        it(name, () => {});
      });
      describe('suite 2', () => {
        const name = 'test B';
        it(name, () => {});
      });
    `;
    const result = parse('test.ts', code);
    const suite1 = result.root.children[0] as NamedBlock;
    expect((suite1.children[0] as NamedBlock).name).toBe('test A');

    const suite2 = result.root.children[1] as NamedBlock;
    expect((suite2.children[0] as NamedBlock).name).toBe('test B');
  });

  it('should resolve multiple variables in template literal', () => {
    const a = 'Hello';
    const b = 'World';
    const code = `
        const a = 'Hello';
        const b = 'World';
        describe(\`\${a} \${b}\`, () => {});
      `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    expect(suite.name).toBe('Hello World');
  });

  it('should handle undefined/unresolved variables gracefully', () => {
    const code = `
        describe(someUndefinedVar, () => {});
      `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;

    expect(suite.name).toBe('someUndefinedVar');
  });

  it('should handle non-string values in names', () => {
    const code = `
         describe(123, () => {});
         describe(true, () => {});
         `;
    const result = parse('test.ts', code);
    const suite1 = result.root.children[0] as NamedBlock;

    expect(suite1.name).toBe('123');
  });

  it('should handle variable scope (leaking check)', () => {
    const code = `
        describe('suite 1', () => {
          const name = 'test A';
        });
        describe('suite 2', () => {
           // name is not defined in this scope
           it(name, () => {});
        });
      `;
    const result = parse('test.ts', code);
    const suite2 = result.root.children[1] as NamedBlock;
    const test = suite2.children[0] as NamedBlock;
    expect(test.name).toBe('name');
  });

  it('should resolve computed property access', () => {
    const code = `
        const Obj = { name: 'computed' };
        describe(Obj['name'], () => {});
      `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    expect(suite.name).toBe('computed');
  });

  it('should resolve object destructuring', () => {
    const code = `
         const { name } = { name: 'destructured' };
         describe(name, () => {});
       `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    expect(suite.name).toBe('destructured');
  });
  it('should resolve name from required module variable', () => {
    const code = `
      const sum = require("./sum");
      describe(sum.name, () => {
        it("adds 1 + 2 to equal 3", () => {
          expect(sum(1, 2)).toBe(3);
        });
      });
    `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    expect(suite.name).toBe('sum');
  });

  it('should resolve name from imported module variable', () => {
    const code = `
      import sum from "./sum";
      describe(sum.name, () => {
        it("adds 1 + 2 to equal 3", () => {
          expect(sum(1, 2)).toBe(3);
        });
      });
    `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    expect(suite.name).toBe('sum');
  });

  it('should resolve name for "it" blocks with dynamic names', () => {
    const code = `
      const sum = require("./sum");
      describe('suite', () => {
        it(sum.name, () => {
          expect(true).toBe(true);
        });
      });
    `;
    const result = parse('test.ts', code);
    const suite = result.root.children[0] as NamedBlock;
    const test = suite.children[0] as NamedBlock;
    expect(test.name).toBe('sum');
  });

  it('should resolve deep member expression usage of .name', () => {
    const code = `
      class TestClass {
        myFunction() {}
      }
      it(TestClass.prototype.myFunction.name, () => {
        expect(true).toBe(true);
      });
    `;
    const result = parse('test.ts', code);
    const test = result.root.children[0] as NamedBlock;
    expect(test.name).toBe('myFunction');
  });
});
