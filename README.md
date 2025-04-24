# vscode-jest-runner

Looking for collaborators to help me maintain the project. Please contact me at tristanteufel@gmail.com

## Visual Studio Code Marketplace

[VisualStudio Marketplace](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)    
[Open VSX Registry](https://open-vsx.org/extension/firsttris/vscode-jest-runner)

## Comparison with [vscode-jest](https://github.com/jest-community/vscode-jest)

[vscode-jest-runner](https://github.com/firsttris/vscode-jest-runner) is focused on running or debugging a specific test or test-suite, while [vscode-jest](https://github.com/jest-community/vscode-jest) is running your current test-suite everytime you change it.

## Features

Jest Runner provides a powerful, flexible way to run and debug Jest tests directly from VS Code.

### 🚀 Run & Debug Experience
- **Run individual tests** or entire test suites with a single click
- **Debug tests** with full breakpoint and variable inspection support
- **Generate coverage reports** to analyze test coverage
- **Watch mode** for automatic test re-runs during development
- **Snapshot updating** with dedicated command

### 📋 Multiple Access Points
- **Context menu** in editor and explorer (right-click on tests)
- **CodeLens** annotations above test definitions (optional)
- **Test Explorer** integration showing test hierarchy in dedicated panel
- **Command palette** (Ctrl+Shift+P) with full command access
- **Keyboard shortcuts** for quick test execution

### 🔍 Smart Test Detection
- **Automatic framework detection** distinguishes Jest from Cypress/Playwright/Vitest
- **Include/exclude patterns** for fine-grained control over which tests appear
- **Configurable test file patterns** to match your project conventions

### 💼 Project Flexibility
- **Monorepo support** for yarn & VS Code workspaces
- **Multiple Jest configurations** with dynamic resolution based on file paths
- **Yarn 2 Plug'n'Play** compatibility
- **Create React App** and similar abstraction layers
- **Custom commands** for specialized test environments

### ⚙️ Highly Configurable
- Choose between CodeLens, Test Explorer, or both
- Customize test commands with additional CLI options
- Configure specialized debug configurations

![Extension Example](https://github.com/firsttris/vscode-jest/raw/master/public/vscode-jest.gif)

## Usage with CRA or similar abstractions

add the following command to settings:
```json
"jestrunner.jestCommand": "npm run test --",
"jestrunner.debugOptions": {
    "runtimeExecutable": "${workspaceRoot}/node_modules/.bin/react-scripts",
    "runtimeArgs": [
      "test",
      "${fileBasename}",
      "--runInBand",
      "--no-cache",
      "--watchAll=false",
      "--color"
    ]
},
```

## Extension Settings

Jest Runner will work out of the box, with a valid Jest config.
If you have a custom setup use the following options to customize Jest Runner:

| Setting                                 | Description                                                                                                                                                                                           |
|----------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Core Configuration**                  |                                                                                                                                                                                                       |
| `jestrunner.configPath`                 | Path to Jest config (relative to workspace folder, e.g. `jest-config.json`). Can be a string or a glob mapping object to support multiple Jest configs. See mapping details below. |
| `jestrunner.projectPath`                | Path to project directory. Can be absolute (e.g. `/home/me/project/sub-folder`) or relative to workspace root (e.g. `./sub-folder`).                                                                   |
| `jestrunner.jestCommand`                | Define an alternative Jest command for projects using abstractions like Create React App (e.g. `npm run test --`).                                                                                      |
| `jestrunner.runOptions`                 | CLI options to add to Jest commands (e.g. `["--coverage", "--colors"]`). See [Jest CLI documentation](https://jestjs.io/docs/en/cli).                                                                  |
| `jestrunner.debugOptions`               | Add or override VS Code debug configurations (e.g. `{ "args": ["--no-cache"] }`). Only applies when debugging tests.                                                                                    |
| **Test Detection & Filtering**          |                                                                                                                                                                                                       |
| `jestrunner.testFilePattern`            | Pattern to identify test files. Affects CodeLens, Test Explorer, and test detection.                                                                                                                   |
| `jestrunner.include`                    | Glob patterns for files to include in test detection. When specified, disables automatic Jest detection in favor of explicit inclusion.                                                                 |
| `jestrunner.exclude`                    | Glob patterns for files to exclude from test detection. When specified, disables automatic Jest detection in favor of explicit exclusion.                                                               |
| **UI Options**                          |                                                                                                                                                                                                       |
| `jestrunner.enableCodeLens`             | Enable CodeLens annotations in test files for quick test execution directly from the editor.                                                                                                            |
| `jestrunner.enableTestExplorer`         | Enable Test Explorer integration using VS Code's Testing API, showing tests in the dedicated Test Explorer view.                                                                                        |
| `jestrunner.codeLens`                   | Specify which CodeLens actions to show. Options: `"run"`, `"debug"`, `"watch"`, `"coverage"`, `"current-test-coverage"`.                                                                               |
| `jestrunner.preserveEditorFocus`        | Keep focus on the editor instead of switching to the terminal when running tests.                                                                                                                      |
| **Project Management**                  |                                                                                                                                                                                                       |
| `jestrunner.checkRelativePathForJest`   | When resolving Jest location, check for package.json files instead of the node_modules folder.                                                                                                     |
| `jestrunner.changeDirectoryToWorkspaceRoot` | Change directory before running tests. Priority order: 1. `projectPath` 2. nearest package.json location 3. workspace folder.                                                                         |
| **Yarn PnP Support**                    |                                                                                                                                                                                                       |
| `jestrunner.enableYarnPnpSupport`       | Enable support for Yarn 2 with Plug'n'Play package management.                                                                                                                                        |
| `jestrunner.yarnPnpCommand`             | Command for executing tests when using Yarn Plug'n'Play.                                                                                                                                                                                                                                                                                      
For advanced topics like configuring multiple Jest configurations with glob mappings, see the configPath as glob map section below.

### configPath as glob map
If you've got multiple jest configs for running tests (ie maybe a config for unit tests, integration tests and frontend tests) then this option is for you. You can provide a map of glob matchers to specify which jest config to use based on the name of the file the test is being run for. 

For instance, supose you're using the naming convention of `*.spec.ts` for unit tests and `*.it.spec.ts` for integration tests. You'd use the following for your configPath setting:
```json
{
  "jestrunner.configPath": {
    "**/*.it.spec.ts": "./jest.it.config.js",
    "**/*.spec.ts": "./jest.unit.config.js"
  }
}
```
Note the order we've specified the globs in this example. Because our naming convention has a little overlap, we need to specify the more narrow glob first because jestrunner will return the config path of the first matching glob. With the above order, we make certain that `jest.it.config.js` will be used for any file ending with `.it.spec.ts` and `jest.unit.config.js` will be used for files that only end in `*.spec.ts` (without `.it.`).  If we had reversed the order, `jest.unit.config.js` would be used for both `*.it.spec.ts` and `*.spec.ts` endings the glob matches both. 

## Shortcuts

Command Pallette -> Preferences: Open Keyboard Shortcuts (JSON)
the json config file will open
add this:

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

## Want to start contributing features?

[Check some open topics get you started](https://github.com/firsttris/vscode-jest-runner/issues)

### Steps to run Extension in development mode

- Clone Repo
- npm install
- Go to Menu "Run" => "Start Debugging"

Another vscode instance will open with the just compiled extension installed.
