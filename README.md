# Playwright Test Runner

Running or debugging a specific test or test-suite by playwright.

[VisualStudio Marketplace](https://marketplace.visualstudio.com/items?itemName=sakamoto66.vscode-playwright-test-runner)

## Features

Simple way to run or debug a specific test
*As it is possible in IntelliJ / Webstorm*

Run, Debug and Inspect your Playwright and Jest Tests from

- Context-Menu
- CodeLens
- Command Palette [ strg(ctrl) + shift + p ]

## Supports

- yarn & vscode workspaces (monorepo)
- dynamic jest config resolution  
- yarn 2 pnp
- CRA & and similar abstractions

![Extension Example](https://github.com/firsttris/vscode-jest/raw/master/public/vscode-jest.gif)

## Usage with CRA or similar abstractions

add the following command to settings, to pass commandline arguments

- for playwright

```javascript
"playwrightrunner.playwrightCommand": "npm run test --"
```

- for jest

```javascript
"playwrightrunner.jestCommand": "npm run test --"
```

## Debugging JSX/TSX with CRA

for debugging JST/TSX with CRA you need to have a valid babel and jest config:

to add a `babel.config.js` with at least the following config

```javascript
// babel.config.js
module.exports = {
    presets: [
      ["@babel/preset-env", { targets: { node: "current" } }],
      "babel-preset-react-app",
    ],
  };
```

add a `jest.config.js` with at least the following config

```javascript
module.exports = {
  transform: {
    '\\.(js|ts|jsx|tsx)$': 'babel-jest',
    '\\.(jpg|jpeg|png|gif|ico|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga|webmanifest|xml)$':
      '<rootDir>/jest/fileTransformer.js'
  },
  moduleNameMapper: {
    '\\.(css)$': 'identity-obj-proxy'
  },
}
```

Check that debugger works:
![image](https://user-images.githubusercontent.com/1709260/120468727-d542ae00-c3a1-11eb-85ac-986c35ac167f.png)

## Extension Settings

Playwright Test Runner will work out of the box, with a valid Jest config.
If you have a custom setup use the following options to configure Playwright Test Runner:

### Variable

sample : `/workspace/packages/sample/tests/test.spec.js`

| Variable | Description | sample |
| --- | --- | --- |
|`${workspaceRoot}`|the path of the project opened in vscode.| /workspace |
|`${packageRoot}`|the path of directory with package.json.| /workspace/packages/sample |
|`${currentFile}`|the current file | /workspace/packages/sample/tests/test.spec.js |
|`${fileBasename}`|the current file name with ext.| test.spec.js |
|`${fileBasenameNoExtension}`|the current file name without ext.| test.spec |
|`${fileExtname}`|the current file name with ext.| .js |
|`${fileDirname}`|the current file name with ext.| /workspace/packages/sample/tests |

### Command for playwright

| Command | Description |
| --- | --- |
| playwrightrunner.playwrightCommand | Define an alternative playwright command (e.g. for Create React App and similar abstractions) |
| playwrightrunner.playwrightPath | Absolute path to Playwright bin file (e.g. /usr/lib/node_modules/playwright/lib/cli/cli.js) |
| playwrightrunner.playwrightConfigPath | Playwright config path (relative to ${packageRoot} e.g. playwright-config.js) |
| playwrightrunner.playwrightRunOptions | Add CLI Options to the playwright Command (e.g. `"playwrightrunner.playwrightRunOptions": ["--coverage", "--colors"]`) <https://playwright.dev/docs/test-intro> |
| playwrightrunner.playwrightDebugOptions | Add or overwrite vscode debug configurations (only in debug mode) (e.g. `"playwrightrunner.playwrightDebugOptions": { "args": ["--no-cache"] }`) |

### Command for jest

| Command | Description |
| --- | --- |
| playwrightrunner.jestCommand | Define an alternative Jest command (e.g. for Create React App and similar abstractions) |
| playwrightrunner.jestPath | Absolute path to jest bin file (e.g. /usr/lib/node_modules/jest/bin/jest.js) |
| playwrightrunner.jestConfigPath | Jest config path (relative to ${workFolder} e.g. jest-config.json) |
| playwrightrunner.jestRunOptions | Add CLI Options to the Jest Command (e.g. `"playwrightrunner.jestRunOptions": ["--coverage", "--colors"]`) <https://jestjs.io/docs/en/cli> |
| playwrightrunner.jestDebugOptions | Add or overwrite vscode debug configurations (only in debug mode) (e.g. `"playwrightrunner.jestDebugOptions": { "args": ["--no-cache"] }`) |

### Command for common

| Command | Description |
| --- | --- |
| playwrightrunner.disableCodeLens | Disable CodeLens feature |
| playwrightrunner.codeLensSelector | CodeLens will be shown on files matching this pattern (default **/*.{test,spec}.{js,jsx,ts,tsx}) |
| playwrightrunner.enableYarnPnpSupport | Enable if you are using Yarn 2 with Plug'n'Play |
| playwrightrunner.projectPath | Absolute path to project directory (e.g. /home/me/project/sub-folder) |
| playwrightrunner.changeDirectoryToWorkspaceRoot | Changes directory to workspace root before executing the test |

## Shortcuts

click File -> Preferences -> Keyboard Shortcuts -> "{}" (top right)
the json config file will open
add this:

```javascript
{
  "key": "alt+1",
  "command": "playwrightrunner.runTest"
},
{
  "key": "alt+2",
  "command": "playwrightrunner.debugTest"
},
{
  "key": "alt+3",
  "command": "playwrightrunner.inspectorTest"
},
```

## Want to start contributing features?

[Some open topics get you started](https://github.com/sakamoto66/vscode-playwright-test-runner/issues)

## Steps to run in development mode

- npm install
- Go to Menu "Run" => "Start Debugging"

Another vscode instance will open with the just compiled extension installed.

## Notes from contributors

- Babel compile Issue when starting Debug in JSX/TSX,
  - check the post of @Dot-H <https://github.com/firsttris/vscode-playwright-test-runner/issues/136>
  - <https://github.com/firsttris/vscode-playwright-test-runner/issues/174>

- By default **Jest** finds its config from the `"jest"` attribute in your `package.json` or if you export an object `module.export = {}` in a `jest.config.js` file in your project root directory.
Read More: [Configuring Jest Docs](https://jestjs.io/docs/en/configuration)

- If Breakspoints are not working properly, try adding this to vscode config:

```javascript
"playwrightrunner.jestDebugOptions": {
    "args": ["--no-cache"],
    "sourcemaps": "inline",
    "disableOptimisticBPs": true,
}
```
