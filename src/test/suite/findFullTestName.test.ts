import { parse } from '../../parser';
import * as path from 'path';
import { findFullTestName } from '../../util';

const children = parse(path.resolve('./src/test/suite/test2.test.ts')).root.children;

it('should find line 1', () => {
  expect(findFullTestName(1, children)).toBe('testSuiteA');
});

it('should find line 2', () => {
  expect(findFullTestName(2, children)).toBe('testSuiteA test1()');
});

it('should find line 4', () => {
  expect(findFullTestName(4, children)).toBe('testSuiteA test1() should run this test');
});

it('should find line 13', () => {
  expect(findFullTestName(13, children)).toBe('testSuiteA test2 should run this test');
});

it('should find line 17', () => {
  expect(findFullTestName(17, children)).toBe('testSuiteA test2 test3');
});

it('should find line 18', () => {
  expect(findFullTestName(18, children)).toBe('testSuiteA test2 test3 should run this test 3');
});

it('should find line 37', () => {
  expect(findFullTestName(35, children)).toBe('(.*?) + (.*?) returned value not be less than (.*?)');
});

it('should find line 42', () => {
  expect(findFullTestName(42, children)).toBe('returns (.*?) when (.*?) is added (.*?)');
});

it('should find line 50', () => {
  expect(findFullTestName(50, children)).toBe('.add((.*?), (.*?)) returns (.*?)');
});
