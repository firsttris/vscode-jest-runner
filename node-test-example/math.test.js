import { describe, it } from 'node:test';
import assert from 'node:assert';
import { add, subtract, multiply, divide } from './math.js';

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

  describe('multiply', () => {
    it('should multiply two numbers', () => {
      assert.strictEqual(multiply(4, 3), 12);
    });
  });

  describe('divide', () => {
    it('should divide two numbers', () => {
      assert.strictEqual(divide(10, 2), 5);
    });

    it('should throw error on division by zero', () => {
      assert.throws(() => divide(10, 0), {
        message: 'Division by zero'
      });
    });
  });
});
