# vscode-jest-runner

## The Aim

Simple way to run or debug a single or multiple test(s) by right-clicking them.  
(as it is possible in Webstorm)

## Features

To run your Jest test by right-clicking them....  
- Select a test name, right click it, select "Run Jest" from context menu 
- To run a test in Debug Mode select "Debug Jest" from context menu
    
![Extension Example](https://github.com/firsttris/vscode-jest/raw/master/public/vscode-jest.gif)

## Requirements

- Have [Jest](https://github.com/facebook/jest) installed as project dependency
- Have a test task/job in your package.json which starts jest
```json
"scripts": {
    "test": "jest"
}
```

## Extension Settings

TBD

## Known Issues

Possibility to show the additional context menu items only while in a test file e.g. test.(js|ts).
Currently its shown when text is selected, no matter which file.

## Release Notes

Users appreciate release notes as you update your extension.

### 0.0.1

Initial release vscode-jest-runner