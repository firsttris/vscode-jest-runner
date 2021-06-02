# Change Log


## 0.4.36 - 2021-06-02

### Added

- Add explorer menus to run and debug tests with jest #149
- chore: use eslint vs. tslint #178

### Fixed 

- escape special characters in test filepath (#114) #162
- Keep Run/Debug buttons shown when failed to parse document #163

## 0.4.34 - 2021-04-11

### Fixed

- auto detect project path with jest binary #156
- add option to command palette to update snapshots #152
- remove run jest file from context menu (still available in command palette strg + shift + p)
- add option changeDirectoryToWorkspaceRoot to enable/disable changing directory to workspace root before executing the test

## 0.4.33 - 2021-04-06

### Fixed

- resolve jest test name string interpolation for test pattern such as test.each #148
- Parameterised test support and deps cleanup #146
- Escape plus sign in file path #140

## 0.4.31 - 2020-10-26

### Fixed

- Escape single quotes on Testnames (Linux)

## 0.4.29 - 2020-10-26

### Remove

- Dynamic resolution of ProjectPath

## 0.4.28 - 2020-10-24

### Added

- Dynamic resolution of ProjectPath

## 0.4.27 - 2020-10-14

### Added

- Dynamic Jest config (jest.config.js) resolution (monorepo)

## 0.4.24 - 2020-09-16

### Added

- Yarn 2 Pnp Support
- Ability to define fixed ProjectPath instead of workspaceFolder (monorepo)

## 0.4.22 - 2020-06-05

### Added

- add new settings codeLensSelector which enables CodeLens for files matching this pattern (default **/*.{test,spec}.{js,jsx,ts,tsx})

## 0.4.21 - 2020-06-02

### Added

 - debug Jest CodeLens option

## 0.4.20 - 2020-06-02

### Added

- change CodeLens filename pattern to *.test.ts,*.test.js,*.test.tsx,*.test.jsx
- add Settings to disable CodeLens

## 0.4.19 - 2020-05-28

### Added

- CodeLens option to start Tests

## 0.4.18 - 2020-05-22

### Added

- Added option to run jest file with coverage to the command palette

### Fixed
- Reduced bundle size
- Run test outside a describe block

## 0.4.17 - 2020-05-07

### Fixed

- powershell not working due to &&

## 0.4.16 - 2020-05-07

### Fixed

- run previous test is just cd-ing when last run was debug

## 0.4.12 - 2020-01-20

### Fixed

- remove ExactRegexMatch approach due to to many issues
- fix Commandline on Windows10

## 0.4.11 - 2019-12-20

### Fixed

- Ability to start Test by clicking anywhere inside the line-range

### Changed

- Changed build to Webpack bundle

## 0.4.9 - 2019-12-16

### Added

- integrated jest parser of jest-editor-support
- Warning about incorrect config

## 0.4.7 - 2019-12-14

### Fixed

- Fix dependency Issue

## 0.4.5 - 2019-12-13

### Changed

- Removed icon from context menu entry

## 0.4.4 - 2019-12-13

### Added

- Add ability to add CLI Options to run Jest command with jestrunner.runOptions

## 0.4.3 - 2019-12-13

### Fixed

- Support for Workspaces for Run and Debug Mode
- Overlapping Test Names
- Escape Special Characters

## 0.4.2 - 2019-10-19
 
### Changed 

- Extended Readme.

## 0.4.0 - 2019-10-19

### Added

- Context menu icon.

### Changed

- Deprecated `jestrunner.runOptions` option in favor of `jestrunner.debugOptions`.

### Fixed

- Debug Jest fails for CMD and GIT bash ([#38](https://github.com/firsttris/vscode-jest-runner/issues/38)).

## 0.0.1 - 2017-12-29

- Initial release

---

The file format is based on [Keep a Changelog](http://keepachangelog.com/).
