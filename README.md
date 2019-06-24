# vscode-jest-runner

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

But if you need to define a external config file use the following config options:

| Command | Description |
| --- | --- |
| jestrunner.configPath | Define an external jest-config path to jest (from ${workFolder} e.g. jest-config.json) |
| jestrunner.jestPath | Define an absolute path to jest (e.g. /usr/lib/node_modules/jest/bin/jest.js) |
| jestrunner.runOptions | Add or overwrite VScode run options in settings.json  (e.g. "jestrunner.runOptions": { "args": ["--no-cache"] }) |
| jestrunner.jestCommand | Define an alternative Jest command (e.g. for Create React App and similar abstractions) |

## Shortcuts

click File -> Preferences -> Keyboard Shortcuts -> "{}" (top right)
the json config file will open
add this:
````
{
  "key": "alt+1",
  "command": "extension.runJest"
},
{
  "key": "alt+2",
  "command": "extension.debugJest"
},
````

## Known Issues

- Breakspoints not working properly, add this to vscode config:

````
"jestrunner.runOptions": {
    "args": ["--no-cache"],
    "sourcemaps": "inline",
    "disableOptimisticBPs": true,
}
````

- Possibility to show the additional context menu items only while in a test file e.g. test.(js|ts). Currently its shown, no matter which file.
