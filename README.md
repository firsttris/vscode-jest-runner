# vscode-jest-runner

## The Aim

Simple way to run or debug a single or multiple test(s) by right-clicking them.  
(As it is possible in IntelliJ / Webstorm)

## Features

Run your Jest Test's by right-clicking them....  
- Select a test name, right click it, select "Run Jest" from context menu 
- To run a test in Debug Mode select "Debug Jest" from context menu
    
![Extension Example](https://github.com/firsttris/vscode-jest/raw/master/public/vscode-jest.gif)

## Requirements

- Have [Jest](https://github.com/facebook/jest) installed as project dependency

## Extension Settings
By default jest uses the config from package.json with attribut "jest": {}, if you want to define a external config file use

- jestrunner.configPath - (optionally) define external jest-config.json path


## Known Issues

- Jest Debug throws error if external jest-config.json is defined  
```Error: Can't find a root directory while resolving a config file path.``` I didn't manage to create a vscode jest debug profile with external jest config file.
- Possibility to show the additional context menu items only while in a test file e.g. test.(js|ts). Currently its shown when text is selected, no matter which file.