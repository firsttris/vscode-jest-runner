# include

include
Type: string[]
Default: ['**/*.{test,spec}.?(c|m)[jt]s?(x)']
CLI: vitest [...include], vitest **/*.test.js
A list of glob patterns that match your test files. These patterns are resolved relative to the root (process.cwd() by default).

Vitest uses the tinyglobby package to resolve the globs.

NOTE

When using coverage, Vitest automatically adds test files include patterns to coverage's default exclude patterns. See coverage.exclude.

Example

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      './test',
      './**/*.{test,spec}.tsx?',
    ],
  },
})
Vitest provides reasonable defaults, so normally you wouldn't override them. A good example of defining include is for test projects:

vitest.config.js

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        name: 'unit',
        include: ['./test/unit/*.test.js'],
      },
      {
        name: 'e2e',
        include: ['./test/e2e/*.test.js'],
      },
    ],
  },
})
WARNING

This option will override Vitest defaults. If you just want to extend them, use configDefaults from vitest/config:


import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      ...configDefaults.include,
      './test',
      './**/*.{test,spec}.tsx?',
    ],
  },
})

# exclude

exclude
Type: string[]
Default: ['**/node_modules/**', '**/.git/**']
CLI: vitest --exclude "**/excluded-file" --exclude "*/other-files/*.js"
A list of glob patterns that should be excluded from your test files. These patterns are resolved relative to the root (process.cwd() by default).

Vitest uses the tinyglobby package to resolve the globs.

WARNING

This option does not affect coverage. If you need to remove certain files from the coverage report, use coverage.exclude.

This is the only option that doesn't override your configuration if you provide it with a CLI flag. All glob patterns added via --exclude flag will be added to the config's exclude.

Example

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      './temp/**',
    ],
  },
})
TIP

Although the CLI exclude option is additive, manually setting exclude in your config will replace the default value. To extend the default exclude patterns, use configDefaults from vitest/config:


import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      'packages/template/*',
      './temp/**',
    ],
  },
})

# root

root
Type: string
CLI: -r <path>, --root=<path>
Project root

# dir

dir
Type: string
CLI: --dir=<path>
Default: same as root
Base directory to scan for the test files. You can specify this option to speed up test discovery if your root covers the whole project

# projects

projects 
Type: TestProjectConfiguration[]
Default: []
An array of projects.

est Projects
Sample Project

GitHub - Play Online

WARNING

This feature is also known as a workspace. The workspace is deprecated since 3.2 and replaced with the projects configuration. They are functionally the same.

Vitest provides a way to define multiple project configurations within a single Vitest process. This feature is particularly useful for monorepo setups but can also be used to run tests with different configurations, such as resolve.alias, plugins, or test.browser and more.

Defining Projects
You can define projects in your root config:

vitest.config.ts

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
})
Project configurations are inlined configs, files, or glob patterns referencing your projects. For example, if you have a folder named packages that contains your projects, you can define an array in your root Vitest config:

vitest.config.ts

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
})
Vitest will treat every folder in packages as a separate project even if it doesn't have a config file inside. If the glob pattern matches a file, it will validate that the name starts with vitest.config/vite.config or matches (vite|vitest).*.config.* pattern to ensure it's a Vitest configuration file. For example, these config files are valid:

vitest.config.ts
vite.config.js
vitest.unit.config.ts
vite.e2e.config.js
vitest.config.unit.js
vite.config.e2e.js
To exclude folders and files, you can use the negation pattern:

vitest.config.ts

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // include all folders inside "packages" except "excluded"
    projects: [
      'packages/*',
      '!packages/excluded'
    ],
  },
})
If you have a nested structure where some folders need to be projects, but other folders have their own subfolders, you have to use brackets to avoid matching the parent folder:

vitest.config.ts

import { defineConfig } from 'vitest/config'

// For example, this will create projects:
// packages/a
// packages/b
// packages/business/c
// packages/business/d
// Notice that "packages/business" is not a project itself

export default defineConfig({
  test: {
    projects: [
      // matches every folder inside "packages" except "business"
      'packages/!(business)',
      // matches every folder inside "packages/business"
      'packages/business/*',
    ],
  },
})
WARNING

Vitest does not treat the root vitest.config file as a project unless it is explicitly specified in the configuration. Consequently, the root configuration will only influence global options such as reporters and coverage. Note that Vitest will always run certain plugin hooks, like apply, config, configResolved or configureServer, specified in the root config file. Vitest also uses the same plugins to execute global setups and custom coverage provider.

You can also reference projects with their config files:

vitest.config.ts

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.{e2e,unit}.ts'],
  },
})
This pattern will only include projects with a vitest.config file that contains e2e or unit before the extension.

You can also define projects using inline configuration. The configuration supports both syntaxes simultaneously.

vitest.config.ts

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      // matches every folder and file inside the `packages` folder
      'packages/*',
      {
        // add "extends: true" to inherit the options from the root config
        extends: true,
        test: {
          include: ['tests/**/*.{browser}.test.{ts,js}'],
          // it is recommended to define a name when using inline configs
          name: 'happy-dom',
          environment: 'happy-dom',
        }
      },
      {
        test: {
          include: ['tests/**/*.{node}.test.{ts,js}'],
          // color of the name label can be changed
          name: { label: 'node', color: 'green' },
          environment: 'node',
        }
      }
    ]
  }
})
WARNING

All projects must have unique names; otherwise, Vitest will throw an error. If a name is not provided in the inline configuration, Vitest will assign a number. For project configurations defined with glob syntax, Vitest will default to using the "name" property in the nearest package.json file or, if none exists, the folder name.

Projects do not support all configuration properties. For better type safety, use the defineProject method instead of defineConfig within project configuration files:

packages/a/vitest.config.ts

import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    environment: 'jsdom',
    // "reporters" is not supported in a project config,
    // so it will show an error
    reporters: ['json']
No overload matches this call.
  The last overload gave the following error.
    Object literal may only specify known properties, and 'reporters' does not exist in type 'ProjectConfig'.
  }
})