# Coverage

The Test Explorer's **Coverage** profile shows statement, branch and function coverage in the editor gutter
and the coverage view. Jest Runner does not instrument anything itself: it asks the framework for its usual
report, reads the report file and converts it to the VS Code coverage API. The code is
`src/coverageProvider.ts` with `src/parsers/lcov-parser.ts`.

## Two report formats

| Format | Frameworks | File | Produced by |
|---|---|---|---|
| Istanbul JSON (`coverage-final.json`) | Jest, Vitest, Rstest | `<coverage dir>/coverage-final.json` | `--coverageReporters=json` (Jest), `--coverage.reporter json --coverage.reportOnFailure` (Vitest), `--coverage` (Rstest) |
| LCOV (`lcov.info`) | Node.js, Bun, Deno | `lcov.info` or `coverage/lcov.info` | the `lcov` test reporter (Node.js), `--coverage-reporter=lcov` (Bun), `deno coverage coverage --lcov > lcov.info` run by the executor (Deno) |

Playwright has no coverage support here.

## Finding the report

`readCoverageFromFile(workspaceFolder, framework, configPath?, testFilePath?)`:

- **JSON frameworks**: the coverage directory is, in order, `coverageDirectory` / `coverage.reportsDirectory`
  parsed from the config passed to the run (`parseCoverageDirectory`, relative to `rootDir` / `root` and the
  config's directory), the same from any config file of the framework in the workspace folder, else
  `coverage/` next to the config or in the workspace folder. The file must exist and not be empty (`{}`), or a
  hint is logged (`Make sure you have ... configured with JSON reporter`).
- **LCOV frameworks**: `findLcovRecursively` starts at the test file's directory (else the config's, else the
  workspace folder) and walks up to the workspace folder, checking `lcov.info` and `coverage/lcov.info` in
  each directory. Relative file names in the report are resolved against the report's directory.

For Bun, the executor deletes a stale `coverage/lcov.info` before the run, so an old report is never shown
when the new run fails to write one.

## Converting

Istanbul JSON is already the internal `CoverageMap` shape (`statementMap`, `fnMap`, `branchMap` with their
hit counts `s`, `f`, `b`). LCOV is converted by `processLcovRecord` into the same shape: each `DA` line becomes
a statement spanning that line, each `FN`/`FNDA` a function, and the `BRDA` entries of one line one branch
group with one location per branch.

`convertToVSCodeCoverage(map)` then creates a `DetailedFileCoverage` per file, a subclass of
`vscode.FileCoverage` that carries the raw data, with summary counts: statements covered / total, branches
(all branch hits flattened), declarations (functions). Files under `node_modules` and files that match the
test patterns (`matchesTestFilePattern`) are left out, so the view shows the code under test only.

`run.addCoverage(fileCoverage)` hands the summaries to VS Code. When the user expands a file, the profile's
`loadDetailedCoverage` callback (wired in `TestController`) calls `CoverageProvider.loadDetailedCoverage`,
which builds the per-range details:

- `vscode.StatementCoverage(count, range)` for every statement,
- `vscode.DeclarationCoverage(name, count, range)` for every function,
- `vscode.StatementCoverage(max count, range, branches[])` with one `vscode.BranchCoverage` per branch
  location for every branch group.

Lines and columns are converted from Istanbul's 1-based lines to VS Code's 0-based positions.

## Where the Test Explorer calls it

`TestRunExecutor.runStandardMode` → `processCoverageData(run, workspaceFolder, framework, configPath,
firstFile)` after the test results, in a `finally`, so a failed result parse does not lose the coverage.
Fast mode is never used with coverage (`canUseFastMode` returns false), because the report must be read
after the run.

## Terminal coverage

The `coverage` and `current-test-coverage` CodeLens actions and the two coverage commands only add
`--coverage` (and `--collectCoverageFrom`) to the terminal command. The framework prints its text summary and
writes its configured reporters; nothing is read back.
