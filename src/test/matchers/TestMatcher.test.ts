import * as vscode from 'vscode';
import { findPotentialMatches, findBestMatch, hasTemplateVariable, IndexedResult } from '../../matchers/TestMatcher';
import { JestAssertionResult } from '../../testResultTypes';

jest.mock('vscode');

describe('TestMatcher', () => {
  describe('hasTemplateVariable', () => {
    it('should return true for $variable', () => {
      expect(hasTemplateVariable('test $foo')).toBe(true);
    });

    it('should return true for ${variable}', () => {
      expect(hasTemplateVariable('test ${bar}')).toBe(true);
    });

    it('should return true for %s format', () => {
      expect(hasTemplateVariable('test %s')).toBe(true);
    });

    it('should return true for %d format', () => {
      expect(hasTemplateVariable('test %d')).toBe(true);
    });

    it('should return true for %p format', () => {
      expect(hasTemplateVariable('test %p')).toBe(true);
    });

    it('should return true for %i format', () => {
      expect(hasTemplateVariable('test %i')).toBe(true);
    });

    it('should return true for %f format', () => {
      expect(hasTemplateVariable('test %f')).toBe(true);
    });

    it('should return true for %j format', () => {
      expect(hasTemplateVariable('test %j')).toBe(true);
    });

    it('should return true for %o format', () => {
      expect(hasTemplateVariable('test %o')).toBe(true);
    });

    it('should return true for %# format', () => {
      expect(hasTemplateVariable('test %#')).toBe(true);
    });

    it('should return true for %% format', () => {
      expect(hasTemplateVariable('test %%')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(hasTemplateVariable('plain test name')).toBe(false);
    });

    it('should return false for percent without format specifier', () => {
      expect(hasTemplateVariable('test 50%')).toBe(false);
    });
  });

  describe('findPotentialMatches', () => {
    const createTestItem = (id: string, label: string, parentLabel?: string): vscode.TestItem => {
      const parent = parentLabel ? {
        id: 'parent',
        label: parentLabel,
        uri: { fsPath: '/test.ts' } as vscode.Uri,
        parent: undefined,
      } as vscode.TestItem : undefined;

      return {
        id,
        label,
        uri: { fsPath: '/test.ts' } as vscode.Uri,
        parent,
        children: { size: 0 } as any,
      } as vscode.TestItem;
    };

    const createResult = (title: string, ancestorTitles: string[] = [], line?: number): JestAssertionResult => ({
      title,
      ancestorTitles,
      status: 'passed',
      fullName: ancestorTitles.concat(title).join(' '),
      location: line ? { line, column: 0 } : undefined,
    });

    it('should match exact test name', () => {
      const results: JestAssertionResult[] = [
        createResult('should work'),
        createResult('should fail'),
      ];
      const test = createTestItem('test1', 'should work');

      const matches = findPotentialMatches(results, test);

      expect(matches).toHaveLength(1);
      expect(matches[0].result.title).toBe('should work');
    });

    it('should match test with template variable $var', () => {
      const results: JestAssertionResult[] = [
        createResult('adds 1 + 2 to equal 3'),
        createResult('adds 2 + 3 to equal 5'),
      ];
      const test = createTestItem('test1', 'adds $a + $b to equal $expected');

      const matches = findPotentialMatches(results, test);

      expect(matches).toHaveLength(2);
    });

    it('should match test with %s format', () => {
      const results: JestAssertionResult[] = [
        createResult('handles foo correctly'),
        createResult('handles bar correctly'),
      ];
      const test = createTestItem('test1', 'handles %s correctly');

      const matches = findPotentialMatches(results, test);

      expect(matches).toHaveLength(2);
    });

    it('should match by fullName', () => {
      const results: JestAssertionResult[] = [
        createResult('test', ['describe', 'nested']),
      ];
      const test = createTestItem('test1', 'describe nested test');

      const matches = findPotentialMatches(results, test);

      expect(matches).toHaveLength(1);
    });

    it('should match test with numbered suffix like (1)', () => {
      const results: JestAssertionResult[] = [
        createResult('my test (1)'),
        createResult('my test (2)'),
      ];
      const test = createTestItem('test1', 'my test');

      const matches = findPotentialMatches(results, test);

      expect(matches).toHaveLength(2);
    });

    it('should handle regex special characters in test label', () => {
      const results: JestAssertionResult[] = [
        createResult('test [with] special (chars)'),
      ];
      const test = createTestItem('test1', 'test [with] special (chars)');

      const matches = findPotentialMatches(results, test);

      expect(matches).toHaveLength(1);
    });

    it('should match template-only label by ancestors', () => {
      const test = createTestItem('test1', '$description', 'MyClass');

      const results: JestAssertionResult[] = [
        createResult('test case 1', ['MyClass']),
        createResult('test case 2', ['OtherClass']),
      ];

      const matches = findPotentialMatches(results, test);

      expect(matches).toHaveLength(1);
      expect(matches[0].result.title).toBe('test case 1');
    });

    it('should not match when ancestors do not match for template-only labels', () => {
      const test = createTestItem('test1', '%s', 'MyClass');

      const results: JestAssertionResult[] = [
        createResult('test case', ['DifferentClass']),
      ];

      const matches = findPotentialMatches(results, test);

      expect(matches).toHaveLength(0);
    });
  });

  describe('findBestMatch', () => {
    const createIndexedResult = (title: string, index: number, line?: number): IndexedResult => ({
      result: {
        title,
        ancestorTitles: [],
        status: 'passed',
        fullName: title,
        location: line ? { line, column: 0 } : undefined,
      },
      index,
    });

    it('should prefer match at same line', () => {
      const matches: IndexedResult[] = [
        createIndexedResult('test1', 0, 10),
        createIndexedResult('test2', 1, 5),
      ];
      const usedIndices = new Set<number>();

      const best = findBestMatch(matches, 4, usedIndices); // line 4 (0-indexed) = line 5 in result

      expect(best?.result.title).toBe('test2');
    });

    it('should skip used indices', () => {
      const matches: IndexedResult[] = [
        createIndexedResult('test1', 0),
        createIndexedResult('test2', 1),
      ];
      const usedIndices = new Set<number>([0]);

      const best = findBestMatch(matches, undefined, usedIndices);

      expect(best?.result.title).toBe('test2');
    });

    it('should return first unused if no line match', () => {
      const matches: IndexedResult[] = [
        createIndexedResult('test1', 0, 100),
        createIndexedResult('test2', 1, 200),
      ];
      const usedIndices = new Set<number>();

      const best = findBestMatch(matches, 5, usedIndices);

      expect(best?.result.title).toBe('test1');
    });

    it('should return undefined if all matches are used', () => {
      const matches: IndexedResult[] = [
        createIndexedResult('test1', 0),
      ];
      const usedIndices = new Set<number>([0]);

      const best = findBestMatch(matches, undefined, usedIndices);

      expect(best).toBeUndefined();
    });

    it('should return undefined for empty matches', () => {
      const matches: IndexedResult[] = [];
      const usedIndices = new Set<number>();

      const best = findBestMatch(matches, undefined, usedIndices);

      expect(best).toBeUndefined();
    });
  });
});
