# vscode-jest-runner

## Visual Studio Code Marketplace

[Go to Marketplace](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)

## The Aim

Simple way to run or debug a single or multiple **Jest-Tests** from context menu.  
*As it is possible in IntelliJ / Webstorm*

## Features

Run your Jest Tests from context-menu  

- right click your test and select **Run Jest** from context menu
- to run a test in debug mode use **Debug Jest**
- CodeLens options to start Tests!
- run previous test from command palette (strg+shift+p)
- supports yarn & vscode workspaces (monorepo)
- works with CRA & react-scripts!

![Extension Example](https://github.com/firsttris/vscode-jest/raw/master/public/vscode-jest.gif)

## Usage with Create-React-App or React-Scripts

add this to settings.json
```
"jestrunner.jestCommand": "npm run test --"
```

## Requirements

- Have a valid [Jest](https://github.com/facebook/jest) config
- Have [Jest](https://github.com/facebook/jest) installed globally or as project dependency

## Extension Settings

Jest Runner will work out of the box, with a valid Jest config.   
If you have a custom setup use the following options to configure Jest Runner:

| Command | Description |
| --- | --- |
| jestrunner.configPath | Jest config path (relative to ${workFolder} e.g. jest-config.json) |
| jestrunner.jestPath | Absolute path to jest bin file (e.g. /usr/lib/node_modules/jest/bin/jest.js) |
| jestrunner.debugOptions | Add or overwrite vscode debug configurations (only in debug mode) (e.g. `"jestrunner.debugOptions": { "args": ["--no-cache"] }`) |
| jestrunner.runOptions | Add CLI Options to the Jest Command (e.g. `"jestrunner.runOptions": ["--coverage", "--colors"]`) https://jestjs.io/docs/en/cli |
| jestrunner.jestCommand | Define an alternative Jest command (e.g. for Create React App and similar abstractions) |

## Shortcuts

click File -> Preferences -> Keyboard Shortcuts -> "{}" (top right)
the json config file will open
add this:

```javascript
{
  "key": "alt+1",
  "command": "extension.runJest"
},
{
  "key": "alt+2",
  "command": "extension.debugJest"
},
```

## Want to start contributing features?

[Some open topics get you started](https://github.com/firsttris/vscode-jest-runner/issues)

## Steps to run in development mode

- npm install
- npm run compile
- Go to Menu "Run" => "Start Debugging"

Another vscode instance will open with the just compiled extension installed.

## Notes

- By default **Jest** finds its config from the `"jest"` attribute in your `package.json` or if you export an object `module.export = {}` in a `jest.config.js` file in your project root directory.   
Read More: [Configuring Jest Docs](https://jestjs.io/docs/en/configuration)

- If Breakspoints are not working properly, try adding this to vscode config:

```javascript
"jestrunner.debugOptions": {
    "args": ["--no-cache"],
    "sourcemaps": "inline",
    "disableOptimisticBPs": true,
}
```
