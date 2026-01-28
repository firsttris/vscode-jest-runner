import { matchesTestFilePattern } from './testFileDetection';
import { findTestFrameworkDirectory } from './frameworkDetection';
import { resolveAndValidateCustomConfig } from './configParsing';
import { hasConflictingTestFramework } from './testFileDetection';

class TestFileCache {
    private cache = new Map<string, boolean>();

    public isTestFile(filePath: string): boolean {
        if (this.cache.has(filePath)) {
            const cached = this.cache.get(filePath)!;
            return cached;
        }

        const result = this.computeIsTestFile(filePath);

        this.cache.set(filePath, result);

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
            this.cache.delete(filePath);
        } else {
            this.cache.clear();
        }
    }

    public getCacheStats(): { size: number; entries: string[] } {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys()),
        };
    }
}

export const testFileCache = new TestFileCache();
