# Reporters & Result Matching

A Test Explorer run has to end with a state for every test item: passed, failed (with a message and a
location), skipped or errored. This page explains how the runner's output becomes those states: the
reporters Jest Runner injects, the framing protocol they use, the fallback parsers, the common result shape
and the matching of results to items.

## The common shape: `JestResults`

Every path ends in the same structure (`src/testResultTypes.ts`), modelled on Jest's `--json` output:

```typescript
interface JestResults {
  success: boolean;
  numTotalTests, numPassedTests, numFailedTests, numPendingTests: number;
  numTotalTestSuites, numPassedTestSuites, numFailedTestSuites, numPendingTestSuites: number;
  testResults: Array<{
    name: string;                 // the test file (absolute, or relative for some JUnit reports)
    status: string;               // 'passed' | 'failed'
    message: string;              // file-level error, e.g. an import error
    assertionResults: Array<{
      ancestorTitles: string[];   // describe names, outermost first
      title: string;              // the test's own name
      fullName?: string;          // ancestors + title joined with spaces
      status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';
      duration?: number;
      failureMessages?: string[];
      location?: { line: number; column: number } | null;
    }>;
  }>;
}
```

Because all parsers produce it, `testResultProcessor` and `TestMatcher` are framework-agnostic.

## Injected reporters

`src/reporters/` holds three reporter templates as plain JavaScript. They are bundled into the extension as
strings (Vite `?raw` import) and written once per session to `<tmp>/vscode-jest-runner-reporters/` by
`getReporterPaths()` (`reporterPaths.ts`):

| File | Framework API | Passed as |
|---|---|---|
| `jest-reporter.cjs` | Jest reporter class, `onRunComplete(contexts, results)` | `--reporters default --reporters <path>` |
| `vitest-reporter.cjs` | Vitest reporter object, `onTestRunEnd(testModules)` (Vitest 4+) or `onFinished(files)` (older) | `--reporter=default --reporter=<path>` |
| `node-reporter.mjs` | `node:test` async generator reporter over `test:pass` / `test:fail` / `test:skip` / `test:todo` events | `--test-reporter <path> --test-reporter-destination stdout` |

Each maps the framework's own result objects to `JestResults` (the Jest reporter uses `testFilePath`, marks a
suite with a `testExecError` as failed; the Vitest reporter walks the task tree and collects file-level
`errors`; the Node reporter extracts `Expected` / `Received` from assertion errors) and then **emits one
framed message** to stdout.

On Windows the Node reporter path is passed as a `file://` URL, because `--test-reporter` takes a module
specifier.

## The framing protocol (`reporting/structuredOutput.ts`)

```
@@JTR_START::<sessionId>::<type>::<length>::<json>@@JTR_END::<sessionId>::<type>
```

- `sessionId` is the `JSTR_SESSION_ID` environment variable the executor sets per run (a UUID), so output of
  another run, a stale reporter or a nested runner is ignored.
- `type` is `results`.
- `length` is the JSON's length in UTF-16 code units, so the parser can slice the payload without scanning
  for the end marker through arbitrary JSON content.

`extractStructuredMessages(buffer, sessionId)` is the incremental parser used on every stdout chunk. It
finds `@@JTR_START::`, validates the header with a sticky regex, checks the length and the matching end
marker, parses the JSON and returns the messages plus the **unconsumed tail**: the start of an incomplete
message, or just enough characters to complete a start marker that was split across chunks. Anything that
looks like a marker but does not validate is skipped as noise. `parseStructuredResults(output, sessionId)` is
the one-shot variant for a complete output.

## Fallback parsers (`src/parsers/`)

When no structured block arrived (framework without reporter API, reporter failed to load, output
suppressed), `processTestResults(output, tests, run, framework, sessionId)` chooses by framework:

| Framework | Parser | Source |
|---|---|---|
| node-test | `tapParser.parseTapOutput` | TAP output: `# Subtest:` nesting, `ok`/`not ok` lines, `# SKIP`/`# TODO` directives, YAML diagnostics with `error`, `expected`, `actual`, `location` |
| vitest | `OutputParser.parseVitestOutput` | the `--reporter=json` output, already in the Jest shape (Vitest mimics it) |
| bun, deno, rstest | `junitParser.parseJUnitXML` | JUnit XML (Bun and Deno write a file that the executor appended to the output): `<testcase name file/classname>`, `<failure>`, `<skipped>`; names containing `>` are split into ancestors and title |
| jest and anything else | `OutputParser.parseJestOutput` | the `--json` output, found by brace matching from `{"numFailedTestSuites"`, `{"testResults"` or `{"numTotalTestSuites"` even when logs surround it |

If none yields a result, `processTestResultsFallback` scans the text for pass and fail indicators (`PASS`,
`✓`, `FAIL`, `●`, `AssertionError`, ...) and marks tests accordingly, or errors them with a hint to run from
the terminal.

## Applying results to test items (`testResultProcessor.ts`)

`processTestResultsFromParsed(results, tests, run)`:

1. All assertion results are flattened and indexed, each with its file name.
2. **File scoping**: candidates for a test are the results of the test's own file. Paths are compared
   normalized, case-insensitively on Windows and, when they still differ, with symlinks resolved
   (`realpathSync.native`), so `/var/...` and `/private/var/...` on macOS are the same file. Relative result
   paths (some JUnit reports) match by suffix. A file with no results of its own may use **unattributed**
   results (no or unknown file name, as with TAP), but never another requested file's results.
3. For every test item, `findPotentialMatchesIn(candidates, test)` from `matchers/TestMatcher.ts` returns the
   results that may belong to it (see below).
4. No match: if the file as a whole failed without running tests (import error), the test is marked failed with
   that message; otherwise skipped.
5. Several matches for a template label (`%s`, `$name`): all are aggregated with `reportTemplateTestResult`:
   failed if any failed, the durations summed, the failure messages concatenated with their titles.
6. Otherwise `findBestMatch` prefers an unused result on the same line, then any unused result, and marks the
   index used so two tests with the same name consume different results.
7. `reportTestResult` calls `run.passed(test, duration)`, `run.failed(test, message, duration)` with the
   message located at the reported line, or `run.skipped(test)`.

## Matching rules (`matchers/TestMatcher.ts`)

A result `r` matches a test item `t` (`matchesTest`) when any of these holds:

- `r.title === t.label`, or `t.label` with template variables (`%s`, `$x`, `${x}`) turned into `(.*?)` matches
  `r.title`,
- `r.title` or the full path `ancestors + title` equals `t.label` plus a ` (n)` retry suffix,
- `r.fullName === t.label`,
- the full path matches the templated label.

Then `preferSameAncestors` keeps the matches whose `ancestorTitles` equal the item's ancestor labels (the
parent items up to the file), or at least end with them, so a test named `works` in `describe('a')` does not
take the result of `works` in `describe('b')`.

When nothing matches exactly, `matchesShortName` tries the last word of the label against the title, a loose
fallback for labels that were cleaned (`Foo.prototype.bar.name` → `bar`), never for labels that are only a
template variable.

A label that is only a template variable (`it('%s', ...)`) matches by ancestors alone.

## Fast mode

A single test without coverage skips all of this: `executeTestCommandFast` reports `passed` on exit code 0,
`failed` with the stripped stderr or stdout otherwise, and `skipped` on cancel. The command has no reporter.
