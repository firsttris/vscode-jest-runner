# Jest & Vitest Runner Extension - Development Guide

## Architecture Overview

This VS Code extension provides dual test framework support (Jest & Vitest) through three execution modes:

1. **CodeLens Mode** ([TestRunnerCodeLensProvider.ts](../src/TestRunnerCodeLensProvider.ts)) - Legacy inline test runner using `parse()` from jest-editor-support
2. **Terminal Mode** ([testRunner.ts](../src/testRunner.ts)) - Direct terminal execution with command building
3. **Test Explorer Mode** ([TestController.ts](../src/TestController.ts)) - Native VS Code Testing API with coverage integration

**Key architectural decision**: The extension detects Jest vs Vitest per-file/per-package (see [testDetection.ts](../src/testDetection.ts)), enabling mixed monorepo support. Detection checks for `node_modules` binaries and config files, with caching.

## Critical Developer Workflows

### Build & Development
```bash
npm run watch        # Vite watch mode for development
npm run build        # Production build
npm run test         # Run Jest tests (uses jest.config.js)
```

**Important**: This project uses Vite for building (not tsc) - see [vite.config.ts](../vite.config.ts). Output goes to `dist/extension.js` as CommonJS.

### Testing
- Tests use Jest (see [jest.config.js](../jest.config.js)) despite being a Jest/Vitest runner extension
- VS Code API is mocked at [src/test/__mocks__/vscode.ts](../src/test/__mocks__/vscode.ts) 
- All test files match `src/test/**/*.test.ts`
- Mock setup uses Jest/Vitest's alias feature to replace `vscode` imports

### Debugging Extension
Press F5 to launch Extension Development Host. The extension activates on `onStartupFinished` (see [package.json](../package.json) contributions).

## Project-Specific Patterns

### Configuration Resolution
Config path resolution supports **glob-based mapping** for multi-config scenarios:
```typescript
// From testRunnerConfig.ts - resolveConfigPathOrMapping()
"jestrunner.configPath": {
  "**/*.it.spec.ts": "./jest.it.config.js",
  "**/*.spec.ts": "./jest.unit.config.js"
}
```
First matching glob wins. Set `useNearestConfig: true` to search up directory tree.

### Test Name Parsing & Escaping
- `parse()` from jest-editor-support returns ParsedNode AST of test structure
- Test names with template literals need `resolveTestNameStringInterpolation()` (util.ts)
- Test names with properties like `test.each()` use `updateTestNameIfUsingProperties()` 
- **Critical**: RegExp special chars must be escaped via `escapeRegExp()` for `-t` flag matching
- Shell quoting handled by `quote()`/`unquote()` utilities (platform-aware)

### Yarn 2 PnP Detection
Auto-detected in [testRunnerConfig.ts](../src/testRunnerConfig.ts#L23-L41) via `.yarn/releases/yarn-*.cjs` presence. Commands are wrapped with detected yarn binary when PnP is active.

### Framework Detection Algorithm (testDetection.ts)
1. Check cache first
2. Search up directory tree for:
   - Vitest: `vitest.config.*` with `test:` attribute OR vite config with test attribute
   - Jest: `jest.config.*` files (see JEST_CONFIG_FILES in constants.ts)
3. Binary existence check in `node_modules/.bin/`
4. Cache result per directory

### Coverage Integration
- Uses VS Code's native `vscode.FileCoverage` API (1.59+)
- Reads `coverage/coverage-final.json` (Istanbul format)
- [CoverageProvider.ts](../src/coverageProvider.ts) converts to VS Code's TestCoverageCount
- `loadDetailedCoverage` provides line-by-line coverage with statement/branch decorations

## Extension Configuration

Key settings (see [package.json](../package.json) contributions):
- `jestrunner.enableTestExplorer` - Toggle new Test Explorer vs CodeLens (default: false)
- `jestrunner.configPath`/`vitestConfigPath` - Config resolution (string or glob object)
- `jestrunner.projectPath` - Override workspace root for monorepos
- `jestrunner.changeDirectoryToWorkspaceRoot` - CWD behavior (priority: projectPath → nearest package.json → workspace)
- `jestrunner.runOptions`/`vitestRunOptions` - Additional CLI flags array

## Common Patterns

### Command Registration
All commands use `wrapCommandHandler()` (extension.ts) for consistent error handling and user-facing error messages.

### Test Detection in Files
`shouldIncludeFile()` (util.ts) checks against test patterns from framework configs using micromatch. Sets `jestrunner.isJestFile` context for menu visibility.

### Logging
Use `logInfo()`/`logError()`/`logDebug()` from util.ts. Debug logs gated by `jestrunner.enableDebugLogs` setting. Output channel: "Jest Runner".

## External Dependencies
- `jest-editor-support` - Test AST parsing (critical for CodeLens/Test Explorer)
- `micromatch` - Glob pattern matching for test detection and config resolution
- `fast-glob` - Workspace file discovery for Test Explorer

## Code Organization
- [extension.ts](../src/extension.ts) - Entry point, command registration, context setup
- [testRunner.ts](../src/testRunner.ts) - Terminal-based test execution
- [TestController.ts](../src/TestController.ts) - Test Explorer integration (~1000 LOC)
- [testRunnerConfig.ts](../src/testRunnerConfig.ts) - Configuration reading and command building
- [parser.ts](../src/parser.ts) - Thin wrapper around jest-editor-support
- [testDetection.ts](../src/testDetection.ts) - Framework detection logic with caching
- [util.ts](../src/util.ts) - Shared utilities for path handling, escaping, test name resolution

## Testing Conventions
- Mock VS Code API completely (no partial mocks)
- Use `jest.fn()` for tracking calls despite using Vitest (compatibility with examples)
- Test file structure mirrors src/ directory
- Focus on config resolution, command building, and framework detection edge cases
