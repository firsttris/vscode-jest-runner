<div align="center">

# 🧪 Jest & Vitest Runner

**Run and debug tests with ease, right from your editor**

![Extension Example](./docs/Banner.png)

[![Build](https://img.shields.io/github/actions/workflow/status/firsttris/vscode-jest-runner/master.yml?branch=master&label=Build&logo=github&style=flat-square)](https://github.com/firsttris/vscode-jest-runner/actions/workflows/master.yml)
[![Coverage](https://img.shields.io/codecov/c/github/firsttris/vscode-jest-runner?logo=codecov&style=flat-square)](https://codecov.io/gh/firsttris/vscode-jest-runner)
[![VS Marketplace Version](https://vsmarketplacebadges.dev/version-short/firsttris.vscode-jest-runner.svg)](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)
[![Open VSX](https://img.shields.io/open-vsx/v/firsttris/vscode-jest-runner?label=Open%20VSX&style=flat-square)](https://open-vsx.org/extension/firsttris/vscode-jest-runner)
[![Installs](https://vsmarketplacebadges.dev/installs-short/firsttris.vscode-jest-runner.svg)](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)
[![Rating](https://vsmarketplacebadges.dev/rating-short/firsttris.vscode-jest-runner.svg)](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Overview](#-overview) •
[Features](#-features) •
[Configuration](#️-configuration) •
[Keyboard Shortcuts](#️-configuration) •
[Contributing](#-contributing)

</div>

---

## 🎯 Overview

A **lightweight** VS Code extension for running and debugging Jest, Vitest, Node.js (native), Bun, and Deno tests directly in your editor. Works **out-of-the-box** with minimal configuration.

> ✨ **What's New?** Try the new native Test Explorer with code coverage integration! Enable it by setting `"jestrunner.enableTestExplorer": true` in your VS Code settings.

> ⚠️ **Important:** The extension uses **AST-based parsing** to read configuration files. It does **not** execute the file as JavaScript/TypeScript code. It cannot resolve variables or function calls. If your configuration is too complex for this parser, you can set **`jestrunner.disableFrameworkConfig: true`**. This will disable config parsing and the extension will rely solely on `jestrunner.defaultTestPatterns` to identify test files. More information in [Supported Framework Config](#️-configuration).

> ⚠️ **Notice:** The extension is currently undergoing major refactoring. If you encounter any issues or have questions, please don't hesitate to create a GitHub issue.

## ✨ Features

<table>
<tr>
<td width="50%">

### 🚀 Run & Debug Experience

- ✅ **Run individual tests** or entire test suites with a single click
- 🐛 **Debug tests** with full breakpoint and variable inspection support
- 📊 **Generate coverage reports** to analyze test coverage
- 👀 **Watch mode** for automatic test re-runs during development
- 📸 **Snapshot updating** with dedicated command

</td>
<td width="50%">

### 📋 Multiple Access Points

- 🖱️ **Context menu** in editor and explorer (right-click on tests)
- 🔍 **CodeLens** annotations above test definitions (optional)
- 🗂️ **Test Explorer** integration showing test hierarchy in dedicated panel
- ⌨️ **Command palette** (Ctrl+Shift+P) with full command access
- ⚡ **Keyboard shortcuts** for quick test execution

</td>
</tr>
<tr>
<td width="50%">

### 🎯 Smart Test Detection

- 🤖 **Automatic framework detection** - distinguishes between Jest, Vitest, Node.js, Bun, and Deno tests
- 🔍 **Reads and applies include/exclude patterns** (globs and regex) from [framework configs](#️-configuration) for fine-grained control over which tests appear

</td>
<td width="50%">

### 💼 Project Flexibility

- 📦 **Monorepo support** for yarn & VS Code workspaces
- ⚙️ **Multiple configurations** with glob-based config resolution
- ⚛️ **Create React App** and similar abstraction layers
- 🛠️ **Framework support** including Vite, Tanstack Start, Nx, Next.js, and NestJS

</td>
</tr>
</table>

## ⚙️ Configuration

<details>
<summary><b>📊 Coverage Support</b></summary>
<br>

The extension supports test coverage through VS Code's Test Explorer. When you run tests with coverage, the results are displayed directly in VS Code's coverage view.

**Prerequisites**

**For Jest:**

- Coverage works out of the box! No configuration needed.

**For Vitest:**

- Install a coverage provider:

```bash
npm install -D @vitest/coverage-v8
# or
npm install -D @vitest/coverage-istanbul
```

- You only need to specify the coverage provider in `vitest.config.ts`:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // or 'istanbul'
    },
  },
});
```

**For Node.js Native Test Runner:**
- Coverage is supported natively via the `--experimental-test-coverage` flag (enabled by default for coverage runs).
- No extra setup required!

**For Bun:**
- ⚠️ **Required:** [Bun for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=Oven.bun-vscode) extension.
- Ensure the extension is installed and enabled for debugging to work correctly.


**Coverage Directory Detection**

The extension automatically detects the coverage directory from your framework configuration:

- **Jest**: Reads the `coverageDirectory` option from your Jest config
- **Vitest**: Reads the `reportsDirectory` option from your Vitest coverage config
- **Node.js**: Defaults to `coverage/` directory (standard native behavior)

If not specified, it defaults to `coverage/` in your project root.

**Running Tests with Coverage**

All coverage entry points use the same **Coverage** profile powered by VS Code's native coverage API.

**Coverage via Test Explorer**

- Click the "Coverage" button (shield icon) in the Test Explorer panel
- Coverage results appear in VS Code's Coverage panel (View → Testing → Show Coverage)
- Inline decorations in the editor show covered/uncovered lines

**Coverage via CodeLens / Command Palette**

- Use the CodeLens "Coverage" action (if enabled) above a test or suite
- Or run the Command Palette command: "Jest: Run Test with Coverage"

</details>


<details>
<summary><b>🛠️ Extension Settings</b></summary>
<br>

Customize the test runner for your project:

| Setting                                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Jest Configuration**                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.configPath`                     | Path to Jest config (relative to workspace folder, e.g. `jest-config.json`). Can be a string or a glob mapping object to support multiple Jest configs.<br><br>**Example with glob mapping:** `{"**/*.it.spec.ts": "./jest.it.config.js", "**/*.spec.ts": "./jest.unit.config.js"}` - The first matching glob is used, so specify more specific patterns first. Config path is relative to `jestrunner.projectPath` or workspace root. Use `jestrunner.useNearestConfig: true` to search up directories for the matching config file. |
| `jestrunner.jestCommand`                    | Define an alternative Jest command for projects using abstractions like Create React App (e.g. `npm run test --`).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `jestrunner.runOptions`                     | CLI options to add to Jest commands (e.g. `["--coverage", "--colors"]`). See [Jest CLI documentation](https://jestjs.io/docs/en/cli).                                                                                                                                                                                                                                                                                                                                                                                                 |
| `jestrunner.debugOptions`                   | Add or override VS Code debug configurations (e.g. `{ "args": ["--no-cache"] }`). Only applies when debugging tests.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `jestrunner.enableESM`                      | Manually enable ESM support. When set to true, `--experimental-vm-modules` is added to NODE_OPTIONS. Default: `false`.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Vitest Configuration**                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.vitestConfigPath`               | Path to Vitest config (relative to workspace folder, e.g. `vitest.config.ts`). Can be a string or a glob mapping object similar to `configPath`.                                                                                                                                                                                                                                                                                                                                                                                      |
| `jestrunner.vitestCommand`                  | Define an alternative Vitest command (default: `npx --no-install vitest`).                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `jestrunner.vitestRunOptions`               | CLI options to add to Vitest commands (e.g. `["--reporter=verbose"]`). See [Vitest CLI documentation](https://vitest.dev/guide/cli.html).                                                                                                                                                                                                                                                                                                                                                                                             |
| `jestrunner.vitestDebugOptions`             | Add or override VS Code debug configurations for Vitest (e.g. `{ "args": ["--no-cache"] }`). Only applies when debugging Vitest tests.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Node.js Test Configuration**              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.nodeTestCommand`                | Define an alternative Node.js test command (defaults to `node`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `jestrunner.nodeTestRunOptions`             | CLI options to add to the Node.js test runner command (e.g. `["--experimental-test-coverage"]`).                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `jestrunner.nodeTestDebugOptions`           | Add or override VS Code debug configurations for local Node.js tests (e.g. `{ "args": ["--no-warnings"] }`). Only applies when debugging `node:test` tests.                                                                                                                                                                                                                                                                                                                                                                           |
| **Bun Configuration**                       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.bunRunOptions`                  | CLI options to add to Bun test command (e.g. `["--silent"]`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `jestrunner.bunDebugOptions`                | Add or override VS Code debug configurations for Bun (e.g. `{ "args": ["--no-cache"] }`). Only applies when debugging bun tests.                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Deno Configuration**                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.denoRunOptions`                 | CLI options to add to Deno test command (e.g. `["--allow-net"]`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `jestrunner.denoDebugOptions`               | Add or override VS Code debug configurations for Deno. Only applies when debugging deno tests.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **UI Options**                              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.defaultTestPatterns`            | Fallback patterns used when no 'testMatch'/'testRegex' (Jest) or 'include' (Vitest) configuration is found. Default: `["**/*.{test,spec}.?(c\|m)[jt]s?(x)", "**/__tests__/**/*.?(c\|m)[jt]s?(x)"]`                                                                                                                                                                                                                                                                                                                                                         |
| `jestrunner.enableTestExplorer`             | Enable the Test Explorer integration using VS Code's Testing API. Shows tests in dedicated Test Explorer panel. Default: `false`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `jestrunner.enableCodeLens`                 | Bring back the old CodeLens feature with inline run/debug buttons (replaced by Test Explorer). Default: `true`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `jestrunner.codeLens`                       | Specify which CodeLens actions to show when CodeLens is enabled. Options: `"run"`, `"debug"`, `"watch"`, `"coverage"`, `"current-test-coverage"`. Default: `["run", "debug"]`                                                                                                                                                                                                                                                                                                                                         |
| `jestrunner.preserveEditorFocus`            | Keep focus on the editor instead of switching to the terminal when running tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Debugging**                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.enableDebugLogs`                | Enable debug logging to the "Jest Runner" output channel. Useful for troubleshooting test detection and configuration issues. Default: `false`                                                                                                                                                                                                                                                                                                                                                                                        |
| `jestrunner.maxBufferSize`                  | Maximum buffer size in MB for test output (default: `50`MB).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Project Management**                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.projectPath`                    | Path to project directory. Can be absolute (e.g. `/home/me/project/sub-folder`) or relative to workspace root (e.g. `./sub-folder`).                                                                                                                                                                                                                                                                                                                                                                                                  |
| `jestrunner.changeDirectoryToWorkspaceRoot` | Change directory before running tests. Priority order: 1. `projectPath` 2. nearest package.json location 3. workspace folder.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `jestrunner.disableFrameworkConfig`         | If true, the extension will ignore any framework configuration files (e.g. jest.config.js, vitest.config.ts) and use the `jestrunner.defaultTestPatterns` instead.                                                                                                                                                                                                                                                                                                                                                                    |

This updated configuration table now includes the Node.js Test Runner settings.

</details>


<details>
<summary><b>📋 Supported Framework Config</b></summary>
<br>

The extension **automatically reads configuration** from your framework config files.

> ⚠️ **Important:** The extension uses **AST-based parsing** to read configuration files. It does **not** execute the file as JavaScript/TypeScript code.
> 
> This means:
> - It **cannot** resolve external variables, imports, `require`, or function calls.
> - Configuration options (roots, testMatch, etc.) must be **static literals** in the file.
> - Only a **single configuration file** is parsed. If you use config inheritance, ensure the file the extension reads contains the necessary patterns.
>
> If your configuration is too complex for this parser, you can set **`jestrunner.disableFrameworkConfig: true`**. This will disable config parsing and the extension will rely solely on `jestrunner.defaultTestPatterns` to identify test files.

> ⚠️ **Important:** `projects` attribute in vitest/jest config files is not yet supported but planned for a future release.

### Jest Config Options

| Option | Type | Description |
|--------|------|-------------|
| `rootDir` | `string` | Root directory for resolving paths |
| `roots` | `string[]` | Directories to search for test files (e.g., `["<rootDir>/src", "<rootDir>/tests"]`) |
| `testMatch` | `string[]` | Glob patterns for test files (e.g., `["**/*.test.ts"]`) |
| `testRegex` | `string \| string[]` | Regex patterns for test files |
| `testPathIgnorePatterns` | `string[]` | Regex patterns to exclude files (e.g., `["/fixtures/", "/node_modules/"]`) |

**Example Jest Config:**

```javascript
// jest.config.js
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/fixtures/', '/__mocks__/'],
};
```

### Vitest Config Options

| Option | Type | Description |
|--------|------|-------------|
| `root` | `string` | Project root directory |
| `test.dir` | `string` | Base directory for test file discovery |
| `test.include` | `string[]` | Glob patterns for test files (e.g., `["**/*.test.ts"]`) |
| `test.exclude` | `string[]` | Glob patterns to exclude (e.g., `["**/e2e/**"]`) |

**Example Vitest Config:**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  test: {
    dir: 'src',
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/fixtures/**'],
  },
});
```

### Node.js Native Runner

The Node.js test runner does not use a specific configuration file in the same way Jest or Vitest do. Instead, it relies on glob patterns or file naming conventions.

- By default, the extension looks for files matching: `**/*.{test,spec}.?(c|m)[jt]s?(x)` and `**/__tests__/**/*.?(c|m)[jt]s?(x)`.
- You can customize this by modifying `jestrunner.defaultTestPatterns` in your VS Code settings.

</details>


<details>
<summary><b>🔧 Advanced Configuration Examples</b></summary>
<br>

**Usage with CRA or similar abstractions**

Add the following command to settings:

```json
"jestrunner.jestCommand": "npm run test --",
"jestrunner.debugOptions": {
    "runtimeExecutable": "${workspaceRoot}/node_modules/.bin/react-scripts",
    "runtimeArgs": ["test", "${fileBasename}", "--runInBand", "--no-cache", "--watchAll=false"]
}
```

**nvm**

```json
"jestrunner.jestCommand": "nvm use && npm run test --",
"jestrunner.debugOptions": {
    "runtimeExecutable": "/PATH/TO/YOUR/node"
}
```

**ESM (ECMAScript Modules)**

ESM support is now opt-in. To enable it, set **"jestrunner.enableESM": true** in your settings. This will automatically add `--experimental-vm-modules` to `NODE_OPTIONS` for debugging.

</details>


<details>
<summary><b>🧪 Advanced Test Examples</b></summary>
<br>

The extension fully supports Jest's parameterized tests using `it.each` and `describe.each`. These allow you to run the same test logic with different inputs, making your tests more concise and maintainable.

In the test names, you can use **template variables** like `%s` (string), `%i` (integer), `%f` (float), etc., which Jest replaces with the actual parameter values for better readability.

**Jest Example**

```javascript
it.each([
  ['apple', 5],
  ['banana', 6],
  ['cherry', 6],
])('should return correct length for %s', (fruit, expectedLength) => {
  expect(fruit.length).toBe(expectedLength);
});
```

**Vitest Example**

```javascript
import { describe, it, expect } from 'vitest';

it.each([
  { input: 'hello', expected: 5 },
  { input: 'world', expected: 5 },
])('length of $input is $expected', ({ input, expected }) => {
  expect(input.length).toBe(expected);
});
```

**Dynamic Test Names**

You can also use dynamic test names derived from class method names:

```javascript
class TestClass {
  myFunction() {
  }
}
it(TestClass.prototype.myFunction.name, () => {
  expect(true).toBe(true);
});
```

</details>

<details>
<summary><b>⌨️ Keyboard Shortcuts</b></summary>
<br>

1. Open **Command Palette** → **Preferences: Open Keyboard Shortcuts (JSON)**
2. Add the following shortcuts:

```json
{
  "key": "alt+1",
  "command": "extension.runJest"
},
{
  "key": "alt+2",
  "command": "extension.debugJest"
},
{
  "key": "alt+3",
  "command": "extension.watchJest"
},
{
  "key": "alt+4",
  "command": "extension.runPrevJest"
}
```

</details>

## 🤝 Contributing

**Want to start contributing features?** Check out our [open issues](https://github.com/firsttris/vscode-jest-runner/issues) to get started!

### 🚀 Development Setup

1. **Clone the repository**
2. **Install dependencies**
3. **Start debugging**
   - Press `F5` or go to **Run** → **Start Debugging**
   - A new VS Code window will open with the extension loaded

---

<div align="center">

**Made by the open source community**

⭐ Star us on [GitHub](https://github.com/firsttris/vscode-jest-runner) • 🐛 [Report a Bug](https://github.com/firsttris/vscode-jest-runner/issues) • 💡 [Request a Feature](https://github.com/firsttris/vscode-jest-runner/issues)

</div>
