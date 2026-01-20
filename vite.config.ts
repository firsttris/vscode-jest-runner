import { defineConfig } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/extension.ts'),
      formats: ['cjs'],
      fileName: () => 'extension.js',
    },
    rollupOptions: {
      external: [
        'vscode',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
      output: {
        format: 'cjs',
        exports: 'named',
      },
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    target: 'node18',
    commonjsOptions: {
      esmExternals: true,
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
});
