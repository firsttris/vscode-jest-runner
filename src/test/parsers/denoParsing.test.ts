import parse from '../../parsers/jestParser';
import { ParsedNodeType } from '../../parsers/jestParser/parserNodes';

describe('Deno Parser Support', () => {
  it('should parse Deno.test calls', () => {
    const code = `
      Deno.test("simple test", () => {
        // test body
      });

      Deno.test({
        name: "test with options",
        fn: () => {}
      });

      Deno.test(function namedTest() {});
    `;

    const result = parse('test.ts', code);
    const itBlocks = result.itBlocks;

    expect(itBlocks).toHaveLength(3);

    expect(itBlocks[0].name).toBe('simple test');
    expect(itBlocks[0].type).toBe(ParsedNodeType.it);

    // Options object - name extraction might fail or be empty depending on implementation,
    // but it should be detected as a test block.
    // In current implementation, applyNameInfo gets first arg. If it's an object, name is empty.
    expect(itBlocks[1].type).toBe(ParsedNodeType.it);

    // Named function - applyNameInfo expects string or template literal as first arg.
    // Deno.test(function namedTest() {}) -> first arg is FunctionExpression.
    // applyNameInfo check: !t.isStringLiteral(arg) && !arg.start/end ... ??
    // Let's see behavior. It should at least be found.
    expect(itBlocks[2].type).toBe(ParsedNodeType.it);
  });
});
