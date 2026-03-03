import { testFileCache } from '../../testDetection/testFileCache';
import * as testFileDetection from '../../testDetection/testFileDetection';
import * as frameworkDetection from '../../testDetection/frameworkDetection';
import * as configParsing from '../../testDetection/configParsing';

jest.mock('../../testDetection/testFileDetection');
jest.mock('../../testDetection/frameworkDetection');
jest.mock('../../testDetection/configParsing');

const mockedTestFileDetection = testFileDetection as jest.Mocked<
    typeof testFileDetection
>;
const mockedFrameworkDetection = frameworkDetection as jest.Mocked<
    typeof frameworkDetection
>;
const mockedConfigParsing = configParsing as jest.Mocked<typeof configParsing>;

describe('TestFileCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Clear the cache before each test
        testFileCache.invalidate();
    });

    describe('isTestFile', () => {
        it('should return true for a valid test file', () => {
            const filePath = '/workspace/project/src/component.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            const result = testFileCache.isTestFile(filePath);

            expect(result).toBe(true);
            expect(mockedTestFileDetection.matchesTestFilePattern).toHaveBeenCalledWith(
                filePath,
            );
            expect(
                mockedFrameworkDetection.findTestFrameworkDirectory,
            ).toHaveBeenCalledWith(filePath);
        });

        it('should return false when file does not match test file pattern', () => {
            const filePath = '/workspace/project/src/component.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(false);

            const result = testFileCache.isTestFile(filePath);

            expect(result).toBe(false);
            expect(mockedTestFileDetection.matchesTestFilePattern).toHaveBeenCalledWith(
                filePath,
            );
            expect(
                mockedFrameworkDetection.findTestFrameworkDirectory,
            ).not.toHaveBeenCalled();
        });

        it('should return false when no framework directory is found', () => {
            const filePath = '/workspace/project/src/component.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue(null);

            const result = testFileCache.isTestFile(filePath);

            expect(result).toBe(false);
            expect(
                mockedFrameworkDetection.findTestFrameworkDirectory,
            ).toHaveBeenCalledWith(filePath);
        });

        it('should return false when there is a conflicting test framework', () => {
            const filePath = '/workspace/project/src/component.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(true);

            const result = testFileCache.isTestFile(filePath);

            expect(result).toBe(false);
            expect(mockedTestFileDetection.hasConflictingTestFramework).toHaveBeenCalledWith(
                filePath,
                'jest',
            );
        });

        it('should return true when custom Jest config exists with framework directory', () => {
            const filePath = '/workspace/project/src/component.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockImplementation((key: string) => {
                    if (key === 'jestrunner.configPath') {
                        return '/workspace/project/jest.config.js';
                    }
                    return null;
                });

            const result = testFileCache.isTestFile(filePath);

            expect(result).toBe(true);
            expect(
                mockedConfigParsing.resolveAndValidateCustomConfig,
            ).toHaveBeenCalledWith('jestrunner.configPath', filePath);
        });

        it('should return true when custom Vitest config exists with framework directory', () => {
            const filePath = '/workspace/project/src/component.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'vitest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockImplementation((key: string) => {
                    if (key === 'jestrunner.vitestConfigPath') {
                        return '/workspace/project/vitest.config.ts';
                    }
                    return null;
                });

            const result = testFileCache.isTestFile(filePath);

            expect(result).toBe(true);
            expect(
                mockedConfigParsing.resolveAndValidateCustomConfig,
            ).toHaveBeenCalledWith('jestrunner.vitestConfigPath', filePath);
        });

        it('should return true when framework directory exists', () => {
            const filePath = '/workspace/project/src/component.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'vitest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            const result = testFileCache.isTestFile(filePath);

            expect(result).toBe(true);
        });
    });

    describe('caching behavior', () => {
        it('should cache the result after first call', () => {
            const filePath = '/workspace/project/src/component.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            // First call
            const result1 = testFileCache.isTestFile(filePath);

            // Second call - should use cached value
            const result2 = testFileCache.isTestFile(filePath);

            expect(result1).toBe(true);
            expect(result2).toBe(true);

            // Mocks should only be called once
            expect(mockedTestFileDetection.matchesTestFilePattern).toHaveBeenCalledTimes(
                1,
            );
            expect(
                mockedFrameworkDetection.findTestFrameworkDirectory,
            ).toHaveBeenCalledTimes(1);
        });

        it('should cache false results as well', () => {
            const filePath = '/workspace/project/src/component.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(false);

            // First call
            const result1 = testFileCache.isTestFile(filePath);

            // Second call - should use cached value
            const result2 = testFileCache.isTestFile(filePath);

            expect(result1).toBe(false);
            expect(result2).toBe(false);

            // Mock should only be called once
            expect(mockedTestFileDetection.matchesTestFilePattern).toHaveBeenCalledTimes(
                1,
            );
        });

        it('should cache results for multiple different files', () => {
            const file1 = '/workspace/project/src/component1.test.ts';
            const file2 = '/workspace/project/src/component2.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            // Call with file1
            testFileCache.isTestFile(file1);
            testFileCache.isTestFile(file1); // Should use cache

            // Call with file2
            testFileCache.isTestFile(file2);
            testFileCache.isTestFile(file2); // Should use cache

            // Each unique file should trigger one computation
            expect(mockedTestFileDetection.matchesTestFilePattern).toHaveBeenCalledTimes(
                2,
            );
        });
    });

    describe('invalidate', () => {
        it('should invalidate a specific file from cache', () => {
            const filePath = '/workspace/project/src/component.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            // First call
            testFileCache.isTestFile(filePath);

            // Invalidate the specific file
            testFileCache.invalidate(filePath);

            // Second call - should recompute since cache was invalidated
            testFileCache.isTestFile(filePath);

            // Mock should be called twice
            expect(mockedTestFileDetection.matchesTestFilePattern).toHaveBeenCalledTimes(
                2,
            );
        });

        it('should clear entire cache when called without arguments', () => {
            const file1 = '/workspace/project/src/component1.test.ts';
            const file2 = '/workspace/project/src/component2.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            // Cache both files
            testFileCache.isTestFile(file1);
            testFileCache.isTestFile(file2);

            // Clear entire cache
            testFileCache.invalidate();

            // Call again - should recompute for both
            testFileCache.isTestFile(file1);
            testFileCache.isTestFile(file2);

            // Each file should be computed twice (before and after clear)
            expect(mockedTestFileDetection.matchesTestFilePattern).toHaveBeenCalledTimes(
                4,
            );
        });

        it('should not affect other cached files when invalidating specific file', () => {
            const file1 = '/workspace/project/src/component1.test.ts';
            const file2 = '/workspace/project/src/component2.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            // Cache both files
            testFileCache.isTestFile(file1);
            testFileCache.isTestFile(file2);

            // Invalidate only file1
            testFileCache.invalidate(file1);

            // Call both again
            testFileCache.isTestFile(file1); // Should recompute
            testFileCache.isTestFile(file2); // Should use cache

            // file1 computed twice, file2 computed once
            expect(mockedTestFileDetection.matchesTestFilePattern).toHaveBeenCalledTimes(
                3,
            );
        });

        it('should handle invalidating a file that is not in cache', () => {
            const filePath = '/workspace/project/src/component.test.ts';

            // Invalidate a file that was never cached
            expect(() => testFileCache.invalidate(filePath)).not.toThrow();

            const stats = testFileCache.getCacheStats();
            expect(stats.size).toBe(0);
        });
    });

    describe('getCacheStats', () => {
        it('should return empty stats for empty cache', () => {
            const stats = testFileCache.getCacheStats();

            expect(stats.size).toBe(0);
            expect(stats.entries).toEqual([]);
        });

        it('should return correct stats after caching files', () => {
            const file1 = '/workspace/project/src/component1.test.ts';
            const file2 = '/workspace/project/src/component2.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            // Cache two files
            testFileCache.isTestFile(file1);
            testFileCache.isTestFile(file2);

            const stats = testFileCache.getCacheStats();

            expect(stats.size).toBe(2);
            expect(stats.entries).toContain(file1);
            expect(stats.entries).toContain(file2);
        });

        it('should return updated stats after invalidation', () => {
            const file1 = '/workspace/project/src/component1.test.ts';
            const file2 = '/workspace/project/src/component2.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            // Cache two files
            testFileCache.isTestFile(file1);
            testFileCache.isTestFile(file2);

            // Invalidate one file
            testFileCache.invalidate(file1);

            const stats = testFileCache.getCacheStats();

            expect(stats.size).toBe(1);
            expect(stats.entries).toContain(file2);
            expect(stats.entries).not.toContain(file1);
        });

        it('should return empty stats after clearing cache', () => {
            const file1 = '/workspace/project/src/component1.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            // Cache a file
            testFileCache.isTestFile(file1);

            // Clear cache
            testFileCache.invalidate();

            const stats = testFileCache.getCacheStats();

            expect(stats.size).toBe(0);
            expect(stats.entries).toEqual([]);
        });
    });

    describe('edge cases', () => {
        it('should handle empty file path', () => {
            const filePath = '';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(false);

            const result = testFileCache.isTestFile(filePath);

            expect(result).toBe(false);
        });

        it('should cache both true and false results correctly', () => {
            const testFile = '/workspace/project/src/component.test.ts';
            const nonTestFile = '/workspace/project/src/component.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockImplementation((path: string) => {
                    return path.includes('.test.');
                });
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            const result1 = testFileCache.isTestFile(testFile);
            const result2 = testFileCache.isTestFile(nonTestFile);
            const result3 = testFileCache.isTestFile(testFile); // from cache
            const result4 = testFileCache.isTestFile(nonTestFile); // from cache

            expect(result1).toBe(true);
            expect(result2).toBe(false);
            expect(result3).toBe(true);
            expect(result4).toBe(false);

            const stats = testFileCache.getCacheStats();
            expect(stats.size).toBe(2);
        });

        it('should handle files with special characters in path', () => {
            const filePath = '/workspace/project-2023/src/@types/component.test.ts';

            mockedTestFileDetection.matchesTestFilePattern = jest
                .fn()
                .mockReturnValue(true);
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project-2023',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            const result = testFileCache.isTestFile(filePath);

            expect(result).toBe(true);
        });

        it('should recompute after invalidation even with same mocked values', () => {
            const filePath = '/workspace/project/src/component.test.ts';
            let callCount = 0;

            mockedTestFileDetection.matchesTestFilePattern = jest.fn((_filePath: string) => {
                callCount++;
                return true;
            });
            mockedFrameworkDetection.findTestFrameworkDirectory = jest
                .fn()
                .mockReturnValue({
                    framework: 'jest',
                    frameworkDir: '/workspace/project',
                });
            mockedTestFileDetection.hasConflictingTestFramework = jest
                .fn()
                .mockReturnValue(false);
            mockedConfigParsing.resolveAndValidateCustomConfig = jest
                .fn()
                .mockReturnValue(null);

            // First call
            testFileCache.isTestFile(filePath);
            expect(callCount).toBe(1);

            // Second call - uses cache
            testFileCache.isTestFile(filePath);
            expect(callCount).toBe(1);

            // Invalidate
            testFileCache.invalidate(filePath);

            // Third call - recomputes
            testFileCache.isTestFile(filePath);
            expect(callCount).toBe(2);
        });
    });
});
