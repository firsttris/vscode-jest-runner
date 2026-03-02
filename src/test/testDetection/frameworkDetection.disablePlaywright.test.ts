import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cacheManager } from '../../cache/CacheManager';
import {
  findTestFrameworkDirectory,
  isPlaywrightTestFile,
  isPlaywrightUsedIn,
} from '../../testDetection/frameworkDetection';
import { WorkspaceConfiguration } from '../__mocks__/vscode';

jest.mock('fs');
jest.mock('vscode');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('disablePlaywright setting', () => {
  const rootPath = '/workspace/project';
  const playwrightFile = '/workspace/project/tests/example.spec.ts';

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.invalidateAll();
    mockedFs.existsSync = jest.fn().mockReturnValue(false);
    mockedFs.readFileSync = jest.fn();

    (vscode.workspace.getWorkspaceFolder as jest.Mock) = jest.fn(() => ({
      uri: { fsPath: rootPath },
    }));
  });

  const setDisablePlaywright = (disabled: boolean) => {
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(
      new WorkspaceConfiguration({
        'jestrunner.disablePlaywright': disabled,
      }),
    );
  };

  const mockPlaywrightTestFile = () => {
    mockedFs.existsSync = jest.fn().mockReturnValue(true);
    mockedFs.readFileSync = jest.fn().mockReturnValue(
      `import { test, expect } from '@playwright/test';

test('example test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});`,
    );
  };

  const mockPlaywrightWithJestProject = () => {
    mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
      const p = fsPath.toString();
      return (
        p === playwrightFile ||
        p === path.join(rootPath, 'jest.config.js') ||
        p === path.join(rootPath, 'package.json')
      );
    });
    mockedFs.readFileSync = jest.fn((fsPath: fs.PathOrFileDescriptor) => {
      const p = fsPath.toString();
      if (p === playwrightFile) {
        return `import { test, expect } from '@playwright/test';
test('example', async ({ page }) => {});`;
      }
      if (p.includes('package.json')) {
        return JSON.stringify({
          devDependencies: { jest: '^29.0.0' },
        });
      }
      return '';
    }) as any;
  };

  describe('isPlaywrightTestFile', () => {
    it('should detect playwright file even when disabled', () => {
      setDisablePlaywright(true);
      mockPlaywrightTestFile();

      expect(isPlaywrightTestFile(playwrightFile)).toBe(true);
    });

    it('should detect playwright file when enabled', () => {
      setDisablePlaywright(false);
      mockPlaywrightTestFile();

      expect(isPlaywrightTestFile(playwrightFile)).toBe(true);
    });
  });

  describe('isPlaywrightUsedIn', () => {
    it('should detect playwright directory even when disabled', () => {
      setDisablePlaywright(true);
      mockedFs.existsSync = jest.fn((fsPath: fs.PathLike) => {
        return (
          fsPath === path.join(rootPath, 'node_modules', '.bin', 'playwright')
        );
      });

      expect(isPlaywrightUsedIn(rootPath)).toBe(true);
    });
  });

  describe('findTestFrameworkDirectory', () => {
    it('should return undefined for playwright file when disabled', () => {
      setDisablePlaywright(true);
      mockPlaywrightTestFile();

      const result = findTestFrameworkDirectory(playwrightFile);

      expect(result).toBeUndefined();
    });

    it('should return playwright framework when enabled', () => {
      setDisablePlaywright(false);
      mockPlaywrightTestFile();

      const result = findTestFrameworkDirectory(playwrightFile);

      expect(result).toEqual({
        directory: path.dirname(playwrightFile),
        framework: 'playwright',
      });
    });

    it('should NOT fall back to jest when playwright is disabled', () => {
      setDisablePlaywright(true);
      mockPlaywrightWithJestProject();

      const result = findTestFrameworkDirectory(playwrightFile);

      expect(result).toBeUndefined();
      expect(result?.framework).not.toBe('jest');
    });

    it('should return playwright when jest also exists but playwright is enabled', () => {
      setDisablePlaywright(false);
      mockPlaywrightWithJestProject();

      const result = findTestFrameworkDirectory(playwrightFile);

      expect(result).toEqual({
        directory: path.dirname(playwrightFile),
        framework: 'playwright',
      });
    });
  });
});
