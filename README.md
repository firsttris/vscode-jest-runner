<div align="center">

# 🧪 Jest & Vitest Runner

**Run and debug tests with ease, right from your editor**

![Extension Example](./public/screenshot.png)

[![Build](https://img.shields.io/github/actions/workflow/status/firsttris/vscode-jest-runner/master.yml?branch=master&label=Build&logo=github&style=flat-square)](https://github.com/firsttris/vscode-jest-runner/actions/workflows/master.yml)
[![VS Marketplace Version](https://vsmarketplacebadges.dev/version-short/firsttris.vscode-jest-runner.svg)](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)
[![Installs](https://vsmarketplacebadges.dev/installs-short/firsttris.vscode-jest-runner.svg)](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)
[![Rating](https://vsmarketplacebadges.dev/rating-short/firsttris.vscode-jest-runner.svg)](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)
[![Open VSX](https://img.shields.io/open-vsx/v/firsttris/vscode-jest-runner?label=Open%20VSX&style=flat-square)](https://open-vsx.org/extension/firsttris/vscode-jest-runner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Overview](#-overview) •
[Features](#-features) •
[Configuration](#️-configuration) •
[Keyboard Shortcuts](#️-keyboard-shortcuts) •
[Contributing](#-contributing)

</div>

---

## 🎯 Overview

A **lightweight** VS Code extension for running and debugging Jest and Vitest tests directly in your editor. Works **out-of-the-box** with minimal configuration.

> ✨ **What's New?** Try the new native Test Explorer with code coverage integration! Enable it by setting `"jestrunner.enableTestExplorer": true` in your VS Code settings.

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

- 🤖 **Automatic framework detection** - distinguishes between Jest and Vitest
- 🎚️ **Include/exclude patterns** for fine-grained control over which tests appear
- 📝 **Configurable test file patterns** to match your project conventions

</td>
<td width="50%">

### 💼 Project Flexibility

- 📦 **Monorepo support** for yarn & VS Code workspaces
- ⚙️ **Multiple configurations** with glob-based config resolution
- 🔌 **Yarn 2 Plug'n'Play** compatibility
- ⚛️ **Create React App** and similar abstraction layers

</td>
</tr>
</table>

## ⚙️ Configuration

### 📊 Coverage Support

The extension supports test coverage through VS Code's Test Explorer. When you run tests with coverage, the results are displayed directly in VS Code's coverage view.

<details>
<summary><b>📖 Click to expand coverage configuration details</b></summary>
<br>

#### 🔧 Prerequisites

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
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8", // or 'istanbul'
    },
  },
});
```

#### ▶️ Running Tests with Coverage

All coverage entry points use the same **Coverage** profile powered by VS Code's native coverage API.

**Coverage via Test Explorer**

- Click the "Coverage" button (shield icon) in the Test Explorer panel
- Coverage results appear in VS Code's Coverage panel (View → Testing → Show Coverage)
- Inline decorations in the editor show covered/uncovered lines

**Coverage via CodeLens / Command Palette**

- Use the CodeLens "Coverage" action (if enabled) above a test or suite
- Or run the Command Palette command: "Jest: Run Test with Coverage"
- Both invoke the same Coverage profile and report results through the Coverage panel and inline decorations (not a separate terminal-only profile)

</details>

### 🛠️ Extension Settings

Customize the test runner for your project:

<details>
<summary><b>📋 Click to view all settings</b></summary>
<br>

| Setting                                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core Configuration**                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.configPath`                     | Path to Jest config (relative to workspace folder, e.g. `jest-config.json`). Can be a string or a glob mapping object to support multiple Jest configs.<br><br>**Example with glob mapping:** `{"**/*.it.spec.ts": "./jest.it.config.js", "**/*.spec.ts": "./jest.unit.config.js"}` - The first matching glob is used, so specify more specific patterns first. Config path is relative to `jestrunner.projectPath` or workspace root. Use `jestrunner.useNearestConfig: true` to search up directories for the matching config file. |
| `jestrunner.projectPath`                    | Path to project directory. Can be absolute (e.g. `/home/me/project/sub-folder`) or relative to workspace root (e.g. `./sub-folder`).                                                                                                                                                                                                                                                                                                                                                                                                  |
| `jestrunner.jestCommand`                    | Define an alternative Jest command for projects using abstractions like Create React App (e.g. `npm run test --`).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `jestrunner.runOptions`                     | CLI options to add to Jest commands (e.g. `["--coverage", "--colors"]`). See [Jest CLI documentation](https://jestjs.io/docs/en/cli).                                                                                                                                                                                                                                                                                                                                                                                                 |
| `jestrunner.debugOptions`                   | Add or override VS Code debug configurations (e.g. `{ "args": ["--no-cache"] }`). Only applies when debugging tests.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Vitest Configuration**                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.vitestCommand`                  | Define an alternative Vitest command (default: `npx --no-install vitest`).                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `jestrunner.vitestConfigPath`               | Path to Vitest config (relative to workspace folder, e.g. `vitest.config.ts`). Can be a string or a glob mapping object similar to `configPath`.                                                                                                                                                                                                                                                                                                                                                                                      |
| `jestrunner.vitestRunOptions`               | CLI options to add to Vitest commands (e.g. `["--reporter=verbose"]`). See [Vitest CLI documentation](https://vitest.dev/guide/cli.html).                                                                                                                                                                                                                                                                                                                                                                                             |
| `jestrunner.vitestDebugOptions`             | Add or override VS Code debug configurations for Vitest (e.g. `{ "args": ["--no-cache"] }`). Only applies when debugging Vitest tests.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Test Detection & Filtering**              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.testFilePattern`                | Pattern to identify test files. Affects CodeLens, Test Explorer, and test detection. Default: `**/*.{test,spec}.{js,jsx,ts,tsx}`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `jestrunner.codeLensSelector`               | **Deprecated:** Use `jestrunner.testFilePattern` instead. This setting is kept for backward compatibility with versions prior to 0.4.80.                                                                                                                                                                                                                                                                                                                                                                                              |
| `jestrunner.include`                        | Glob patterns for files to include in test detection. When specified, disables automatic Jest detection in favor of explicit inclusion.                                                                                                                                                                                                                                                                                                                                                                                               |
| `jestrunner.exclude`                        | Glob patterns for files to exclude from test detection. When specified, disables automatic Jest detection in favor of explicit exclusion.                                                                                                                                                                                                                                                                                                                                                                                             |
| **UI Options**                              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.enableTestExplorer`             | Enable the Test Explorer integration using VS Code's Testing API. Shows tests in dedicated Test Explorer panel. Default: `false`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `jestrunner.enableCodeLens`                 | Bring back the old CodeLens feature with inline run/debug buttons (replaced by Test Explorer). Default: `true`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `jestrunner.disableCodeLens`                | **Deprecated:** Use `jestrunner.enableCodeLens` instead. This setting is kept for backward compatibility. Set `enableCodeLens` to `false` to disable CodeLens.                                                                                                                                                                                                                                                                                                                                                                        |
| `jestrunner.codeLens`                       | Specify which CodeLens actions to show when CodeLens is enabled. Options: `"run"`, `"debug"`, `"watch"`, `"coverage"`, `"current-test-coverage"`. Default: `["run", "debug"]`                                                                                                                                                                                                                                                                                                                                                         |
| `jestrunner.preserveEditorFocus`            | Keep focus on the editor instead of switching to the terminal when running tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Project Management**                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.checkRelativePathForJest`       | When resolving Jest location, check for package.json files instead of the node_modules folder.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `jestrunner.changeDirectoryToWorkspaceRoot` | Change directory before running tests. Priority order: 1. `projectPath` 2. nearest package.json location 3. workspace folder.                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Yarn PnP Support**                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `jestrunner.enableYarnPnpSupport`           | Enable support for Yarn 2 with Plug'n'Play package management.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `jestrunner.yarnPnpCommand`                 | Command for executing tests when using Yarn Plug'n'Play.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

</details>

### 🔧 Advanced Configuration Examples

<details>
<summary><b>📖 Click to view config examples for specific tools and scenarios</b></summary>
<br>

#### ⚛️ Usage with CRA or similar abstractions

Add the following command to settings:

```json
"jestrunner.jestCommand": "npm run test --",
"jestrunner.debugOptions": {
    "runtimeExecutable": "${workspaceRoot}/node_modules/.bin/react-scripts",
    "runtimeArgs": ["test", "${fileBasename}", "--runInBand", "--no-cache", "--watchAll=false"]
}
```

#### 🔄 nvm

```json
"jestrunner.jestCommand": "nvm use && npm run test --",
"jestrunner.debugOptions": {
    "runtimeExecutable": "/PATH/TO/YOUR/node"
}
```

#### 📦 ESM (ECMAScript Modules)

For projects requiring `--experimental-vm-modules`:

```json
"jestrunner.jestCommand": "npx cross-env NODE_OPTIONS=\"--experimental-vm-modules\" node 'node_modules/jest/bin/jest.js'",
"jestrunner.debugOptions": {
  "runtimeArgs": ["--experimental-vm-modules"]
}
```

> **Note:** `jestrunner.runOptions` passes arguments to Jest, not Node. Use `jestrunner.jestCommand` with `NODE_OPTIONS` for Node flags.

</details>

### Advanced Test Examples

<details>
<summary><b>🔄 Click to view Parameterized Test examples</b></summary>
<br>

The extension fully supports Jest's parameterized tests using `it.each` and `describe.each`. These allow you to run the same test logic with different inputs, making your tests more concise and maintainable.

In the test names, you can use **template variables** like `%s` (string), `%i` (integer), `%f` (float), etc., which Jest replaces with the actual parameter values for better readability.

#### Jest Example

```javascript
it.each([
  ["apple", 5],
  ["banana", 6],
  ["cherry", 6],
])("should return correct length for %s", (fruit, expectedLength) => {
  expect(fruit.length).toBe(expectedLength);
});
```

#### Vitest Example

```javascript
import { describe, it, expect } from "vitest";

it.each([
  { input: "hello", expected: 5 },
  { input: "world", expected: 5 },
])("length of $input is $expected", ({ input, expected }) => {
  expect(input.length).toBe(expected);
});
```

</details>

## ⌨️ Keyboard Shortcuts

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

## 🤝 Contributing

**Want to start contributing features?** Check out our [open issues](https://github.com/firsttris/vscode-jest-runner/issues) to get started!

### 🚀 Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/firsttris/vscode-jest-runner.git
   cd vscode-jest-runner
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start debugging**
   - Press `F5` or go to **Run** → **Start Debugging**
   - A new VS Code window will open with the extension loaded

---

<div align="center">

**Made by the open source community**

⭐ Star us on [GitHub](https://github.com/firsttris/vscode-jest-runner) • 🐛 [Report a Bug](https://github.com/firsttris/vscode-jest-runner/issues) • 💡 [Request a Feature](https://github.com/firsttris/vscode-jest-runner/issues)

</div>
