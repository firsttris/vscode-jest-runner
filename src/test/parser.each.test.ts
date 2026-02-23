import { parse } from '../parser';

describe('parser - it.each expansion', () => {
  it('should expand it.each with 1D array', () => {
    const code = `
            it.each([1, 2, 3])('test %s', (n) => {
                expect(n).toBeTruthy();
            });
        `;
    const result = parse('test.ts', code);
    const children = result.root.children;
    expect(children).toBeDefined();
    // Should have 3 children
    expect(children!.length).toBe(3);
    // Verify names
    expect((children![0] as any).name).toBe('test 1');
    expect((children![1] as any).name).toBe('test 2');
    expect((children![2] as any).name).toBe('test 3');
  });

  it('should expand it.each with 2D array (table)', () => {
    const code = `
            it.each([
                [1, 2, 3],
                [2, 3, 5]
            ])('add %i + %i = %i', (a, b, expected) => {
                expect(a + b).toBe(expected);
            });
        `;
    const result = parse('test.ts', code);
    const children = result.root.children;
    expect(children!.length).toBe(2);
    expect((children![0] as any).name).toBe('add 1 + 2 = 3');
    expect((children![1] as any).name).toBe('add 2 + 3 = 5');
  });

  it('should expand it.each with object and $prop', () => {
    const code = `
            it.each([
                { a: 1, b: 2, expected: 3 },
                { a: 2, b: 3, expected: 5 }
            ])('add $a + $b = $expected', ({a, b, expected}) => {
                expect(a + b).toBe(expected);
            });
        `;
    const result = parse('test.ts', code);
    const children = result.root.children;
    expect(children!.length).toBe(2);
    expect((children![0] as any).name).toBe('add 1 + 2 = 3');
    expect((children![1] as any).name).toBe('add 2 + 3 = 5');
  });

  it('should handle %# index substitution', () => {
    const code = `
            it.each(['a', 'b'])('test %#: %s', (s) => {});
        `;
    const result = parse('test.ts', code);
    const children = result.root.children;
    expect(children!.length).toBe(2);
    expect((children![0] as any).name).toBe('test 0: a');
    expect((children![1] as any).name).toBe('test 1: b');
  });

  it('should expand it.each when table identifier is statically resolvable', () => {
    const code = `
            const cases = [1, 2, 3];
            it.each(cases)('test %s', (n) => {});
        `;
    const result = parse('test.ts', code);
    const children = result.root.children;
    expect(children!.length).toBe(3);
    expect((children![0] as any).name).toBe('test 1');
    expect((children![1] as any).name).toBe('test 2');
    expect((children![2] as any).name).toBe('test 3');
  });

  it('should fallback to single node for dynamic array', () => {
    const code = `
            const base = [1, 2, 3];
            const cases = base.map((n) => n);
            it.each(cases)('test %s', (n) => {});
        `;
    const result = parse('test.ts', code);
    const children = result.root.children;
    expect(children!.length).toBe(1);
    expect((children![0] as any).name).toBe('test %s');
  });

  it('should expand describe.each with identifier table and resolve nested template literals', () => {
    const code = `
                        const cases = [
                            { title: 'test 1', id: 42 },
                            { title: 'test 2', id: 99 }
                        ];

                        describe.each(cases)('xyz group by $title', (test_case) => {
                            it(\`should run correctly for id \${test_case.id}\`, () => {
                                expect(test_case.id).toBeGreaterThan(0);
                            });
                        });
                `;

    const result = parse('test.ts', code);
    const children = result.root.children;

    expect(children!.length).toBe(2);
    expect((children![0] as any).name).toBe('xyz group by test 1');
    expect((children![1] as any).name).toBe('xyz group by test 2');

    const firstTests = (children![0] as any).children;
    const secondTests = (children![1] as any).children;

    expect(firstTests.length).toBe(1);
    expect(secondTests.length).toBe(1);
    expect(firstTests[0].name).toBe('should run correctly for id 42');
    expect(secondTests[0].name).toBe('should run correctly for id 99');
  });

  it('should expand it.each with identifier object table and $placeholders', () => {
    const code = `
      describe("computeTierFromScore", () => {
        const basicContext = { isPrimary: true } as any
        const secondaryContext = { isPrimary: false } as any

        const cases = [
          { score: 0, primary: 0, secondary: 0 },
          { score: 12.25, primary: 0, secondary: 0 },
          { score: 12.5, primary: 1, secondary: 2 },
          { score: 27, primary: 2, secondary: 3 },
          { score: 47.5, primary: 3, secondary: 4 },
          { score: 69.75, primary: 3, secondary: 4 },
          { score: 70, primary: 4, secondary: 5 },
          { score: 90, primary: 5, secondary: 5 },
        ]

        it.each(cases)(
          "resolves tier for score $score -> primary $primary, secondary $secondary",
          ({ score, primary, secondary }) => {
            const primaryRes = computeTierFromScore({ score }, basicContext)
            const secondaryRes = computeTierFromScore({ score }, secondaryContext)

            expect(primaryRes?.value).toBe(primary)
            expect(secondaryRes?.value).toBe(secondary)
          },
        )
      })
    `;

    const result = parse('test.ts', code);
    const children = result.root.children;

    expect(children!.length).toBe(1);
    const describeNode = children![0] as any;
    expect(describeNode.name).toBe('computeTierFromScore');
    expect(describeNode.children.length).toBe(8);
    expect(describeNode.children[0].name).toBe(
      'resolves tier for score 0 -> primary 0, secondary 0',
    );
    expect(describeNode.children[7].name).toBe(
      'resolves tier for score 90 -> primary 5, secondary 5',
    );
  });
});
