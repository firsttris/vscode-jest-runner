# Debugging

Debugging never runs a command of its own: Jest Runner assembles a **launch configuration** and hands it to
`vscode.debug.startDebugging`. VS Code's JavaScript debugger (or the Bun extension) does the rest, including
source maps, breakpoints and the call stack. The code is `src/debug/DebugConfigurationProvider.ts`, called
through `TestRunnerConfig.getDebugConfiguration(file, testName)` from both the terminal path (`TestRunner`)
and the Test Explorer (`DebugHandler`).

## The common base

`createDebugConfigBase` gives every framework:

```json
{
  "name": "Debug <Framework> Tests",
  "type": "node",                // "bun" for Bun
  "request": "launch",
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen",
  "cwd": "<getTestRunCwd(file)>"  // only with changeDirectoryToWorkspaceRoot
}
```

followed by the user's `jestrunner.*DebugOptions`, which may override any key. The `cwd` is the same
directory a Test Explorer run would use, so Playwright and Deno find their config when debugging too.

## Per framework

| Framework | `program` / `runtimeExecutable` | `args` / `runtimeArgs` |
|---|---|---|
| Jest | `program`: the `jest.js` resolved from the working directory; else `runtimeExecutable: npx` with `--no-install jest` | `--runInBand` + the adapter's args (`<file regex> [-c] [-t]`), unquoted |
| Vitest | `program`: `vitest.mjs`; else npx | the adapter's args (`run <file> [--config] [-t]`) |
| Rstest | `program`: the `rstest` bin of `@rstest/core`; else npx | the adapter's args |
| Playwright | `program`: the `playwright` bin of `@playwright/test`; else npx | the adapter's args + `--workers=1` |
| Node.js | `program`: the test file, `runtimeExecutable` from `nodeTestCommand` when set | `runtimeArgs`: `--test [--test-name-pattern <name>] + nodeTestRunOptions` |
| Bun | `type: bun`, `program`: the test file | `runtimeArgs`: `test --inspect-wait [-t <name>] + bunRunOptions` |
| Deno | `runtimeExecutable: deno`, `port: 9229`, `attachSimplePort: 9229` | `runtimeArgs`: `test --inspect-brk --allow-all [--filter <name>] + denoRunOptions <file>` |

The test name is passed raw (placeholders already replaced by `(.*?)`), never shell-quoted: the debugger
passes arguments as an array.

## Custom commands

A `jestrunner.*Command` setting also shapes the debug session (`getProgramCommandState` /
`resolveCommandExecution`):

- `FOO=bar <cmd>` → the variables go into `env`.
- `node [--options] <script> [args]` → `<script>` is the `program`, the options are `runtimeArgs`, the args
  stay `args`; a `node` given with a path becomes `runtimeExecutable`. This makes
  `node --experimental-vm-modules ./node_modules/jest/bin/jest.js` debuggable as written.
- any other executable (`npx jest`, `yarn vitest`, `pnpm exec rstest`) → `runtimeExecutable` with the rest
  as `runtimeArgs`; the generated test arguments are appended.

For Jest only, a `runtimeExecutable` inside `jestrunner.debugOptions` takes over: `program` is dropped, the
user's `runtimeArgs` are kept and only the generated file and name arguments are appended (the Create React
App recipe relies on this).

## Environment

`mergeEnv` layers, later wins: the ESM env (`NODE_OPTIONS=--experimental-vm-modules` for Jest with
`enableESM`), the env parsed from the command, the `env` of the `*DebugOptions`. An empty env is left out
so VS Code's defaults apply.

## What is *not* done

- No reporter is injected and no result is read back: the Test Explorer shows the debugged test as finished
  without a state, the terminal shows the output.
- Only one test (or file) is debugged per request.
- Coverage is not collected in debug sessions.
