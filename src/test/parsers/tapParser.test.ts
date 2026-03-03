import { parseTapOutput } from '../../parsers/tapParser';

describe('TAP Parser', () => {
  const filePath = '/path/to/test.js';

  describe('parseTapOutput', () => {
    it('should parse a simple passing test', () => {
      const output = `TAP version 14
# Subtest: should pass
ok 1 - should pass
1..1`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(1);
      expect(result.numPassedTests).toBe(1);
      expect(result.numFailedTests).toBe(0);
      expect(result.success).toBe(true);
      expect(result.testResults[0].assertionResults[0].status).toBe('passed');
      expect(result.testResults[0].assertionResults[0].title).toBe('should pass');
    });

    it('should parse a simple failing test', () => {
      const output = `TAP version 14
# Subtest: should fail
not ok 1 - should fail
---
error: AssertionError
message: Expected 1 to equal 2
...
1..1`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(1);
      expect(result.numPassedTests).toBe(0);
      expect(result.numFailedTests).toBe(1);
      expect(result.success).toBe(false);
      expect(result.testResults[0].assertionResults[0].status).toBe('failed');
      expect(result.testResults[0].assertionResults[0].failureMessages).toBeDefined();
    });

    it('should parse multiple tests', () => {
      const output = `TAP version 14
# Subtest: test one
ok 1 - test one
# Subtest: test two
ok 2 - test two
# Subtest: test three
not ok 3 - test three
1..3`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(3);
      expect(result.numPassedTests).toBe(2);
      expect(result.numFailedTests).toBe(1);
      expect(result.testResults[0].assertionResults).toHaveLength(3);
    });

    it('should parse nested subtests correctly', () => {
      const output = `TAP version 14
# Subtest: outer describe
    # Subtest: inner test
    ok 1 - inner test
    1..1
ok 1 - outer describe
1..1`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(1);
      expect(result.numPassedTests).toBe(1);
      const assertion = result.testResults[0].assertionResults[0];
      expect(assertion.title).toBe('inner test');
      expect(assertion.ancestorTitles).toContain('outer describe');
    });

    it('should parse deeply nested subtests', () => {
      const output = `TAP version 14
# Subtest: level 1
    # Subtest: level 2
        # Subtest: level 3 test
        ok 1 - level 3 test
        1..1
    ok 1 - level 2
    1..1
ok 1 - level 1
1..1`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(1);
      const assertion = result.testResults[0].assertionResults[0];
      expect(assertion.title).toBe('level 3 test');
      expect(assertion.ancestorTitles).toEqual(['level 1', 'level 2']);
    });

    it('should parse skip directive', () => {
      const output = `TAP version 14
# Subtest: skipped test
ok 1 - skipped test # SKIP not implemented yet
1..1`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(1);
      expect(result.numPendingTests).toBe(1);
      expect(result.numPassedTests).toBe(0);
      expect(result.testResults[0].assertionResults[0].status).toBe('skipped');
    });

    it('should parse todo directive', () => {
      const output = `TAP version 14
# Subtest: todo test
ok 1 - todo test # TODO implement later
1..1`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(1);
      expect(result.numPendingTests).toBe(1);
      expect(result.testResults[0].assertionResults[0].status).toBe('todo');
    });

    it('should parse YAML diagnostics with error details', () => {
      const output = `TAP version 14
# Subtest: failing test
not ok 1 - failing test
---
error: AssertionError
message: Values are not equal
stack: |-
  at Test.fn (test.js:10:5)
  at async Test.run (node:internal/test_runner/test:123:9)
duration_ms: 0.123
...
1..1`;

      const result = parseTapOutput(output, filePath);

      const assertion = result.testResults[0].assertionResults[0];
      expect(assertion.status).toBe('failed');
      expect(assertion.failureMessages).toBeDefined();
      expect(assertion.failureMessages!.length).toBeGreaterThan(0);
      expect(assertion.duration).toBe(0.123);
    });

    it('should parse YAML diagnostics with location info', () => {
      const output = `TAP version 14
# Subtest: test with location
not ok 1 - test with location
---
line: 42
column: 10
...
1..1`;

      const result = parseTapOutput(output, filePath);

      const assertion = result.testResults[0].assertionResults[0];
      expect(assertion.location).toBeDefined();
      expect(assertion.location!.line).toBe(42);
      expect(assertion.location!.column).toBe(10);
    });

    it('should handle empty output', () => {
      const output = '';

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(0);
      expect(result.success).toBe(true);
    });

    it('should handle output with only TAP version', () => {
      const output = `TAP version 14
1..0`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(0);
      expect(result.success).toBe(true);
    });

    it('should handle tests without Subtest comment', () => {
      const output = `TAP version 14
ok 1 - standalone test
1..1`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(1);
      expect(result.testResults[0].assertionResults[0].title).toBe('standalone test');
    });

    it('should properly set file result status based on test outcomes', () => {
      const passingOutput = `TAP version 14
# Subtest: passing
ok 1 - passing
1..1`;

      const passingResult = parseTapOutput(passingOutput, filePath);
      expect(passingResult.testResults[0].status).toBe('passed');
      expect(passingResult.numPassedTestSuites).toBe(1);
      expect(passingResult.numFailedTestSuites).toBe(0);

      const failingOutput = `TAP version 14
# Subtest: failing
not ok 1 - failing
1..1`;

      const failingResult = parseTapOutput(failingOutput, filePath);
      expect(failingResult.testResults[0].status).toBe('failed');
      expect(failingResult.numPassedTestSuites).toBe(0);
      expect(failingResult.numFailedTestSuites).toBe(1);
    });

    it('should build correct fullName for nested tests', () => {
      const output = `TAP version 14
# Subtest: describe block
    # Subtest: nested test
    ok 1 - nested test
    1..1
ok 1 - describe block
1..1`;

      const result = parseTapOutput(output, filePath);

      const assertion = result.testResults[0].assertionResults[0];
      expect(assertion.fullName).toBe('describe block nested test');
    });

    it('should handle multiple sibling describe blocks', () => {
      const output = `TAP version 14
# Subtest: describe A
    # Subtest: test A1
    ok 1 - test A1
    1..1
ok 1 - describe A
# Subtest: describe B
    # Subtest: test B1
    ok 2 - test B1
    1..1
ok 2 - describe B
1..2`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(2);
      expect(result.testResults[0].assertionResults[0].ancestorTitles).toEqual(['describe A']);
      expect(result.testResults[0].assertionResults[1].ancestorTitles).toEqual(['describe B']);
    });

    it('should preserve directive reason in skipped tests', () => {
      const output = `TAP version 14
# Subtest: skipped with reason
ok 1 - skipped with reason # SKIP this feature is not ready
1..1`;

      const result = parseTapOutput(output, filePath);

      expect(result.testResults[0].assertionResults[0].status).toBe('skipped');
    });

    it('should handle mixed pass/fail/skip results', () => {
      const output = `TAP version 14
# Subtest: passing
ok 1 - passing
# Subtest: failing
not ok 2 - failing
# Subtest: skipped
ok 3 - skipped # SKIP
# Subtest: todo
ok 4 - todo # TODO
1..4`;

      const result = parseTapOutput(output, filePath);

      expect(result.numTotalTests).toBe(4);
      expect(result.numPassedTests).toBe(1);
      expect(result.numFailedTests).toBe(1);
      expect(result.numPendingTests).toBe(2);
      expect(result.success).toBe(false);
    });
  });
});
