# Troubleshooting & FAQ

## First step: the Jest Runner output channel

Set `"jestrunner.enableDebugLogs": true`, open **View → Output** and choose **Jest Runner** from the dropdown.
It logs, for every file it looks at, which config was found, which patterns were applied and whether the file
matched, and for every run the exact command and working directory. Most questions below are answered by
reading that log.

## No CodeLens, no tests in the Test Explorer

The file was not classified as a test file. The check has three parts, and all must pass:

1. **The file matches the patterns.** Either the `testMatch`/`testRegex` of the Jest config, the `include` of
   the Vitest config, the `testMatch`/`testDir` of Playwright, the `include` of Rstest or Deno, or, when none
   is configured, `jestrunner.defaultTestPatterns`. Exclusions (`testPathIgnorePatterns`, `exclude`,
   `testIgnore`, `roots`) are applied too.
2. **A framework is found.** By import, by a config file above the file, by a dependency in `package.json` or by
   an installed binary. A plain folder without any of these yields nothing.
3. **No other framework claims the file.** A file inside the `testDir` of a Playwright config, or matching a
   Cypress `specPattern`, is left to that tool.

Typical fixes:

- The config is not understood by the static parser (see below): set `jestrunner.disableFrameworkConfig` and
  `jestrunner.defaultTestPatterns`.
- The tests live in a sub project: set `jestrunner.projectPath`.
- The framework is installed globally only: install it in the project, or set the `*Command`.

## The wrong framework runs

- Imports win over configs. A file importing `bun:test` is a Bun test even inside a Jest project.
- A `vite.config.ts` without a `test` section does **not** make a directory a Vitest project; a
  `vitest.config.ts` or a `test` section does.
- With both a Jest and a Vitest config in one directory, the file patterns decide; if both match (or neither has
  explicit patterns) Jest wins. Give one of them explicit `testMatch`/`include` patterns, or set
  `jestrunner.configPath` / `jestrunner.vitestConfigPath` as glob mappings.
- `package.json` dependencies are checked top-down from the test file's directory; the first directory with any
  supported framework wins, in the order Vitest, Jest, Bun, Deno, Playwright, Rstest.

## Limits of the config parser

Config files are parsed as an AST and never executed. Supported:

- object and array literals, strings, numbers, booleans, `null`, `undefined`
- `const`/`let`/`var` declared at the top level of the same file, including destructuring, spread, template
  literals and `+` concatenation of resolvable values; `as` casts and `!` assertions are ignored
- `require('./relative/file')` of another local CommonJS file (its `module.exports` is read the same way)
- `module.exports = ...`, `exports.x = ...`, `export default ...`, `export const ...`
- any wrapper call whose argument is the config, such as `defineConfig({...})`, `mergeConfig(base, {...})` or
  `defineProject({...})`, and functions returning an object (`() => ({ ... })`, `defineConfig(() => ({...}))`)
- `__dirname` for `rootDir` / `root`
- JSON and JSONC (`deno.jsonc`)

Not supported: ES `import` of other files or packages (`import { nxPreset } from '@nx/jest/preset'`), function
calls with logic, conditions, `process.env`, regular expression literals. The parser then returns what it could resolve, usually without
patterns, and the default patterns apply. See [Config File Parsing](internals/config-parsing.md).

## Tests run, but the Test Explorer shows no result

Results come from a reporter Jest Runner injects into the run (Jest, Vitest, Node.js), from JUnit XML (Rstest,
Bun, Deno) or from JSON output (Playwright). If a custom reporter in your config suppresses the default output,
or `jestrunner.*RunOptions` adds `--silent`, the output may be empty: the log then says `No output from test
runner`. Results that cannot be matched to a test leave the test as *skipped*; a failing suite without any
results (import error) reports the error on all its tests.

## "Test output exceeded maximum buffer size"

A Test Explorer run produced more than `jestrunner.maxBufferSize` MB of output and was stopped. Raise the
limit, or reduce the output (`--silent`, fewer `console.log`).

## Debugging does not stop at breakpoints

- Jest: make sure `--runInBand` is in effect (it is added by default) and source maps are produced by your
  transformer. With a custom `runtimeExecutable` in `jestrunner.debugOptions` you are on your own: Jest Runner
  only appends the file and name filter.
- Vitest: the program is `vitest.mjs`; breakpoints need `sourcemap` in the Vite config for transformed files.
- Bun: install the Bun extension; the debug type is `bun`.
- Deno: the session attaches on port 9229; another process on that port blocks it.
- nvm and friends: the debugger does not run your shell profile. Set `runtimeExecutable` to the Node binary.

## Coverage shows nothing

- Jest / Vitest / Rstest: the extension reads `coverage-final.json`. It is written by the `json` reporter, which
  the Test Explorer adds; a `coverageReporters`/`coverage.reporter` setting in the config that drops `json` is
  overridden by the CLI flag. Check `coverageDirectory` / `reportsDirectory`: the log prints the path it tried.
- Vitest additionally needs `@vitest/coverage-v8` or `@vitest/coverage-istanbul` installed.
- Node.js / Bun / Deno: `lcov.info` is searched from the test file's directory up to the workspace folder, in
  the directory itself and in `coverage/`.
- Test files and `node_modules` are deliberately not shown.

## Windows specifics

- Test names with `$`, backticks, `%`, `|` or quotes are quoted for the shell of the integrated terminal. If you
  change the default terminal profile, new terminals get the new quoting.
- `npx`, `yarn` and `pnpm` are `.cmd` files; Test Explorer runs start them through `cmd.exe` automatically.
- Command lines longer than about 8,000 characters (cmd.exe) or 30,000 characters (direct spawn) are shortened:
  Jest and Vitest drop the explicit file list and run the project with the name filter; other frameworks are
  split into two runs.
- Paths are compared case-insensitively when matching results, and symlinked workspaces are resolved.

## FAQ

**Can I keep using the Jest extension by Orta or the Vitest extension next to Jest Runner?**
Yes. Jest Runner does not watch or run anything in the background. Disable `jestrunner.enableCodeLens` or
`jestrunner.enableTestExplorer` if two sets of buttons bother you.

**Why are the commands called "Run Jest" for Vitest and the others?**
History: the extension started as a Jest runner. The command IDs are kept so existing keybindings keep working.
Each command runs the framework of the current file.

**Does the extension execute my config files?**
No. It parses them statically. That is why complex configs may need `jestrunner.disableFrameworkConfig`.

**Does it work with remote development (SSH, WSL, Dev Containers, Codespaces)?**
Yes. The extension runs where your files are (the remote side), so detection and the spawned processes see the
same file system and binaries as your terminal.

**How do I run all tests of the project?**
Right-click the root folder in the explorer and choose **Run Jest on Path**, or use the run button at the top
of the Test Explorer.

**Where are the reporter files written?**
To `<temp>/vscode-jest-runner-reporters/` (the operating system's temp directory), once per session. They are
plain JavaScript and can be inspected there.

## Reporting a bug

Open an [issue](https://github.com/firsttris/vscode-jest-runner/issues/new?template=bug_report.md) with:

- operating system, shell and VS Code version,
- the test framework and the project type (Nx, Next.js, CRA, Vite, ...),
- your `jestrunner.*` settings,
- the relevant config file (`jest.config.js`, `vitest.config.ts`, ...),
- the **Jest Runner** output with `enableDebugLogs` on.
