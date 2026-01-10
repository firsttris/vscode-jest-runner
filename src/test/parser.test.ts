import { parse, ParsedNode } from '../parser';
import * as path from 'path';

describe('parser', () => {
  describe('parse', () => {
    it('should parse a simple test file', () => {
      const testCode = `
        describe('My Test Suite', () => {
          it('should work', () => {
            expect(true).toBe(true);
          });
        });
      `;
      const result = parse('test.ts', testCode);
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
      expect(result.root.children).toBeDefined();
    });

    it('should parse nested describe blocks', () => {
      const testCode = `
        describe('Outer Suite', () => {
          describe('Inner Suite', () => {
            it('should work', () => {
              expect(true).toBe(true);
            });
          });
        });
      `;
      const result = parse('test.ts', testCode);
      expect(result.root.children.length).toBeGreaterThan(0);
    });

    it('should handle multiple test types (it, test)', () => {
      const testCode = `
        describe('My Suite', () => {
          it('test with it', () => {});
          test('test with test', () => {});
        });
      `;
      const result = parse('test.ts', testCode);
      expect(result.root.children.length).toBeGreaterThan(0);
    });

    it('should handle test.each', () => {
      const testCode = `
        test.each([
          [1, 2, 3],
          [2, 3, 5],
        ])('should add %i + %i = %i', (a, b, expected) => {
          expect(a + b).toBe(expected);
        });
      `;
      const result = parse('test.ts', testCode);
      expect(result.root.children.length).toBeGreaterThan(0);
    });

    it('should parse file path without content', () => {
      const filePath = path.join(__dirname, '../../examples/examples.test.ts');
      const result = parse(filePath);
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
    });

    it('should handle empty file', () => {
      const testCode = `describe('empty', () => {});`;
      const result = parse('empty.test.ts', testCode);
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
    });

    it('should handle files without tests', () => {
      const testCode = `
        const myFunction = () => {
          return true;
        };
      `;
      const result = parse('notest.ts', testCode);
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
    });
  });
});
