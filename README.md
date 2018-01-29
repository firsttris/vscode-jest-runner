# vscode-jest-runner

## The Aim

Simple way to run or debug a single or multiple test(s) by right-clicking them.  
(as it is possible in IntelliJ / Webstorm)

## Features

Run your Jest Test's by right-clicking them....  
- Select a test name, right click it, select "Run Jest" from context menu 
- To run a test in Debug Mode select "Debug Jest" from context menu
    
![Extension Example](https://github.com/firsttris/vscode-jest/raw/master/public/vscode-jest.gif)

## Requirements

- Have [Jest](https://github.com/facebook/jest) installed as project dependency

## Extension Settings
by default jest is uses the config from package.json

- jestrunner.configPath - (optionally) define jest config path


## Known Issues

Possibility to show the additional context menu items only while in a test file e.g. test.(js|ts).
Currently its shown when text is selected, no matter which file.