export class CacheManager {
    private testDetectionCache = new Map<string, boolean>();
    private vitestDetectionCache = new Map<string, boolean>();
    private nodeTestFileCache = new Map<string, boolean>();
    private testFileCache = new Map<string, boolean>();

    // Jest detection cache
    public getJest(directory: string): boolean | undefined {
        return this.testDetectionCache.get(directory);
    }

    public setJest(directory: string, value: boolean): void {
        this.testDetectionCache.set(directory, value);
    }

    // Vitest detection cache
    public getVitest(directory: string): boolean | undefined {
        return this.vitestDetectionCache.get(directory);
    }

    public setVitest(directory: string, value: boolean): void {
        this.vitestDetectionCache.set(directory, value);
    }

    // Node test file cache
    public getNodeTest(filePath: string): boolean | undefined {
        return this.nodeTestFileCache.get(filePath);
    }

    public setNodeTest(filePath: string, value: boolean): void {
        this.nodeTestFileCache.set(filePath, value);
    }

    // Test file cache (general)
    public getTestFile(filePath: string): boolean | undefined {
        return this.testFileCache.get(filePath);
    }

    public setTestFile(filePath: string, value: boolean): void {
        this.testFileCache.set(filePath, value);
    }

    public getTestFileStats(): { size: number; entries: string[] } {
        return {
            size: this.testFileCache.size,
            entries: Array.from(this.testFileCache.keys()),
        };
    }

    public invalidateAll(): void {
        this.testDetectionCache.clear();
        this.vitestDetectionCache.clear();
        this.nodeTestFileCache.clear();
        this.testFileCache.clear();
    }

    public invalidate(key: string): void {
        this.testDetectionCache.delete(key);
        this.vitestDetectionCache.delete(key);
        this.nodeTestFileCache.delete(key);
        this.testFileCache.delete(key);
    }
}

export const cacheManager = new CacheManager();
