import { parse } from 'jest-editor-support';
import { findFullTestName } from './../src/util';
const path = require('path');
const children = parse(path.resolve(__dirname, 'test2.test.ts')).root.children;

it('should find line 1', () => {
  expect(findFullTestName(1, children)).toBe('testSuiteA');
});

it('should find line 2', () => {
  expect(findFullTestName(2, children)).toBe('testSuiteA test1()');
});

it('should find line 26', () => {
  expect(findFullTestName(26, children)).toBe('testSuiteB lol');
});

it('should find line 3', () => {
  expect(findFullTestName(4, children)).toBe('testSuiteA test1() should run this test');
});

it('should find line 13', () => {
  expect(findFullTestName(13, children)).toBe('testSuiteA test2 should run this test');
});

it('should find line 27', () => {
  expect(findFullTestName(27, children)).toBe('testSuiteB lol');
  expect(findFullTestName(28, children)).toBe('testSuiteB lol');
});

it('should find line 18', () => {
  expect(findFullTestName(18, children)).toBe('testSuiteA test2 test3 should run this test 3');
});
