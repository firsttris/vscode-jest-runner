import { parseJUnitXML } from '../../parsers/junitParser';

describe('JUnit Parser', () => {
  it('should parse Bun JUnit output', () => {
    const output = `bun test v1.3.5 (1e86cebd)

bun.test.ts:
✓ math > check add
✓ math > check subtract

 2 pass 
 1 filtered out
 0 fail
 2 expect() calls
Ran 2 tests across 1 file. [8.00ms]
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" assertions="2" failures="0" skipped="1" time="0.008978762">
  <testsuite name="bun.test.ts" file="bun.test.ts" tests="3" assertions="2" failures="0" skipped="1" time="0" hostname="zentrale">
    <testsuite name="math" file="bun.test.ts" line="4" tests="3" assertions="2" failures="0" skipped="1" time="0" hostname="zentrale">
      <testcase name="check add" classname="math" time="0" file="bun.test.ts" line="5" assertions="1" />
      <testcase name="check subtract" classname="math" time="0" file="bun.test.ts" line="8" assertions="1" />
      <testcase name="check multiply" classname="math" time="0" file="bun.test.ts" line="11" assertions="0">
        <skipped />
      </testcase>
    </testsuite>
  </testsuite>
</testsuites>`;

    const results = parseJUnitXML(output);

    expect(results).toBeDefined();
    expect(results?.success).toBe(true);
    expect(results?.numTotalTests).toBe(3);
    expect(results?.numPassedTests).toBe(2);
    expect(results?.numPendingTests).toBe(1);
    expect(results?.testResults.length).toBeDefined();
    expect(results?.testResults[0].assertionResults.length).toBe(3);
    expect(results?.testResults[0].assertionResults[0].title).toBe('check add');
    expect(results?.testResults[0].assertionResults[0].status).toBe('passed');
  });

  it('should return undefined if no XML found', () => {
    const output = 'some random output';
    const results = parseJUnitXML(output);
    expect(results).toBeUndefined();
  });

  it('should split rstest hierarchical testcase names into ancestors and title', () => {
    const output = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="rstest tests" tests="2" failures="0" errors="0" skipped="0" time="0.5" timestamp="2026-03-02T12:54:43.631Z">
  <testsuite name="app/cloud/queues/hard-delete-files.test.ts" tests="2" failures="0" errors="0" skipped="0" time="0.5" timestamp="2026-03-02T12:54:43.631Z">
    <testcase name="hardDeleteFilesQuery &gt; löscht einzelne Datei erfolgreich" classname="app/cloud/queues/hard-delete-files.test.ts" time="0.2"></testcase>
    <testcase name="hardDeleteFilesQuery &gt; löscht mehrere Dateien erfolgreich" classname="app/cloud/queues/hard-delete-files.test.ts" time="0.3"></testcase>
  </testsuite>
</testsuites>`;

    const results = parseJUnitXML(output);

    expect(results).toBeDefined();
    expect(results?.numTotalTests).toBe(2);
    expect(results?.testResults[0].name).toBe(
      'app/cloud/queues/hard-delete-files.test.ts',
    );
    expect(results?.testResults[0].assertionResults[0].title).toBe(
      'löscht einzelne Datei erfolgreich',
    );
    expect(results?.testResults[0].assertionResults[0].ancestorTitles).toEqual([
      'hardDeleteFilesQuery',
    ]);
  });
});
