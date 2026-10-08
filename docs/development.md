# Development & Release

## Prerequisites

- Node.js 22 (the version CI uses) and npm
- VS Code 1.100 or newer to run the extension
- For the documentation: Python 3 and `pip install -r requirements-docs.txt`

## Set up

```bash
git clone https://github.com/firsttris/vscode-jest-runner.git
cd vscode-jest-runner
npm ci
```

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Bundles `src/extension.ts` with Vite into `dist/extension.js` (CommonJS, minified, Node 18 target; `vscode` and Node built-ins external) |
| `npm run watch` | The same in watch mode |
| `npm test` | Unit tests in `src/test/` with Jest |
| `npm run test:e2e` | End-to-end tests in `src/e2e/` that spawn real Jest and Vitest processes (`--runInBand`) |
| `npm run typecheck` | `tsc --noEmit` for the sources and, with `tsconfig.test.json`, for the tests |
| `npm run lint` / `npm run lint:fix` | Biome: lint and import organization, with `--write` to fix |
| `npm run format:fix` | Biome formatter (tabs, single quotes) |
| `npm run package` | `vsce package` → a `.vsix` to install locally |
| `npm run release:patch\|minor\|major` | `npm version`, which pushes the tag and starts the release workflow |
| `mkdocs serve` | The documentation at http://127.0.0.1:8000 with live reload |

## Debug the extension

Press ++f5++ (**Run Extension**): the `npm: build` task runs and a second VS Code window opens with the
extension loaded from `dist/`. **Run Extension (Watch)** rebuilds on every change; reload the window
(**Developer: Reload Window**) to pick it up. **Extension examples** opens the `examples/` folder with a test
file so you have something to click.

The **Jest Runner** output channel in the development window shows the extension's own logs; set
`"jestrunner.enableDebugLogs": true` in that window for the verbose version.

## Tests

### Unit tests (`src/test/`)

Jest with `babel-jest` (TypeScript preset, CommonJS modules). The `vscode` module is replaced by
`src/test/__mocks__/vscode.ts`, a hand-written mock of the API the extension uses (workspace, window,
commands, tests, debug, `Uri`, `Range`, `TestItem` collections, configuration). The reporter templates'
`?raw` imports are mapped to the files via `moduleNameMapper` and a transform that returns the source as a
string.

Conventions:

- one `*.test.ts` per behavior area, named after the module (`testRunnerConfig.*.test.ts`,
  `TestController.*.test.ts`, `testDetection/*.test.ts`),
- the file system is mocked where detection is tested; real temp directories where parsing is tested,
- `src/test/testControllerSetup.ts` builds a controller with mocked dependencies for the Test Explorer tests,
- framework-specific behavior (arguments, config resolution, detection heuristics, Windows quoting) always has
  a test of its own; a bug fix comes with a regression test.

### End-to-end tests (`src/e2e/`)

`runners.e2e.test.ts` installs nothing extra: it uses the Jest and Vitest of this repository's
`node_modules`, writes small test projects to a temp directory and runs them through `TestRunExecutor` and
`TestRunner` with the real `spawn`. It covers what mocks cannot: quoting of special test names in cmd.exe,
PowerShell and Git Bash, reporters loaded from the temp directory, result matching of real output, killing
the process tree on cancel. CI runs it on Ubuntu, Windows and macOS.

## Continuous integration

`.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | push to `master`, pull requests (not drafts), called by `release.yml`; skipped for documentation-only changes | matrix Ubuntu / Windows / macOS with Node 22: `npm ci`; on Ubuntu lint, typecheck and unit tests with coverage (uploaded to Codecov on `master`); unit tests on the others; e2e tests everywhere; then a build job that packages the `.vsix` and uploads it as an artifact |
| `release.yml` | a `v*` tag, or by hand | runs `ci.yml`, creates the GitHub release with the `.vsix` and publishes to the Visual Studio Marketplace and Open VSX through the shared workflows in [firsttris/workflows](https://github.com/firsttris/workflows) |
| `bump.yml` | by hand, choose patch / minor / major | bumps `package.json`, tags, and thereby starts `release.yml` |
| `docs.yml` | push to `master` touching `docs/`, `mkdocs.yml`, `requirements-docs.txt` or the workflow; pull requests (build only); by hand | `mkdocs build --strict` and deployment to GitHub Pages |

## Release

1. Make sure `master` is green.
2. Either run **Bump version** in the Actions tab and pick the increment, or locally
   `npm run release:patch` (or `minor` / `major`), which runs `npm version` and pushes the tag.
3. The tag starts `release.yml`: checks, GitHub release with the `.vsix`, publish to both marketplaces.
   Versions already published are skipped, so re-running on an existing tag is safe.

The version in `package.json` is the single source of truth; `CHANGELOG.md` is maintained by hand for
notable releases.

## Documentation

The site is built from `docs/` with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/):

```bash
pip install -r requirements-docs.txt
mkdocs serve          # live preview
mkdocs build --strict # what CI runs; fails on broken links and missing pages
```

`mkdocs.yml` holds the navigation; add a page there when you add a file. Pages use plain Markdown with
admonitions (`!!! tip`), tabs (`=== "Title"`), Mermaid diagrams and key labels (`++ctrl+shift+p++`). Relative
links between pages (`[x](usage.md)`) work both on GitHub and on the site, which is why `use_directory_urls`
is off. Documentation-only changes do not trigger the CI build.

## Adding a framework

The order that keeps the layers consistent:

1. `testDetection/frameworkDefinitions.ts`: name, config files, binary name.
2. `testDetection/frameworkDetection.ts`: a content check (import or call pattern) if the framework can be
   recognized from the file; `isFrameworkUsedIn` and `detectTestFramework` pick up the definition.
3. `testDetection/configParsers/<name>Parser.ts` and `testFileDetection.ts`: which patterns the config
   contributes.
4. `frameworkAdapters.ts`: the single-file arguments, including the name filter flag.
5. `testRunnerConfig.ts` and `config/Settings.ts` (plus `package.json` `contributes.configuration`): command,
   run options and debug options settings.
6. `execution/TestArgumentBuilder.ts`: the batched strategy with the reporter or output format the Test
   Explorer will read, and `testResultProcessor.ts` if a new parser is needed.
7. `debug/DebugConfigurationProvider.ts`: the launch configuration.
8. `coverageProvider.ts`: how its coverage report is found.
9. Tests for each step, a row in [Supported Test Frameworks](frameworks.md) and the settings in the
   [Settings Reference](configuration.md).

## Conventions

- TypeScript strict mode; tabs and single quotes (Biome enforces both).
- Pure functions where possible (adapters, parsers, matchers); classes for things with lifecycle (terminal,
  controller, watchers).
- Every `vscode` dependency behind a seam that the mock can serve; no partial real API in tests.
- Log through `utils/Logger.ts`, never `console`.
- Commit messages describe the change for the changelog reader (`fix: ...`, `CI: ...`, `feat: ...`).
