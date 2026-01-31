import { cacheManager } from '../cache/CacheManager';
import { matchesTestFilePattern } from './testFileDetection';
import { findTestFrameworkDirectory } from './frameworkDetection';
import { resolveAndValidateCustomConfig } from './configParsing';
import { hasConflictingTestFramework } from './testFileDetection';

class TestFileCache {
    public isTestFile(filePath: string): boolean {
        const cached = cacheManager.getTestFile(filePath);
        if (cached !== undefined) {
            return cached;
        }

        const result = this.computeIsTestFile(filePath);

        cacheManager.setTestFile(filePath, result);

        return result;
    }

    private computeIsTestFile(filePath: string): boolean {
        if (!matchesTestFilePattern(filePath)) {
            return false;
        }

        const frameworkResult = findTestFrameworkDirectory(filePath);
        if (!frameworkResult) {
            return false;
        }

        if (hasConflictingTestFramework(filePath, frameworkResult.framework)) {
            return false;
        }

        const hasFrameworkDir = !!frameworkResult;
        const hasCustomConfig =
            !!resolveAndValidateCustomConfig('jestrunner.configPath', filePath) ||
            !!resolveAndValidateCustomConfig('jestrunner.vitestConfigPath', filePath);

        return hasFrameworkDir || hasCustomConfig;
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
