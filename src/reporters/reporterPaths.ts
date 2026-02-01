import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Import templates as raw strings so they get bundled by Vite
import jestReporterSource from './jestReporterTemplate.cjs?raw';
import vitestReporterSource from './vitestReporterTemplate.cjs?raw';
import nodeReporterSource from './nodeReporterTemplate.mjs?raw';

interface ReporterPaths {
  jest: string;
  vitest: string;
  node: string;
}

let cachedPaths: ReporterPaths | undefined;

function writeReporterFile(path: string, content: string): void {
  writeFileSync(path, content, 'utf8');
}

export function getReporterPaths(): ReporterPaths {
  if (cachedPaths) return cachedPaths;

  const dir = join(tmpdir(), 'vscode-jest-runner-reporters');
  mkdirSync(dir, { recursive: true });

  const jestPath = join(dir, 'jest-reporter.cjs');
  const vitestPath = join(dir, 'vitest-reporter.cjs');
  const nodePath = join(dir, 'node-reporter.mjs');

  writeReporterFile(jestPath, jestReporterSource);
  writeReporterFile(vitestPath, vitestReporterSource);
  writeReporterFile(nodePath, nodeReporterSource);

  cachedPaths = { jest: jestPath, vitest: vitestPath, node: nodePath };
  return cachedPaths;
}
