const findLine = require('./parse');

const { parse } = require('jest-editor-support');
const children = parse('./test2.js').root.children;

it('should find line 1', () => {
    expect(findLine(1, children)).toBe('testSuiteA');
});

it('should find line 2', () => {
    expect(findLine(2, children)).toBe('testSuiteA test1');
});

it('should find line 26', () => {
    expect(findLine(26, children)).toBe('testSuiteB');
});

it('should find line 13', () => {
    expect(findLine(13, children)).toBe('testSuiteA test2 should run this test');
});

it('should find line 27', () => {
    expect(findLine(27, children)).toBe('testSuiteB lol');
});

it('should find line 18', () => {
    expect(findLine(18, children)).toBe('testSuiteA test2 test3 should run this test 3');
});