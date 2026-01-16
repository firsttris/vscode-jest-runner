import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/test/**', 'src/**/*.test.ts'],
    },
    alias: {
      vscode: resolve(__dirname, 'src/test/__mocks__/vscode.ts'),
    },
  },
});
