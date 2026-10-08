# Settings Reference

All settings live under `jestrunner.*` in the VS Code settings (user, workspace or folder). None is required.
Every `*Command` setting supports the variables `${workspaceFolder}`, `${workspaceRoot}`,
`${workspaceFolderBasename}`, `${userHome}` and `${env:NAME}`.

## User interface

| Setting | Type | Default | Description |
|---|---|---|---|
| `jestrunner.enableCodeLens` | boolean | `true` | Show the inline **Run** / **Debug** actions above tests. |
| `jestrunner.codeLens` | string[] | `["run", "debug"]` | Which actions to show: `run`, `debug`, `watch`, `coverage`, `current-test-coverage`. |
| `jestrunner.enableTestExplorer` | boolean | `false` | Show tests in the native Test Explorer with Run, Debug, Coverage and Update Snapshots profiles. |
| `jestrunner.preserveEditorFocus` | boolean | `false` | Keep the focus in the editor when the terminal opens. |
| `jestrunner.enableDebugLogs` | boolean | `false` | Verbose logging in the **Jest Runner** output channel: parsed configs, patterns, commands. |
| `jestrunner.maxBufferSize` | number | `50` | Maximum size in MB of the output a Test Explorer run may produce before it is killed. |

## Test discovery

| Setting | Type | Default | Description |
|---|---|---|---|
| `jestrunner.defaultTestPatterns` | string[] | `["**/*.{test,spec}.?(c\|m)[jt]s?(x)", "**/__tests__/**/*.?(c\|m)[jt]s?(x)"]` | Globs used when a config defines no `testMatch`/`testRegex`/`include`, and for frameworks without a config (Node.js, Bun). |
| `jestrunner.disableFrameworkConfig` | boolean | `false` | Ignore `jest.config.*`, `vitest.config.*` and the other config files and use `defaultTestPatterns` only. For configs the static parser cannot read. |
| `jestrunner.disablePlaywright` | boolean | `false` | Switch the Playwright integration off. |

## Working directory and config resolution

| Setting | Type | Default | Description |
|---|---|---|---|
| `jestrunner.projectPath` | string | `""` | Directory to run tests from, absolute or relative to the workspace folder (`./packages/app`). Also the root for Test Explorer discovery. |
| `jestrunner.changeDirectoryToWorkspaceRoot` | boolean | `true` | Change into a directory before running. Order: `projectPath`, then the directory of the nearest framework config or `package.json`, then the workspace folder. |
| `jestrunner.useNearestConfig` | boolean | `false` | Look for the nearest config file above the test file instead of the one at the root. For nested projects. With `false` and no `configPath`, no `-c` is passed and the framework resolves the config itself. |
| `jestrunner.configPath` | string or object | `""` | Jest config, relative to `projectPath` or the workspace folder. As an object it maps globs to configs, first match wins: `{"**/*.it.spec.ts": "jest.it.config.js", "**/*.spec.ts": "jest.config.js"}`. |
| `jestrunner.vitestConfigPath` | string or object | `""` | The same for Vitest. |
| `jestrunner.playwrightConfigPath` | string | `""` | Playwright config, absolute or relative to the workspace folder. |

## Commands

The command is the executable (with any leading arguments) that Jest Runner puts in front of the generated
arguments. Leave it empty to use the project's installed binary.

| Setting | Default when empty | Example |
|---|---|---|
| `jestrunner.jestCommand` | `node <node_modules/jest/bin/jest.js>`, else `npx --no-install jest` | `npm run test --` (Create React App), `nvm use && npx jest` |
| `jestrunner.vitestCommand` | `node <node_modules/vitest/vitest.mjs>`, else `npx --no-install vitest` | `pnpm vitest` |
| `jestrunner.rstestCommand` | `node <@rstest/core bin>`, else `npx --no-install rstest` | |
| `jestrunner.playwrightCommand` | `npx playwright` | `yarn playwright` |
| `jestrunner.nodeTestCommand` | `node` | `node --import tsx` |

Environment variables at the start of a command (`FOO=bar npx jest`) are parsed and passed to the process, also
for debugging. A command of the form `node [options] <script>` is debugged with `<script>` as the program and the
options as runtime arguments.

Bun and Deno always run as `bun` and `deno` from `PATH`.

## Run options

Extra CLI flags appended to every run of that framework (terminal and Test Explorer). Flags that Jest Runner
already generated are not duplicated.

| Setting | Example |
|---|---|
| `jestrunner.runOptions` | `["--coverage", "--colors"]`, see the [Jest CLI](https://jestjs.io/docs/cli) |
| `jestrunner.vitestRunOptions` | `["--reporter=verbose"]`, see the [Vitest CLI](https://vitest.dev/guide/cli.html); falls back to `runOptions` when unset |
| `jestrunner.rstestRunOptions` | `["--globals"]` |
| `jestrunner.playwrightRunOptions` | `["--headed"]`, see the [Playwright CLI](https://playwright.dev/docs/test-cli) |
| `jestrunner.nodeTestRunOptions` | `["--experimental-test-coverage"]` |
| `jestrunner.bunRunOptions` | `["--silent"]` |
| `jestrunner.denoRunOptions` | `["--allow-net"]` |

## Debug options

An object merged into the generated [launch configuration](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations).
Any key of a launch configuration works: `args`, `env`, `runtimeExecutable`, `runtimeArgs`, `console`,
`skipFiles`, `sourceMaps`, ...

| Setting | Applies to |
|---|---|
| `jestrunner.debugOptions` | Jest |
| `jestrunner.vitestDebugOptions` | Vitest |
| `jestrunner.rstestDebugOptions` | Rstest |
| `jestrunner.playwrightDebugOptions` | Playwright |
| `jestrunner.nodeTestDebugOptions` | Node.js |
| `jestrunner.bunDebugOptions` | Bun |
| `jestrunner.denoDebugOptions` | Deno |

```json title="settings.json"
"jestrunner.debugOptions": {
  "args": ["--no-cache"],
  "env": { "TZ": "UTC" },
  "skipFiles": ["<node_internals>/**"]
}
```

For Jest, a `runtimeExecutable` in `debugOptions` takes over completely: Jest Runner then only appends the
file and name filter to your `runtimeArgs`.

## Other

| Setting | Type | Default | Description |
|---|---|---|---|
| `jestrunner.enableESM` | boolean | `false` | Add `NODE_OPTIONS=--experimental-vm-modules` to Jest runs and debug sessions for ESM projects. |

## Where to put settings

- **User settings** for personal preferences such as `enableTestExplorer`, `codeLens` or `preserveEditorFocus`.
- **Workspace settings** (`.vscode/settings.json`) for project facts such as `jestCommand`, `configPath` or
  `projectPath`, so every contributor gets them.
- In a **multi-root workspace** the settings are read per workspace; `scope: window` settings apply to the
  whole window.

A change to any `jestrunner.*` setting clears the detection caches and, with the Test Explorer enabled,
re-discovers the tests.
