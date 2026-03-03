# Jest Runner Extension - Development Guide

## Architecture Overview

This extension is now a **multi-framework test runner** for:

- Jest
- Vitest
- Node.js native test runner (`node:test`)
- Bun
- Deno
- Playwright

Execution is provided through three entry points:

1. **CodeLens Mode** ([TestRunnerCodeLensProvider.ts](../src/TestRunnerCodeLensProvider.ts))
   - Legacy inline actions (run/debug/watch/coverage).
2. **Terminal Mode** ([testRunner.ts](../src/testRunner.ts))
   - Builds framework-specific command + args and executes via [TerminalManager.ts](../src/TerminalManager.ts).
3. **Test Explorer Mode** ([TestController.ts](../src/TestController.ts))
   - Native VS Code Testing API with run/debug/coverage profiles and hierarchical discovery.

Key architectural decision: framework selection is **file-aware** and **directory-aware**, implemented under [src/testDetection](../src/testDetection). Detection combines imports/content heuristics, config files, dependency/binary checks, and pattern matching.

## Critical Developer Workflows

### Build & Development

```bash
npm run watch        # Vite watch mode for extension bundle
npm run build        # Production build
npm run test         # Jest test suite (src/test)
```

Important:

- Build uses Vite (see [vite.config.ts](../vite.config.ts)), not `tsc` directly.
- Extension entry output is `dist/extension.js`.

### Testing

- Test runner for this repository is Jest (see [jest.config.js](../jest.config.js)).
- VS Code API is fully mocked in [src/test/**mocks**/vscode.ts](../src/test/__mocks__/vscode.ts).
- Tests live under `src/test/**/*.test.ts`.

### Debugging the Extension

Press `F5` to launch Extension Development Host. Activation is `onStartupFinished` (see [package.json](../package.json)).

## Project-Specific Patterns

### Framework Adapters (single source for CLI arg generation)

Use [frameworkAdapters.ts](../src/frameworkAdapters.ts) for command argument building. It contains per-framework builders for:

- `jest` (`-c`, `-t`)
- `vitest` (`run`, `--config`, `-t`)
- `node-test` (`--test`, `--test-name-pattern`, structured/coverage reporters)
- `bun` (`bun test`, coverage flags)
- `deno` (`deno test`, `--filter`, `--junit-path`, coverage)
- `playwright` (`test`, `-g`)

When adding/changing a framework, update adapters first, then config/debug wiring.

### Configuration Resolution

Configuration resolution is centralized in [ConfigResolver.ts](../src/ConfigResolver.ts):

- Supports string path or glob mapping for `jestrunner.configPath` and `jestrunner.vitestConfigPath`.
- Uses first glob match.
- Supports `jestrunner.useNearestConfig` for upward directory search.
- Caches resolved paths via [cache/CacheManager.ts](../src/cache/CacheManager.ts).

### Test Detection & Discovery

- Framework detection logic: [testDetection/frameworkDetection.ts](../src/testDetection/frameworkDetection.ts)
- File classification and pattern resolution: [testDetection/testFileDetection.ts](../src/testDetection/testFileDetection.ts)
- Cached file-level decisions: [testDetection/testFileCache.ts](../src/testDetection/testFileCache.ts)
- Workspace discovery/tree creation: [testDiscovery.ts](../src/testDiscovery.ts)

Mixed Jest/Vitest projects are handled with pattern-based disambiguation when both configs are present.

### Parsing Strategy

- Parser entry: [parser.ts](../src/parser.ts)
- Jest/Vitest syntax parsing: [parsers/jestParser](../src/parsers/jestParser)
- `node:test` parsing path: [parsers/nodeTestParser.ts](../src/parsers/nodeTestParser.ts)

Use `parseTestFile()` when framework-aware parsing is needed.

### Coverage Integration

- Provider: [coverageProvider.ts](../src/coverageProvider.ts)
- Uses VS Code coverage API (`vscode.FileCoverage` etc.)
- Consumes Istanbul-style JSON (`coverage-final.json`) and additional framework outputs (e.g. Node lcov, Deno JUnit)

### Logging & Error Handling

- Logging utilities are in [utils/Logger.ts](../src/utils/Logger.ts)
- Output channel name: `Jest Runner`
- Debug logs are gated by `jestrunner.enableDebugLogs`
- Commands are wrapped via `wrapCommandHandler()` in [extension.ts](../src/extension.ts)

## Extension Configuration

Core settings are defined in [package.json](../package.json) and read via [config/Settings.ts](../src/config/Settings.ts):

- **General**
  - `jestrunner.projectPath`
  - `jestrunner.changeDirectoryToWorkspaceRoot`
  - `jestrunner.preserveEditorFocus`
  - `jestrunner.useNearestConfig`
  - `jestrunner.defaultTestPatterns`
  - `jestrunner.disableFrameworkConfig`
  - `jestrunner.enableDebugLogs`

- **UI Modes**
  - `jestrunner.enableTestExplorer`
  - `jestrunner.enableCodeLens`
  - `jestrunner.codeLens`

- **Framework Commands/Options**
  - Jest: `jestrunner.jestCommand`, `jestrunner.configPath`, `jestrunner.runOptions`, `jestrunner.debugOptions`
  - Vitest: `jestrunner.vitestCommand`, `jestrunner.vitestConfigPath`, `jestrunner.vitestRunOptions`, `jestrunner.vitestDebugOptions`
  - Node: `jestrunner.nodeTestCommand`, `jestrunner.nodeTestRunOptions`, `jestrunner.nodeTestDebugOptions`
  - Bun: `jestrunner.bunRunOptions`, `jestrunner.bunDebugOptions`
  - Deno: `jestrunner.denoRunOptions`, `jestrunner.denoDebugOptions`
  - Playwright: `jestrunner.playwrightConfigPath`, `jestrunner.playwrightCommand`, `jestrunner.playwrightRunOptions`, `jestrunner.playwrightDebugOptions`, `jestrunner.disablePlaywright`

## Code Organization

- [extension.ts](../src/extension.ts) - activation, command registration, context keys
- [testRunner.ts](../src/testRunner.ts) - terminal run/debug orchestration
- [testRunnerConfig.ts](../src/testRunnerConfig.ts) - command/config/debug resolution
- [frameworkAdapters.ts](../src/frameworkAdapters.ts) - framework-specific CLI argument builders
- [TestController.ts](../src/TestController.ts) - Test Explorer integration
- [testDiscovery.ts](../src/testDiscovery.ts) - file/folder/test hierarchy construction
- [testDetection](../src/testDetection) - framework + file detection pipeline
- [ConfigResolver.ts](../src/ConfigResolver.ts) - config path and mapping resolution
- [coverageProvider.ts](../src/coverageProvider.ts) - coverage import and mapping to VS Code API
- [debug/DebugConfigurationProvider.ts](../src/debug/DebugConfigurationProvider.ts) - per-framework debug config assembly

## Testing Conventions

- Prefer focused unit tests in `src/test` for any behavior change.
- Mock VS Code API fully (avoid partial runtime assumptions).
- Keep framework-specific behavior covered (especially CLI args, config resolution, detection heuristics).
- For parser changes, cover both Jest-style AST parsing and `node:test` parser paths.
