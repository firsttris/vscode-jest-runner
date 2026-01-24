# rootDir

rootDir [string]
Default: The root of the directory containing your Jest config file or the package.json or the pwd if no package.json is found

The root directory that Jest should scan for tests and modules within. If you put your Jest config inside your package.json and want the root directory to be the root of your repo, the value for this config param will default to the directory of the package.json.

Oftentimes, you'll want to set this to 'src' or 'lib', corresponding to where in your repository the code is stored.

tip
Using '<rootDir>' as a string token in any other path-based configuration settings will refer back to this value. For example, if you want a setupFiles entry to point at the some-setup.js file at the root of the project, set its value to: '<rootDir>/some-setup.js'.

roots [array<string>]
Default: ["<rootDir>"]

A list of paths to directories that Jest should use to search for files in.

There are times where you only want Jest to search in a single sub-directory (such as cases where you have a src/ directory in your repo), but prevent it from accessing the rest of the repo.

info
While rootDir is mostly used as a token to be re-used in other configuration options, roots is used by the internals of Jest to locate test files and source files. This applies also when searching for manual mocks for modules from node_modules (__mocks__ will need to live in one of the roots).

By default, roots has a single entry <rootDir> but there are cases where you may want to have multiple roots within one project, for example roots: ["<rootDir>/src/", "<rootDir>/tests/"].

# roots

roots [array<string>]
Default: ["<rootDir>"]

A list of paths to directories that Jest should use to search for files in.

There are times where you only want Jest to search in a single sub-directory (such as cases where you have a src/ directory in your repo), but prevent it from accessing the rest of the repo.

info
While rootDir is mostly used as a token to be re-used in other configuration options, roots is used by the internals of Jest to locate test files and source files. This applies also when searching for manual mocks for modules from node_modules (__mocks__ will need to live in one of the roots).

By default, roots has a single entry <rootDir> but there are cases where you may want to have multiple roots within one project, for example roots: ["<rootDir>/src/", "<rootDir>/tests/"].

# Projects

projects [array<string | ProjectConfig>]
Default: undefined

When the projects configuration is provided with an array of paths or glob patterns, Jest will run tests in all of the specified projects at the same time. This is great for monorepos or when working on multiple projects at the same time.

JavaScript
TypeScript
/** @type {import('jest').Config} */
const config = {
  projects: ['<rootDir>', '<rootDir>/examples/*'],
};

module.exports = config;

This example configuration will run Jest in the root directory as well as in every folder in the examples directory. You can have an unlimited amount of projects running in the same Jest instance.

The projects feature can also be used to run multiple configurations or multiple runners. For this purpose, you can pass an array of configuration objects. For example, to run both tests and ESLint (via jest-runner-eslint) in the same invocation of Jest:

JavaScript
TypeScript
/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      displayName: 'test',
    },
    {
      displayName: 'lint',
      runner: 'jest-runner-eslint',
      testMatch: ['<rootDir>/**/*.js'],
    },
  ],
};

module.exports = config;

tip
When using multi-project runner, it's recommended to add a displayName for each project. This will show the displayName of a project next to its tests.

note
With the projects option enabled, Jest will copy the root-level configuration options to each individual child configuration during the test run, resolving its values in the child's context. This means that string tokens like <rootDir> will point to the child's root directory even if they are defined in the root-level configuration.


# testMatch

testMatch [string | array<string>]
(default: [ "**/__tests__/**/*.?([mc])[jt]s?(x)", "**/?(*.)+(spec|test).?([mc])[jt]s?(x)" ])

The glob patterns Jest uses to detect test files. By default it looks for .js, .jsx, .ts and .tsx files inside of __tests__ folders, as well as any files with a suffix of .test or .spec (e.g. Component.test.js or Component.spec.js). It will also find files called test.js or spec.js.

See the micromatch package for details of the patterns you can specify.

See also testRegex [string | array<string>], but note that you cannot specify both options.

tip
Each glob pattern is applied in the order they are specified in the config. For example ["!**/__fixtures__/**", "**/__tests__/**/*.js"] will not exclude __fixtures__ because the negation is overwritten with the second pattern. In order to make the negated glob work in this example it has to come after **/__tests__/**/*.js.

# testPathIgnorePattern

testPathIgnorePatterns [array<string>]
Default: ["/node_modules/"]

An array of regexp pattern strings that are matched against all test paths before executing the test. If the test path matches any of the patterns, it will be skipped.

These pattern strings match against the full path. Use the <rootDir> string token to include the path to your project's root directory to prevent it from accidentally ignoring all of your files in different environments that may have different root directories. Example: ["<rootDir>/build/", "<rootDir>/node_modules/"].

# testRegex

testRegex [string | array<string>]
Default: (/__tests__/.*|(\\.|/)(test|spec))\\.[mc]?[jt]sx?$

The pattern or patterns Jest uses to detect test files. By default it looks for .js, .jsx, .ts and .tsx files inside of __tests__ folders, as well as any files with a suffix of .test or .spec (e.g. Component.test.js or Component.spec.js). It will also find files called test.js or spec.js. See also testMatch [string | array<string>], but note that you cannot specify both options.

The following is a visualization of the default regex:

├── __tests__
│   └── component.spec.js # test
│   └── anything # test
├── package.json # not test
├── foo.test.js # test
├── bar.spec.jsx # test
└── component.js # not test

info
testRegex will try to detect test files using the absolute file path, therefore, having a folder with a name that matches it will run all the files as tests.