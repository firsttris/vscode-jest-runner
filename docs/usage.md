# Running & Debugging Tests

Jest Runner offers the same actions through several entry points. Pick the one that fits how you work.

## CodeLens actions

Above every `describe`, `it` and `test` in a test file, Jest Runner shows inline actions. By default these are
**Run** and **Debug**. The setting `jestrunner.codeLens` chooses which actions appear:

| Option | Label | What it runs |
|---|---|---|
| `run` | Run | The test, with `-t "<full name>"` (or the framework's equivalent) in the terminal |
| `debug` | Debug | The same, as a VS Code debug session |
| `watch` | Run --watch | The test with `--watch`, so it re-runs on every save |
| `coverage` | Run --coverage | The test with `--coverage` |
| `current-test-coverage` | Run --collectCoverageFrom (target file/dir) | The test with coverage limited to the file under test: `foo.test.ts` collects from `**/foo.ts`, or from the folder when no such file exists |

```json title="settings.json"
"jestrunner.codeLens": ["run", "debug", "watch", "coverage"]
```

The action on a `describe` runs every test inside it: the name filter is extended with a suffix that also
matches the nested test names. A test with a dynamic name such as `it(MyClass.prototype.method.name, ...)`
becomes a filter for `method`.

### Parameterized tests

`it.each`, `test.each` and `describe.each` are expanded when the table is a literal in the file (or a variable
defined in the file). For a table with three rows you get one CodeLens with a menu: **Run All** plus one entry
per row, with `%s`, `%i`, `%d`, `%f`, `%j`, `%#`, `$name` and `$obj.prop` already substituted. A test whose table
cannot be resolved statically still gets a single **Run** that matches all rows with a wildcard.

```typescript
it.each([
  ['apple', 5],
  ['banana', 6],
])('returns the length of %s', (fruit, length) => {
  expect(fruit.length).toBe(length);
});
```

Set `"jestrunner.enableCodeLens": false` to hide the actions when you only use the Test Explorer.

## Test Explorer

With `"jestrunner.enableTestExplorer": true` the **Testing** view shows a tree: workspace folder, folders,
files, `describe` blocks and tests. Each node has run, debug and coverage buttons; failures show their message at
the failing line in the editor, and a file that fails to even load (an import error) shows the error on all of
its tests instead of leaving them silently skipped.

Profiles in the view:

| Profile | What it does |
|---|---|
| **Run** | Runs the selected tests in the background and reports pass, fail, skip and duration per test |
| **Debug** | Starts a debug session for the first selected test (or file) |
| **Coverage** | Runs with coverage and feeds the result into the VS Code coverage view and the editor gutter |
| **Update Snapshots** | Runs with `-u` |

The tree is kept up to date: saving a test file re-parses it, creating or deleting a file adds or removes it,
and a change to any `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `rstest.config.*`, `deno.json`
or `bun.lock` (or to a `jestrunner.*` setting) re-discovers the whole workspace.

!!! info "Several frameworks in one run"
    A run may contain Vitest files from one package and Jest files from another. Jest Runner groups the files by
    framework, working directory and config, and starts one process per group. Partially selected files (some
    tests of a file) and fully selected files are run in separate processes, so a name filter never hides tests
    of a fully selected file.

## Context menus and commands

**Editor context menu** (right-click inside a test file): **Run Jest** and **Debug Jest** run the test at the
cursor. If you select text first, the selection is used as the test name.

**Explorer context menu** (right-click a file or folder): **Run Jest on Path** and **Debug Jest on Path** run
everything below that path.

**Command Palette** (++ctrl+shift+p++ / ++cmd+shift+p++):

| Command | ID | Description |
|---|---|---|
| Run Jest | `extension.runJest` | Test at the cursor |
| Debug Jest | `extension.debugJest` | Test at the cursor, in the debugger |
| Run Jest on File | `extension.runJestFile` | Whole file |
| Run Jest File in Watch Mode | `extension.runJestFileWithWatchMode` | Whole file with `--watch` |
| Run Jest File and generate Coverage | `extension.runJestFileWithCoverage` | Whole file with `--coverage` |
| Run Jest --watch | `extension.watchJest` | Test at the cursor with `--watch` |
| Run Jest and generate Coverage | `extension.runJestCoverage` | Test at the cursor with `--coverage` |
| Run Jest and update Snapshots | `extension.runJestAndUpdateSnapshots` | Test at the cursor with `-u` |
| Run Jest - Run Previous Test | `extension.runPrevJest` | Repeats the last terminal or debug run |
| Run Jest on Path | `extension.runJestPath` | A path (used by the explorer menu) |
| Debug Jest on Path | `extension.debugJestPath` | A path, in the debugger |

The commands keep their historic `Jest` names, but each one works for every supported framework: the framework
of the current file decides which binary runs.

## Keyboard shortcuts

Jest Runner ships without default keybindings. Open **Preferences: Open Keyboard Shortcuts (JSON)** and add,
for example:

```json title="keybindings.json"
{ "key": "alt+1", "command": "extension.runJest" },
{ "key": "alt+2", "command": "extension.debugJest" },
{ "key": "alt+3", "command": "extension.watchJest" },
{ "key": "alt+4", "command": "extension.runPrevJest" }
```

## Watch mode

**Run --watch** (CodeLens) or **Run Jest --watch** (command) passes `--watch` to Jest or Vitest, and the
terminal stays open re-running the test on each save. For Vitest the `run` sub-command is left out so that
Vitest's own watch mode takes over. Other frameworks receive `--watch` verbatim.

## Snapshots

**Run Jest and update Snapshots** adds `-u` to the run of the test at the cursor; the **Update Snapshots**
profile of the Test Explorer does the same for any selection.

## Coverage

Coverage has three entry points that all end in the same place, the VS Code coverage view:

- the **Coverage** profile in the Test Explorer (the shield icon),
- the `coverage` and `current-test-coverage` CodeLens actions,
- the commands **Run Jest and generate Coverage** and **Run Jest File and generate Coverage**.

The CodeLens and command variants only pass `--coverage` to the terminal; the framework writes its usual
report. The Test Explorer profile additionally reads the report back and shows it inline.

What each framework needs for the inline view:

| Framework | Prerequisite | Report that is read |
|---|---|---|
| Jest | none | `coverage-final.json` in `coverageDirectory` (JSON reporter is added to the run) |
| Vitest | `@vitest/coverage-v8` or `@vitest/coverage-istanbul` installed and `coverage.provider` set | `coverage-final.json` in `reportsDirectory` (JSON reporter is added, also on failure) |
| Rstest | none | `coverage-final.json` in `reportsDirectory` |
| Node.js | none, `--experimental-test-coverage` is added | `lcov.info` written by the `lcov` reporter |
| Bun | none, `bun test --coverage --coverage-reporter=lcov` | `coverage/lcov.info` |
| Deno | none | `deno coverage --lcov`, converted after the run |
| Playwright | not supported | — |

The report directory is read from the config file when set, otherwise `coverage/` next to the config or in the
workspace folder. Test files and `node_modules` are left out of the view. See [Coverage](internals/coverage.md)
for the mechanics.

## Where the output goes

Terminal runs (CodeLens, context menu, commands) show the full output of the test runner in a terminal named
`jest` or `vitest`. The terminal is reused as long as the framework, working directory and environment stay the
same. With `"jestrunner.preserveEditorFocus": true` the terminal opens without stealing focus.

Test Explorer runs show the runner output in the **Test Results** panel. Diagnostics from Jest Runner itself,
such as which config was parsed or which command was started, go to the **Jest Runner** output channel; set
`"jestrunner.enableDebugLogs": true` for the verbose version.
