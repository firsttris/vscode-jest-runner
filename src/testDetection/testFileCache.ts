import { cacheManager } from '../cache/CacheManager';
import { matchesTestFilePattern } from './testFileDetection';
import { findTestFrameworkDirectory } from './frameworkDetection';
import { resolveAndValidateCustomConfig } from './configParsing';
import { hasConflictingTestFramework } from './testFileDetection';

class TestFileCache {
    public isTestFile(filePath: string): boolean {
        const cached = cacheManager.getFileFramework(filePath);
        if (cached !== undefined) {
            return !!cached;
        }

        const result = this.computeIsTestFile(filePath);

        cacheManager.setFileFramework(filePath, result);

        return !!result;
    }

    private computeIsTestFile(filePath: string): { framework: string; directory: string } | null {
        if (!matchesTestFilePattern(filePath)) {
            return null;
        }

        const frameworkResult = findTestFrameworkDirectory(filePath);
        if (!frameworkResult) {
            return null;
        }

        if (hasConflictingTestFramework(filePath, frameworkResult.framework)) {
            return null;
        }

        const hasCustomConfig =
            !!resolveAndValidateCustomConfig('jestrunner.configPath', filePath) ||
            !!resolveAndValidateCustomConfig('jestrunner.vitestConfigPath', filePath);

        if (frameworkResult || hasCustomConfig) {
            return frameworkResult;
        }
        return null;
    }

    public invalidate(filePath?: string): void {
        if (filePath) {
            cacheManager.invalidate(filePath);
        } else {
            cacheManager.invalidateAll();
        }
    }

    public getCacheStats(): { size: number; entries: string[] } {
        return cacheManager.getTestFileStats();
    }
}

export const testFileCache = new TestFileCache();
