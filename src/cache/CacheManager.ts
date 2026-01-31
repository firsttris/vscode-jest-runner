export class CacheManager {
    private directoryFrameworkCache = new Map<string, Map<string, boolean>>();
    private fileFrameworkCache = new Map<string, { framework: string; directory: string } | null>();

    // Framework detection cache
    public getFramework(directory: string, framework: string): boolean | undefined {
        return this.directoryFrameworkCache.get(directory)?.get(framework);
    }

    public setFramework(directory: string, framework: string, value: boolean): void {
        if (!this.directoryFrameworkCache.has(directory)) {
            this.directoryFrameworkCache.set(directory, new Map());
        }
        this.directoryFrameworkCache.get(directory)!.set(framework, value);
    }

    // File framework cache (consolidated)
    public getFileFramework(filePath: string): { framework: string; directory: string } | null | undefined {
        return this.fileFrameworkCache.get(filePath);
    }

    public setFileFramework(filePath: string, value: { framework: string; directory: string } | null): void {
        this.fileFrameworkCache.set(filePath, value);
    }



    public getTestFileStats(): { size: number; entries: string[] } {
        return {
            size: this.fileFrameworkCache.size,
            entries: Array.from(this.fileFrameworkCache.keys()),
        };
    }

    public invalidateAll(): void {
        this.directoryFrameworkCache.clear();
        this.fileFrameworkCache.clear();
    }

    public invalidate(key: string): void {
        this.directoryFrameworkCache.delete(key);
        this.fileFrameworkCache.delete(key);
    }
}

export const cacheManager = new CacheManager();
