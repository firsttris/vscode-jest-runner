
import parse from '../../../../src/parsers/jestParser';
import { NamedBlock } from '../../../../src/parsers/jestParser/parserNodes';

describe('babelParser Playwright tests', () => {
    it('should parse basic test block', () => {
        const code = `
      test('basic test', () => {
        expect(true).toBe(true);
      });
    `;
        const result = parse('test.ts', code);
        const test = result.root.children[0] as NamedBlock;
        expect(test.name).toBe('basic test');
    });

    it('should parse test.describe block', () => {
        const code = `
      test.describe('group', () => {
        test('inner test', () => {});
      });
    `;
        const result = parse('test.ts', code);
        const describe = result.root.children[0] as NamedBlock;
        expect(describe.name).toBe('group');
        expect(describe.type).toBe('describe');

        const test = describe.children[0] as NamedBlock;
        expect(test.name).toBe('inner test');
    });

    it('should parse test.describe.parallel block', () => {
        const code = `
      test.describe.parallel('parallel group', () => {
        test('inner test', () => {});
      });
    `;
        const result = parse('test.ts', code);
        const describe = result.root.children[0] as NamedBlock;
        expect(describe.name).toBe('parallel group');
        expect(describe.type).toBe('describe');
    });

    it('should parse test.describe.serial block', () => {
        const code = `
      test.describe.serial('serial group', () => {
      });
    `;
        const result = parse('test.ts', code);
        const describe = result.root.children[0] as NamedBlock;
        expect(describe.name).toBe('serial group');
        expect(describe.type).toBe('describe');
    });

    it('should parse test.describe.only block', () => {
        const code = `
        test.describe.only('only group', () => {
        });
      `;
        const result = parse('test.ts', code);
        const describe = result.root.children[0] as NamedBlock;
        expect(describe.name).toBe('only group');
        expect(describe.type).toBe('describe');
    });

    it('should parse test.describe.skip block', () => {
        const code = `
        test.describe.skip('skip group', () => {
        });
      `;
        const result = parse('test.ts', code);
        const describe = result.root.children[0] as NamedBlock;
        expect(describe.name).toBe('skip group');
        expect(describe.type).toBe('describe');
    });

    it('should parse test.only (modifiers on test) as test', () => {
        const code = `
          test.only('only test', () => {
          });
        `;
        const result = parse('test.ts', code);
        const test = result.root.children[0] as NamedBlock;
        expect(test.name).toBe('only test');
        expect(test.type).toBe('it');
    });

    it('should ignore test.step', () => {
        const code = `
        test('step test', async ({ page }) => {
          await test.step('my step', async () => {
             // ...
          });
        });
      `;
        const result = parse('test.ts', code);
        const test = result.root.children[0] as NamedBlock;
        expect(test.name).toBe('step test');
        expect(test.children || []).toHaveLength(0);
    });
});
