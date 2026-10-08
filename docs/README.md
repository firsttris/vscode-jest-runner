# Documentation

Everything about **Jest Runner for VS Code** in detail: how to install and use it, what it reads from each
test framework, every setting, and how the extension works inside. The short overview is the
[README on GitHub](https://github.com/firsttris/vscode-jest-runner#readme).

<img src="Banner.png" alt="Jest Runner in VS Code: Run and Debug CodeLens above a test, the Test Explorer and the terminal output" width="900">

## User Guide

| | |
|---|---|
| [Getting Started](getting-started.md) | Install, open a project, run your first test, enable the Test Explorer |
| [Running & Debugging Tests](usage.md) | CodeLens, Test Explorer, context menus, commands, keyboard shortcuts, watch mode, snapshots, coverage |
| [Supported Test Frameworks](frameworks.md) | Jest, Vitest, Playwright, Rstest, Bun, Deno, Node.js: how each is detected, which config options are read, how coverage and debugging work |
| [Settings Reference](configuration.md) | Every `jestrunner.*` setting with defaults and examples |
| [Recipes](recipes.md) | Create React App, nvm, ESM, monorepos, several configs, Windows shells, custom commands |
| [Troubleshooting & FAQ](troubleshooting.md) | Tests not found, wrong framework, debug logs, known limits of the config parser |

## Internals

| | |
|---|---|
| [Architecture](architecture.md) | The big picture: three entry points, the detection pipeline, command building, process execution, result matching |
| [Test Detection](internals/test-detection.md) | How a file is classified as a test of one framework, the caches, config path resolution |
| [Config File Parsing](internals/config-parsing.md) | The static AST parser for `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `rstest.config.*`, `deno.json` |
| [Test File Parsing](internals/test-parsing.md) | How `describe`, `it`, `test`, `it.each` and `Deno.test` become a test tree with positions |
| [Command Building & Execution](internals/execution.md) | Framework adapters, argument strategies, the terminal path, the spawn path, Windows handling |
| [Reporters & Result Matching](internals/results.md) | The structured output protocol, the injected reporters, JSON, JUnit and TAP fallbacks, matching results to test items |
| [Test Explorer](internals/test-explorer.md) | Discovery, the test item tree, file and config watchers, run profiles |
| [Debugging](internals/debugging.md) | How the debug configuration is assembled for each framework |
| [Coverage](internals/coverage.md) | Istanbul JSON and LCOV, coverage directory detection, mapping to the VS Code coverage API |
| [Module Reference](internals/module-reference.md) | Every source file in one table: what it does and who uses it |
| [Development & Release](development.md) | Build, test, lint, debug the extension, CI, release process, project conventions |
