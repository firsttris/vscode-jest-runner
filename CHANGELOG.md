# Change Log

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
