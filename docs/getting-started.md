# Getting Started

Jest Runner needs no configuration in most projects: install it, open a test file, click **Run**.

## Install

=== "Extensions view"

    Open the Extensions view (++ctrl+shift+x++ on Windows and Linux, ++cmd+shift+x++ on macOS),
    search for **Jest Runner** and click **Install**.

=== "Command line"

    ```bash
    code --install-extension firsttris.vscode-jest-runner
    ```

=== "VSCodium, Cursor, Windsurf, Gitpod"

    Editors without access to the Visual Studio Marketplace install from
    [Open VSX](https://open-vsx.org/extension/firsttris/vscode-jest-runner), where every release is published too.

Jest Runner requires VS Code 1.100 or newer. It activates after the editor has finished starting
(`onStartupFinished`), so it never slows down the start of VS Code.

## Your first test run

1. Open a folder (or a multi-root workspace) that contains tests written for one of the
   [supported frameworks](frameworks.md). The framework must be installed in the project: Jest Runner runs the
   project's own `jest`, `vitest`, `playwright`, `rstest`, `bun`, `deno` or `node` binary.
2. Open a test file. Above every `describe`, `it` and `test` you see two CodeLens actions: **Run** and **Debug**.
3. Click **Run**. A terminal named `jest` (or `vitest`) opens and runs exactly that test, filtered by name.
4. Click **Debug**. VS Code starts a debug session with the same filter; breakpoints in the test and in the code
   under test work as usual.

!!! tip "How Jest Runner finds the right framework"
    Each file is classified on its own. Imports such as `bun:test`, `node:test`, `@playwright/test` or
    `@rstest/core` win; otherwise the nearest `jest.config.*`, `vitest.config.*` or `vite.config.*` above the
    file decides, then the dependencies in `package.json`, then the installed binaries. The details are in
    [Test Detection](internals/test-detection.md).

## Enable the Test Explorer

The CodeLens actions run tests in a terminal. The native **Test Explorer** of VS Code additionally shows the
tree of all test files and tests of the workspace, with pass/fail state, inline error messages at the failing
line and code coverage. It is off by default; switch it on in your settings:

```json title="settings.json"
"jestrunner.enableTestExplorer": true
```

Then open the **Testing** view in the activity bar. The first time you open it, Jest Runner scans the workspace
for test files (it skips `node_modules`) and parses each file to build the tree.

The Test Explorer offers four profiles: **Run**, **Debug**, **Coverage** and **Update Snapshots**.
How it works under the hood is described in [Test Explorer](internals/test-explorer.md).

## Choose your entry points

| Entry point | Default | Setting |
|---|---|---|
| CodeLens **Run** and **Debug** above tests | on | `jestrunner.enableCodeLens`, `jestrunner.codeLens` |
| Test Explorer | off | `jestrunner.enableTestExplorer` |
| Editor context menu **Run Jest** / **Debug Jest** | on, for test files | — |
| Explorer context menu **Run Jest on Path** / **Debug Jest on Path** | on | — |
| Command Palette (`Run Jest`, `Debug Jest`, `Run Jest --watch`, ...) | on | — |
| Keyboard shortcuts | none | your `keybindings.json`, see [Running & Debugging Tests](usage.md#keyboard-shortcuts) |

Everything else, such as commands for Create React App, extra CLI flags or several Jest configs in one
workspace, is covered in the [Settings Reference](configuration.md) and the [Recipes](recipes.md).

## Next steps

- [Running & Debugging Tests](usage.md): every action in detail, watch mode, snapshots, coverage
- [Supported Test Frameworks](frameworks.md): what is read from `jest.config.js`, `vitest.config.ts` and the others
- [Troubleshooting & FAQ](troubleshooting.md): when tests do not show up or the wrong runner is used
