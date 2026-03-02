import * as vscode from 'vscode';
import { TestRunnerConfig } from '../testRunnerConfig';
import {
  Uri,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from './__mocks__/vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('TestRunnerConfig', () => {
  describe('vitestCommand', () => {
    let jestRunnerConfig: TestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('/home/user/project') as any) as any,
        );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return custom vitest command when set', () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
        new WorkspaceConfiguration({
          'jestrunner.vitestCommand': 'pnpm vitest',
        }),
      );

      expect(jestRunnerConfig.vitestCommand).toBe('pnpm vitest');
    });

    it('should return default vitest command when not set', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      // Mock no Yarn PnP
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(jestRunnerConfig.vitestCommand).toBe('npx --no-install vitest');
    });

    it('should use npx even when PnP is detected', () => {
      jest
        .spyOn(vscode.workspace, 'getConfiguration')
        .mockReturnValue(new WorkspaceConfiguration({}));

      // Mock Yarn PnP directory structure
      const expectedPath = path.join('/home/user/project', '.yarn', 'releases');
      jest.spyOn(fs, 'existsSync').mockImplementation((checkPath: any) => {
        if (checkPath === expectedPath) {
          return true;
        }
        return false;
      });
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['yarn-3.2.0.cjs' as any]);

      expect(jestRunnerConfig.vitestCommand).toBe('npx --no-install vitest');
    });
  });

  describe('getTestFramework', () => {
    let jestRunnerConfig: TestRunnerConfig;

    beforeEach(() => {
      jestRunnerConfig = new TestRunnerConfig();
      jest
        .spyOn(vscode.workspace, 'getWorkspaceFolder')
        .mockReturnValue(
          new WorkspaceFolder(new Uri('/workspace') as any) as any,
        );
    });

    it('should detect jest framework', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          return String(filePath).includes('jest.config');
        });

      const framework = jestRunnerConfig.getTestFramework(
        '/workspace/test.spec.ts',
      );

      expect(framework).toBe('jest');
    });

    it('should detect vitest framework', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          return String(filePath).includes('vitest.config');
        });

      const framework = jestRunnerConfig.getTestFramework(
        '/workspace/test.spec.ts',
      );

      expect(framework).toBe('vitest');
    });

    it('should detect vitest framework when only vite.config exists (vitest embedded in vite config)', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          return String(filePath).includes('vite.config');
        });
      jest.spyOn(fs, 'readFileSync').mockReturnValue(`
        export default defineConfig({
          test: {
            globals: true,
          },
        });
      `);

      const framework = jestRunnerConfig.getTestFramework(
        '/workspace/test.spec.ts',
      );

      expect(framework).toBe('vitest');
    });

    it('should not detect vitest framework when vite.config exists without test attribute', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          return String(filePath).includes('vite.config');
        });
      jest.spyOn(fs, 'readFileSync').mockReturnValue(`
        export default defineConfig({
          plugins: [react()],
        });
      `);

      const framework = jestRunnerConfig.getTestFramework(
        '/workspace/test.spec.ts',
      );

      expect(framework).toBeUndefined();
    });

    it('should prefer vitest.config over vite.config when both exist', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => {
          const path = String(filePath);
          return path.includes('vitest.config') || path.includes('vite.config');
        });

      const configPath = jestRunnerConfig.findConfigPath(
        '/workspace/test.spec.ts',
        undefined,
        'vitest',
      );

      expect(configPath).toContain('vitest.config');
    });
  });
});
