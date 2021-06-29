import * as path from 'path';
import { parse, findTestCode } from '../../playwright-editor-support';

const testcodes = parse(path.resolve('./src/test/suite/test2.test.ts'));

it('should find line 1', () => {
  expect(findTestCode(testcodes, 1).fullname).toBe('testSuiteA');
});

it('should find line 2', () => {
  expect(findTestCode(testcodes, 2).fullname).toBe('testSuiteA test1()');
});

it('should find line 4 hoge', () => {
  expect(findTestCode(testcodes, 4).fullname).toBe('testSuiteA test1() should run this test');
});

it('should find line 13', () => {
  expect(findTestCode(testcodes, 13).fullname).toBe('testSuiteA test2 should run this test');
});

it('should find line 17', () => {
  expect(findTestCode(testcodes, 17).fullname).toBe('testSuiteA test2 test3');
});

it('should find line 18', () => {
  expect(findTestCode(testcodes, 18).fullname).toBe('testSuiteA test2 test3 should run this test 3');
});

it('should find line 37', () => {
  expect(findTestCode(testcodes, 35).fullname).toBe('$a + $b returned value not be less than ${i}');
});

it('should find line 42', () => {
  expect(findTestCode(testcodes, 42).fullname).toBe('returns $expected when $a is added $b');
});

it('should find line 50', () => {
  expect(findTestCode(testcodes, 50).fullname).toBe('.add(%i, %i) returns ${i}');
});

/*
it('should find line 37', () => {
  expect(findTestCode(testcodes, 35).fullname).toBe('(.*?) + (.*?) returned value not be less than (.*?)');
});

it('should find line 42', () => {
  expect(findTestCode(testcodes, 42).fullname).toBe('returns (.*?) when (.*?) is added (.*?)');
});

it('should find line 50', () => {
  expect(findTestCode(testcodes, 50).fullname).toBe('.add((.*?), (.*?)) returns (.*?)');
});
*/
