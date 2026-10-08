# Config File Parsing

Jest Runner reads `jest.config.*`, `vitest.config.*` / `vite.config.*`, `playwright.config.*`,
`rstest.config.*`, `cypress.config.*` and `deno.json(c)` to learn where the tests are and where coverage
reports go. It does so **without executing the file**: the file is parsed into a Babel AST and a small
evaluator (`src/testDetection/configParsers/parseUtils.ts` and `src/utils/AstUtils.ts`) turns the subset
that configs normally use into a plain object. Each framework then has a thin parser that picks the fields it
needs.

## Why not just `require()` the config

A `jest.config.ts` needs a TypeScript loader; a `vitest.config.ts` imports from `vitest/config` and often
from the project's own code; both may read `process.env` or call functions. Executing that inside the
extension host would mean loading the project's dependencies into VS Code, with the project's Node version
semantics, for every package of a monorepo. The static approach is safe, fast and has no side effects; its
price is that dynamic configs are not understood, for which `jestrunner.disableFrameworkConfig` exists.

## The generic evaluator

### `parseConfigObject(content, configPath?)`

Parses `content` with `@babel/parser` (`typescript` and `jsx` plugins) and returns the exported config as a
JavaScript object, or `undefined`. Steps:

1. **Collect bindings** (`collectBindings`): every top-level `const`/`let`/`var` and `export const`
   declaration is evaluated with `astToValue` and stored by name. Destructuring patterns
   (`const { a, b = 1 } = obj`) are supported. `__dirname` and `__filename` are bound to the literal strings
   `'__dirname'` and `'__filename'`, which the framework parsers later resolve to the config's directory.
2. **Resolve `require()`** (`resolveRequireValue`): a declarator initialized with `require('./relative')` is
   replaced by the `module.exports` of that file, resolved with the usual extensions (`.js`, `.ts`, `.cjs`,
   `.mjs`, `index.*`) and parsed the same way, recursively, with a visited set against cycles. Only relative
   paths; packages are not resolved.
3. **Find the export**: `export default <expr>`, `module.exports = <expr>` or `exports = <expr>`. The
   expression is passed to `resolveConfigNode`.
4. **Unwrap** (`resolveConfigNode`): parentheses, `as` casts and TypeScript non-null assertions are
   stripped. Then:
   - an object or array literal is the config,
   - an identifier is looked up in the bindings,
   - a **call expression** (`defineConfig(x)`, `mergeConfig(a, b)`, `createJestConfig(...)`, anything) is
     unwrapped to its first argument that resolves, so wrappers of any name work; an arrow function argument
     (`defineConfig(() => ({...}))`) is unwrapped to its returned object,
   - a function expression is unwrapped to the object it returns.
5. **Evaluate** with `astToValue(node, bindings)`.

### `astToValue(node, bindings)`

A recursive evaluator for the literal subset of JavaScript:

| Node | Result |
|---|---|
| string, number, boolean, `null`, `undefined` | the value |
| identifier | the binding's value, `undefined` if unknown |
| array literal | array of evaluated elements |
| object literal | object of evaluated properties; `...spread` of a resolvable object is merged |
| template literal | the string, if every `${expr}` resolves |
| `a + b` | concatenation when both sides are strings |
| member expression `obj.prop` | the property of the evaluated object; `x.name` of an unknown `x` yields `'x'` (for `it(Foo.prototype.bar.name)` style names) |
| call expression | the object arguments merged into one object (so `mergeConfig(base, override)` yields the merged config); other calls `undefined` |
| anything else (conditions, `process.env`, `new`, regular expression literals) | `undefined` |

A property that evaluates to `undefined` is simply missing from the result, so a partially dynamic config
still yields its static parts.

The same evaluator is used by the **test file parser** to resolve `it.each` tables and variable test names
(see [Test File Parsing](test-parsing.md)).

## The framework parsers

All live in `src/testDetection/configParsers/` and return `TestPatterns` objects (`patterns`, `isRegex`,
`rootDir`, `roots`, `ignorePatterns`, `excludePatterns`, `dir`), one per project.

### `jestParser.ts`

- `getTestMatchFromJestConfig(path)`: `.json` files (and the `jest` key of `package.json`) are parsed as
  JSON, everything else with `parseConfigObject`. `projects` entries are followed: strings are resolved
  relative to the config and parsed recursively (so `'<rootDir>/packages/*'` style globs are handed to the
  file system as-is and only literal paths resolve), objects are parsed inline.
- Fields: `rootDir` (`__dirname` → config directory, otherwise resolved against it), `roots`,
  `testMatch` (globs), `testRegex` (string or array, marks the result `isRegex`), `testPathIgnorePatterns`.
  A config with only `roots` or ignore patterns yields an entry with empty patterns, which the caller fills
  with the defaults.
- `parseCoverageDirectory(path, framework)`: `coverageDirectory` for Jest, `coverage.reportsDirectory`
  (also under `test.`) for Vitest and Rstest, resolved against `rootDir` / `root` and the config directory.

### `vitestParser.ts`

- `getVitestConfig(path)`: like Jest, with `test.include`, `test.exclude`, `test.dir`, `root` and
  `test.projects` / `projects` (strings or objects, recursive).
- `viteConfigHasTestAttribute(path)`: decides whether a `vite.config.*` is a Vitest config at all. It is when
  the parsed object has `test` or `projects`; when the file cannot be parsed, the text is searched for `test =`
  as a last resort.

### `playwrightParser.ts`

- `getPlaywrightConfig(path)`: `testDir` (default `tests`), `testMatch` (string or string array; a regular
  expression literal cannot be evaluated statically, so the default patterns apply then), `testIgnore`. The
  result's `dir` is the base for matching.
- `getPlaywrightTestDir(path)`: the `testDir` alone, used by the conflict check in test detection.

### `rstestParser.ts`

`getRstestConfig(path)`: `root` (`__dirname` understood), `include`, `exclude` as an array or as
`{ patterns: [...] }`, `projects` as paths or inline objects.

### `denoParser.ts`

`getDenoConfig(path)`: `deno.json` is parsed as JSON; `deno.jsonc` after stripping `//` and `/* */`
comments outside strings. Reads `test.include` and `test.exclude`; the config's directory is the root.

### `cypressParser.ts`

`getCypressSpecPattern(path)`: `specPattern` at the top level or under `e2e`, used only to **exclude** Cypress
specs from the Jest and Vitest trees.

### `configParsing.ts`

Not a parser but the lookup helpers used by detection:

- `getConfigPath(dir, framework)`: the first config file name of the framework that exists in `dir`, with the
  two special cases (`vite.config.*` must have a `test` section, `package.json` must have a `jest` key).
- `binaryExists(dir, name)`: `node_modules/.bin/<name>`, `<name>.cmd` or `node_modules/<name>/package.json`.
- `resolveAndValidateCustomConfig(settingKey, file)`: resolves `jestrunner.configPath`,
  `jestrunner.vitestConfigPath` or `jestrunner.playwrightConfigPath` (string or glob mapping) for a file
  against its workspace folder and returns it only if the file exists.
- `getDefaultTestPatterns()`: `jestrunner.defaultTestPatterns` or the built-in defaults.

## Examples of what resolves

```typescript title="resolves fully"
import { defineConfig } from 'vitest/config';
const unitTests = ['src/**/*.test.ts'];
const base = { root: __dirname, test: { exclude: ['**/e2e/**'] } };
export default defineConfig({
  ...base,
  test: { ...base.test, include: [...unitTests, `tests/${'integration'}/**/*.ts`] },
});
```

```javascript title="resolves through require()"
// jest.config.js
const { testMatch } = require('./jest.base.js');   // module.exports = { testMatch: [...] }
module.exports = { rootDir: __dirname, testMatch, projects: ['<rootDir>/packages/api'] };
```

```typescript title="resolves partially: patterns missing, defaults apply"
import { nxPreset } from '@nx/jest/preset';        // package import: ignored
export default {
  ...nxPreset,                                     // unknown spread: skipped
  testMatch: process.env.CI ? ciMatch : devMatch,  // conditional: undefined
  coverageDirectory: '../../coverage/apps/web',    // literal: kept
};
```

In the last case the Test Explorer still shows the tests found by the default patterns, and coverage is read
from the right directory; only a custom `testMatch` would be lost.

## Error handling

Every parser catches its own errors, logs them to the **Jest Runner** channel and returns `undefined`, which
callers treat as "no config": the file name lookup continues with the next candidate and the default patterns
apply. A syntax error in a config therefore never breaks detection; it only shows up in the log.
