# vscode-jest-runner

## Visual Studio Code Marketplace

[firsttris.vscode-jest-runner](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner)

## The Aim

Simple way to run or debug a single or multiple **Jest-Tests** from context menu.  
*As it is possible in IntelliJ / Webstorm*

## Features

Run your Jest Tests from context-menu  

- right click your test and select **Run Jest** from context menu
- to run a test in debug mode use **Debug Jest**

![Extension Example](https://github.com/firsttris/vscode-jest/raw/master/public/vscode-jest.gif)

## Requirements

- Have a valid [Jest](https://github.com/facebook/jest) config
- Have [Jest](https://github.com/facebook/jest) installed globally or as project dependency

## Extension Settings

By default **Jest** finds config from `package.json` or if you `module.export = {}` in a `jest.config.js` file.

Jest Runner should work out of the box in most cases. In case needed you can configure it using the following options:

| Command | Description |
| --- | --- |
| jestrunner.configPath | Jest config path (relative to ${workFolder} e.g. jest-config.json) |
| jestrunner.jestPath | Absolute path to jest bin file (e.g. /usr/lib/node_modules/jest/bin/jest.js) |
| jestrunner.debugOptions | Add or overwrite vscode debug configurations (only in debug mode) (e.g. "jestrunner.debugOptions": { "args": ["--no-cache"] }) |
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

## Known Issues

- Breakspoints not working properly, add this to vscode config:

```javascript
"jestrunner.runOptions": {
    "args": ["--no-cache"],
    "sourcemaps": "inline",
    "disableOptimisticBPs": true,
}
```

## Want to start contributing features?

Here are some requested features:

- For Windows always default to Powershell for running tests.
- Ability to pass command line arguments to Jest (already implemented for Debug, missing for Run).
- Show vscode-jest-runner context menu items only while in a test file e.g. test.(js|ts). Currently its shown, no matter which file.
