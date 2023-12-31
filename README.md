# vscode-jest-runner

Looking for collaborators to help me maintain the project. Please contact me at tristanteufel@gmail.com

## Visual Studio Code Marketplace

[VisualStudio Marketplace](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)
[Open VSX Registry](https://open-vsx.org/extension/firsttris/vscode-jest-runner)

## Comparison with [vscode-jest](https://github.com/jest-community/vscode-jest)

[vscode-jest-runner](https://github.com/firsttris/vscode-jest-runner) is focused on running or debugging a specific test or test-suite, while [vscode-jest](https://github.com/jest-community/vscode-jest) is running your current test-suite everytime you change it.

## Features

Simple way to run or debug a specific test
*As it is possible in IntelliJ / Webstorm*

Run & Debug your Jest Tests from
- Context-Menu
- CodeLens
- Command Palette (strg+shift+p)

## Supports
- yarn & vscode workspaces (monorepo)
- dynamic jest config resolution
- yarn 2 pnp
- CRA & and similar abstractions

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

| Command                                   | Description                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jestrunner.configPath                     | Jest config path (relative to `${workspaceFolder}` e.g. jest-config.json)                                                                                   |
| jestrunner.jestPath                       | Absolute path to jest bin file (e.g. /usr/lib/node_modules/jest/bin/jest.js)                                                                                |
| jestrunner.debugOptions                   | Add or overwrite vscode debug configurations (only in debug mode) (e.g. `"jestrunner.debugOptions": { "args": ["--no-cache"] }`)                            |
| jestrunner.runOptions                     | Add CLI Options to the Jest Command (e.g. `"jestrunner.runOptions": ["--coverage", "--colors"]`) https://jestjs.io/docs/en/cli                              |
| jestrunner.jestCommand                    | Define an alternative Jest command (e.g. for Create React App and similar abstractions)                                                                     |
| jestrunner.disableCodeLens                | Disable CodeLens feature                                                                                                                                    |
| jestrunner.codeLensSelector               | CodeLens will be shown on files matching this pattern (default **/*.{test,spec}.{js,jsx,ts,tsx})                                                            |
| jestrunner.codeLens                       | Choose which CodeLens to enable, default to `["run", "debug"]`                                                                                              |
| jestrunner.enableYarnPnpSupport           | Enable if you are using Yarn 2 with Plug'n'Play                                                                                                             |
| jestrunner.yarnPnpCommand                 | Command for debugging with Plug'n'Play defaults to yarn-*.*js                                                                                               |
| jestrunner.projectPath                    | Absolute path to project directory (e.g. /home/me/project/sub-folder), or relative path to workspace root (e.g. ./sub-folder)                               |
| jestrunner.changeDirectoryToWorkspaceRoot | Changes directory before execution. The order is:<ol><li>`jestrunner.projectPath`</li><li>the nearest `package.json`</li><li>`${workspaceFolder}`</li></ol> |
| jestrunner.preserveEditorFocus            | Preserve focus on your editor instead of focusing the terminal on test run                                                                                  |
| jestrunner.runInExternalNativeTerminal    | run in external terminal (requires: npm install ttab -g)                                                                                                    |

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
