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

    it('should fallback to single node for dynamic array', () => {
        const code = `
            const cases = [1, 2, 3];
            it.each(cases)('test %s', (n) => {});
        `;
        const result = parse('test.ts', code);
        const children = result.root.children;
        expect(children!.length).toBe(1);
        expect((children![0] as any).name).toBe('test %s');
    });
});
