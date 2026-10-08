# Recipes

Ready-made settings for common setups. All go into `.vscode/settings.json` of the project unless stated
otherwise.

## Create React App and other wrappers

`react-scripts test` wraps Jest, so Jest Runner has to call the wrapper for runs and tell the debugger where the
real Jest lives:

```json
"jestrunner.jestCommand": "npm run test --",
"jestrunner.debugOptions": {
  "runtimeExecutable": "${workspaceRoot}/node_modules/.bin/react-scripts",
  "runtimeArgs": ["test", "${fileBasename}", "--runInBand", "--no-cache", "--watchAll=false"]
}
```

The same pattern works for any script that ends up running Jest: `jestCommand` is the script, `debugOptions`
points to its binary.

## Nx, Next.js, NestJS, Vite, TanStack Start

These need no settings: the Jest or Vitest config of the package is found by walking up from the test file, and
the working directory is the package directory. For Nx workspaces with one `jest.config.ts` per project,
`jestrunner.useNearestConfig` is not needed either; set it only when you also use `jestrunner.configPath`.

## Monorepo with Jest and Vitest packages

Nothing to configure. Each test file is classified by the nearest config above it, so `packages/api` on Jest
and `packages/web` on Vitest work side by side, in the terminal and in the Test Explorer. A Test Explorer run
that spans both packages starts one process per package.

## Several Jest configs in one package

Map globs to config files. The first matching glob wins, so put the specific ones first:

```json
"jestrunner.configPath": {
  "**/*.it.spec.ts": "./jest.integration.config.js",
  "**/*.e2e.spec.ts": "./jest.e2e.config.js",
  "**/*.spec.ts": "./jest.unit.config.js"
}
```

Paths are relative to `jestrunner.projectPath` or the workspace folder. `jestrunner.vitestConfigPath` accepts
the same mapping.

## Nested projects with their own config

With `jestrunner.configPath` set and `useNearestConfig` on, the config closest to the test file is used, and the
root config is the fallback:

```json
"jestrunner.configPath": "jest.config.js",
"jestrunner.useNearestConfig": true
```

## Run from a sub folder

When the tests live in a sub project of the workspace:

```json
"jestrunner.projectPath": "./backend"
```

Tests then run from `backend/`, configs are resolved relative to it, and the Test Explorer only scans below it.

## Node version managers (nvm, fnm, volta)

The integrated terminal already runs your shell, so for terminal runs it is enough to prefix the command:

```json
"jestrunner.jestCommand": "nvm use && npx jest"
```

The debugger does not go through the shell. Point it at the Node binary you want:

```json
"jestrunner.debugOptions": {
  "runtimeExecutable": "${userHome}/.nvm/versions/node/v22.11.0/bin/node"
}
```

## ESM projects on Jest

```json
"jestrunner.enableESM": true
```

adds `NODE_OPTIONS=--experimental-vm-modules` to runs and debug sessions. Alternatively make it part of the
command:

```json
"jestrunner.jestCommand": "node --experimental-vm-modules ${workspaceFolder}/node_modules/jest/bin/jest.js"
```

The debugger understands this form: `jest.js` becomes the program and `--experimental-vm-modules` a runtime
argument.

## TypeScript on the Node.js test runner

```json
"jestrunner.nodeTestCommand": "node --import tsx"
```

Runs become `node --import tsx --test <file>`; the debugger uses the same runtime arguments.

## Environment variables for a run

Prefix the command:

```json
"jestrunner.vitestCommand": "TZ=UTC DEBUG=app:* npx vitest"
```

The variables are parsed and passed to the process (and to the debug session) rather than relying on the
shell. For the debugger alone use the `env` key of the `*DebugOptions`.

## Coverage of the file under test only

Add the `current-test-coverage` CodeLens action:

```json
"jestrunner.codeLens": ["run", "debug", "current-test-coverage"]
```

For `src/user.test.ts` it runs with `--collectCoverageFrom '**/user.ts'`; if no such file exists, with the
folder of the test file.

## Playwright: headed runs and a custom config

```json
"jestrunner.playwrightRunOptions": ["--headed", "--project=chromium"],
"jestrunner.playwrightConfigPath": "e2e/playwright.config.ts"
```

To keep Playwright specs out of the trees entirely (for example when the official Playwright extension handles
them):

```json
"jestrunner.disablePlaywright": true
```

## A config the parser cannot read

If your config is assembled at runtime (imports from packages, function calls, conditions), tell Jest Runner
which files are tests yourself:

```json
"jestrunner.disableFrameworkConfig": true,
"jestrunner.defaultTestPatterns": ["src/**/*.spec.ts", "tests/**/*.ts"]
```

Framework detection (by dependency and binary) and the commands still work; only the discovery patterns are
replaced.

## Windows: PowerShell, cmd.exe and Git Bash

Nothing to configure. Test names are quoted for the shell of your integrated terminal: single quotes for
PowerShell and Git Bash (so `$`, backticks and `%` stay literal), doubled quotes and `^%` for cmd.exe. For Test
Explorer runs, `.cmd` shims such as `npx.cmd`, `yarn.cmd` or `pnpm.cmd` are started through `cmd.exe`; very long
command lines are shortened or split; on cancel the whole process tree is killed with `taskkill /T`.

If a test name is still mangled, check which shell `terminal.integrated.defaultProfile.windows` selects: the
quoting follows that setting.

## Keyboard-only workflow

```json title="keybindings.json"
{ "key": "alt+1", "command": "extension.runJest" },
{ "key": "alt+2", "command": "extension.debugJest" },
{ "key": "alt+3", "command": "extension.runJestFile" },
{ "key": "alt+4", "command": "extension.runPrevJest" }
```

With `"jestrunner.preserveEditorFocus": true` the cursor stays in the editor after each run.
