# vscode-playwright-test-runner

## Visual Studio Code Marketplace

[VisualStudio Marketplace](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-playwright-test-runner)
[Open VSX Registry](https://open-vsx.org/extension/sakamoto66/vscode-playwright-test-runner)

## Comparison with [vscode-jest](https://github.com/jest-community/vscode-jest)

[vscode-playwright-test-runner](https://github.com/sakamoto66/vscode-playwright-test-runner) is focused on running or debugging a specific test or test-suite, while [vscode-jest](https://github.com/jest-community/vscode-jest) is running your current test-suite everytime you change it.

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

add the following command to settings, to pass commandline arguments

```
"playwrightrunner.jestCommand": "npm run test --"
```

## Debugging JSX/TSX with CRA

for debugging JST/TSX with CRA you need to have a valid babel and jest config:

to add a `babel.config.js` with at least the following config

```
// babel.config.js
module.exports = {
    presets: [
      ["@babel/preset-env", { targets: { node: "current" } }],
      "babel-preset-react-app",
    ],
  };
```

add a `jest.config.js` with at least the following config

```
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

Jest Runner will work out of the box, with a valid Jest config.
If you have a custom setup use the following options to configure Jest Runner:

| Command | Description |
| --- | --- |
| playwrightrunner.playwrightConfigPath | Playwright config path (relative to ${workFolder} e.g. playwright-config.js) |
| playwrightrunner.playwrightPath | Absolute path to Playwright bin file (e.g. /usr/lib/node_modules/playwright/lib/cli/cli.js) |
| playwrightrunner.playwrightDebugOptions | Add or overwrite vscode debug configurations (only in debug mode) (e.g. `"playwrightrunner.playwrightDebugOptions": { "args": ["--no-cache"] }`) |
| playwrightrunner.playwrightRunOptions | Add CLI Options to the playwright Command (e.g. `"playwrightrunner.playwrightRunOptions": ["--coverage", "--colors"]`) <https://playwright.dev/docs/test-intro> |
| playwrightrunner.playwrightCommand | Define an alternative playwright command (e.g. for Create React App and similar abstractions) |
| playwrightrunner.jestConfigPath | Jest config path (relative to ${workFolder} e.g. jest-config.json) |
| playwrightrunner.jestPath | Absolute path to jest bin file (e.g. /usr/lib/node_modules/jest/bin/jest.js) |
| playwrightrunner.jestDebugOptions | Add or overwrite vscode debug configurations (only in debug mode) (e.g. `"playwrightrunner.jestDebugOptions": { "args": ["--no-cache"] }`) |
| playwrightrunner.jestRunOptions | Add CLI Options to the Jest Command (e.g. `"playwrightrunner.jestRunOptions": ["--coverage", "--colors"]`) <https://jestjs.io/docs/en/cli> |
| playwrightrunner.jestCommand | Define an alternative Jest command (e.g. for Create React App and similar abstractions) |
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
```

## Want to start contributing features?

[Some open topics get you started](https://github.com/firsttris/vscode-playwright-test-runner/issues)

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
