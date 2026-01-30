
import { parseNodeTestFile } from '../../parsers/nodeTestParser';
import * as path from 'path';
import * as fs from 'fs';

// Mock fs.readFileSync
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    readFileSync: jest.fn()
}));

describe('Node Test Parser', () => {
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

        // Check 'add' describe
        const addDescribe = mainDescribe.children[0];
        expect(addDescribe.name).toBe('add');
        expect(addDescribe.children).toHaveLength(2);
        expect(addDescribe.children[0].name).toBe('should add two positive numbers');
        expect(addDescribe.children[1].name).toBe('should add negative numbers');

        // Check 'subtract' describe
        const subtractDescribe = mainDescribe.children[1];
        expect(subtractDescribe.name).toBe('subtract');
        expect(subtractDescribe.children).toHaveLength(1);
        expect(subtractDescribe.children[0].name).toBe('should subtract two numbers');
    });
});
