# Supported Test Frameworks

Jest Runner supports seven test runners. For each one it has to answer the same questions: *Is this file a
test of yours? Which command runs it? How do I filter by test name? How do I read the results, the coverage,
and how do I debug it?* This page lists the answers per framework. How the answers are found is explained in
[Test Detection](internals/test-detection.md) and [Command Building & Execution](internals/execution.md).

## At a glance

| | Jest | Vitest | Playwright | Rstest | Bun | Deno | Node.js |
|---|---|---|---|---|---|---|---|
| Run (terminal) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Run (Test Explorer) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Debug | ✅ | ✅ | ✅ | ✅ | ✅ ¹ | ✅ | ✅ |
| Coverage in the editor | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Test name filter | `-t` | `-t` | `-g` | `-t` | `-t` | `--filter` | `--test-name-pattern` |
| Default command | `node <jest.js>` ² | `node <vitest.mjs>` ² | `npx playwright` | `node <rstest.js>` ² | `bun` | `deno` | `node` |
| Config file read | `jest.config.*`, `package.json` | `vitest.config.*`, `vite.config.*` | `playwright.config.*` | `rstest.config.*` | — | `deno.json(c)` | — |
| Results | injected reporter | injected reporter | JSON output | JUnit | JUnit | JUnit | injected reporter, TAP fallback |

¹ Needs the [Bun for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=Oven.bun-vscode) extension.
² The binary of the package installed in the project; `npx --no-install <name>` when none is found.

Every default command can be replaced with a `jestrunner.*Command` setting, and every run and debug can be
extended with `*RunOptions` and `*DebugOptions`. See the [Settings Reference](configuration.md).

!!! warning "Config files are parsed, not executed"
    Jest Runner reads `jest.config.ts`, `vitest.config.ts` and the others with a static parser. It understands
    object literals, arrays, variables defined in the same file, `require()` of a relative file, spreads and
    wrappers such as `defineConfig(...)` and `mergeConfig(...)`. It does not run functions, resolve packages or
    evaluate conditions. If your config is computed at runtime, set `jestrunner.disableFrameworkConfig` and
    list your test globs in `jestrunner.defaultTestPatterns`. Details: [Config File Parsing](internals/config-parsing.md).

## Jest

**Detected by** a `jest.config.js|ts|json|cjs|mjs` or `jest-e2e.json` next to or above the test file, a `jest`
key in `package.json`, a `jest` dependency, or an installed `jest` binary. When both a Jest and a Vitest config
exist in the same directory, the file patterns of both decide (see [Jest and Vitest side by side](#jest-and-vitest-side-by-side)).

**Config options read** for test discovery and coverage:

| Option | Used for |
|---|---|
| `rootDir` | Base for resolving patterns; `__dirname` is understood |
| `roots` | Only files below one of these directories count |
| `testMatch` | Glob patterns of test files (`<rootDir>` is replaced) |
| `testRegex` | Regular expression(s) of test files; takes precedence over the default globs |
| `testPathIgnorePatterns` | Regular expressions that exclude files |
| `projects` | Paths (globs with `<rootDir>` allowed) or inline objects, parsed recursively |
| `coverageDirectory` | Where `coverage-final.json` is read from |

```javascript title="jest.config.js"
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/fixtures/'],
  coverageDirectory: 'reports/coverage',
};
```

**Command**: `<jest> <file regex> [-c <config>] [-t '<name>'] [runOptions]`. The file is passed as an escaped
regular expression, which is how Jest selects files. The config is only passed when `jestrunner.configPath`
is set (or `jestrunner.useNearestConfig` found one); otherwise Jest resolves it itself, which is what monorepos
want.

**Debug**: the resolved `jest.js` is the program, `--runInBand` is prepended, `jestrunner.debugOptions` is
merged on top. With `jestrunner.enableESM` the session gets `NODE_OPTIONS=--experimental-vm-modules`.

**Results** in the Test Explorer come from a reporter that Jest Runner adds (`--reporters default --reporters
<tmp>/jest-reporter.cjs`) and that writes a structured block to stdout; `--json` output is the fallback.

**Coverage**: `--coverage --coverageReporters=json` is added; `coverage-final.json` is read from
`coverageDirectory` or `coverage/`.

## Vitest

**Detected by** `vitest.config.js|ts|mjs|mts|cjs|cts`, or a `vite.config.*` whose parsed content has a `test`
section (or `projects`), a `vitest` dependency, or an installed `vitest` binary. A `vitest.workspace.ts` is not read; list
its projects under `test.projects` instead.

**Config options read**:

| Option | Used for |
|---|---|
| `root` | Base directory; `__dirname` is understood |
| `test.dir` | Base directory for discovery, relative to the config |
| `test.include` | Glob patterns of test files |
| `test.exclude` | Glob patterns that exclude files |
| `test.projects` / `projects` | Inline objects or config paths, parsed recursively (the `vitest.workspace.*` file is not read) |
| `test.coverage.reportsDirectory` | Where `coverage-final.json` is read from |

```typescript title="vitest.config.ts"
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'src',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/e2e/**'],
    coverage: { provider: 'v8' },
  },
});
```

**Command**: `<vitest> run <file> [--config <config>] [-t '<name>'] [runOptions]`. The `run` sub-command is
left out when `--watch` is among the options, so Vitest's watch mode works. The name filter is anchored
(`^...$`) and written so that it matches both the `suite test` format of Vitest 4 and the `suite > test` format
of Vitest 5. `jestrunner.vitestRunOptions` falls back to `jestrunner.runOptions` when not set.

**Debug**: the resolved `vitest.mjs` is the program; `jestrunner.vitestDebugOptions` is merged on top.

**Results**: a reporter added by Jest Runner (`--reporter=<tmp>/vitest-reporter.cjs`, next to
`--reporter=json --reporter=default`) that works with Vitest 2 to 5.

**Coverage**: `--coverage --coverage.reporter json --coverage.reportOnFailure` is added, so a failing run still
produces a report. A coverage provider package must be installed.

## Playwright

**Detected by** an import of `@playwright/test` in the file, or a `playwright.config.ts|js|mjs|cjs` above it.
A file inside the `testDir` of a Playwright config is never classified as a Jest or Vitest test, even if its
name matches their patterns. Set `jestrunner.disablePlaywright: true` to switch the integration off.

**Config options read**: `testDir` (default `tests`), `testMatch` (string or array of globs; a regular
expression literal cannot be read statically, the default patterns apply then) and `testIgnore`.
`jestrunner.playwrightConfigPath` points to a config outside the default search.

**Command**: `npx playwright test [-g '<name>'] [runOptions] <file>` (or `jestrunner.playwrightCommand`).
`describe` blocks written as `test.describe`, `test.describe.parallel|serial|only|skip|fixme|fail` are
recognized; `test.step` is not a test of its own.

**Debug**: the `playwright` CLI of `@playwright/test` is the program, `--workers=1` is added.

**Results**: Playwright's output is parsed as JSON; coverage is not supported.

## Rstest

**Detected by** an import of `@rstest/core` or `rstest` in the file, or an `rstest.config.mjs|ts|js|cjs|mts|cts`
above it. The working directory is the nearest directory that has Rstest installed or configured.

**Config options read**: `root` (`__dirname` is understood), `include`, `exclude` (array or `{ patterns: [] }`),
`projects` (config paths or inline objects) and `coverage.reportsDirectory`.

```typescript title="rstest.config.ts"
export default {
  root: __dirname,
  include: ['src/**/*.test.ts'],
  exclude: { patterns: ['**/fixtures/**'] },
  projects: ['./packages/app/rstest.config.ts'],
};
```

**Command**: `<rstest> [--config <config>] <file> [-t '<name>'] [runOptions]`. The Test Explorer adds
`--reporter=junit` and reads the JUnit XML from the output.

**Debug**: the `rstest` binary of `@rstest/core` is the program.

**Coverage**: `--coverage`; `coverage-final.json` is read from `reportsDirectory` or `coverage/`.

## Bun

**Detected by** an import of `bun:test` in the file; a `bun.lock` or `bun.lockb` marks a directory as a Bun
project for the dependency check.

**Command**: `bun test [-t '<name>'] [runOptions] <file>`. The Test Explorer adds
`--reporter=junit --reporter-outfile=.bun-report.xml` and reads that file after the run (it is deleted again).
The working directory is the directory of the nearest `bun.lock`, else the nearest `package.json`.

**Debug**: `bun test --inspect-wait [-t <name>]` with the `bun` debug type, which the Bun extension provides.

**Coverage**: `--coverage --coverage-reporter=lcov`; `coverage/lcov.info` is read (a stale file is removed before
the run).

## Deno

**Detected by** `Deno.test(` in the file, imports of `jsr:@std/expect`, `@std/assert`, `jsr:@std/assert` or
`https://deno.land/`, or a `deno.json` / `deno.jsonc` above the file.

**Config options read**: `test.include` and `test.exclude` of `deno.json(c)`; comments in JSONC are stripped.

**Command**: `deno test --allow-all [--filter '<name>'] --junit-path=.deno-report.xml [runOptions] <file>`. The
working directory is the directory of the nearest `deno.json`, so relative imports and the import map resolve.
`describe`/`it` from `@std/testing/bdd` are recognized as well as `Deno.test`.

**Debug**: `deno test --inspect-brk --allow-all` with the `node` debug type attached on port 9229.

**Coverage**: `--coverage=coverage`, then `deno coverage coverage --lcov > lcov.info` after the run.

## Node.js test runner

**Detected by** an import or `require` of `node:test` in the file. There is no config file; the default
patterns (or `jestrunner.defaultTestPatterns`) decide which files are tests.

**Command**: `node --test [--test-name-pattern '<name>'] [runOptions] <file>`
(or `jestrunner.nodeTestCommand`). The Test Explorer adds a custom reporter
(`--test-reporter <tmp>/node-reporter.mjs --test-reporter-destination stdout`) and falls back to parsing the
TAP output.

**Debug**: `node --test [--test-name-pattern <name>] <file>` with the `node` debug type.

**Coverage**: `--experimental-test-coverage` plus an `lcov` reporter writing `lcov.info`.

## Jest and Vitest side by side

A directory can hold both a Jest and a Vitest config, for example during a migration. Jest Runner then
compares the file against the patterns of both configs:

| Jest `testMatch` matches | Vitest `include` matches | Result |
|---|---|---|
| yes | no | Jest |
| no | yes | Vitest |
| both or neither | | Jest, unless only one config has explicit patterns and the file misses them, then the other |

The same rule applies when `jestrunner.configPath` and `jestrunner.vitestConfigPath` are both set. In monorepos
each package is classified on its own, so a Jest package and a Vitest package coexist without settings.

## Cypress

Cypress is not run by Jest Runner, but its config is read: a file matching the `specPattern` of a
`cypress.config.*` above it is excluded from the Jest and Vitest trees, so Cypress specs do not show up as
runnable tests.
