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

    private configPathCache = new Map<string, string | undefined>();

    public getConfigPath(key: string): string | undefined {
        return this.configPathCache.get(key);
    }

    public setConfigPath(key: string, value: string | undefined): void {
        this.configPathCache.set(key, value);
    }

    public invalidateAll(): void {
        this.directoryFrameworkCache.clear();
        this.fileFrameworkCache.clear();
        this.configPathCache.clear();
    }

    public invalidate(key: string): void {
        this.directoryFrameworkCache.delete(key);
        this.fileFrameworkCache.delete(key);
        // We can't easily invalidate specific config cache entries by key only if key is directory,
        // because the key for config cache involves config names too.
        // For simplicity, we might just clear config cache or leave it if 'key' matches.
        // Given 'invalidate' is used for file paths, we probably just clear the whole config cache 
        // if a relevant file changes, or just rely on 'invalidateAll' for big changes.
        // For now, let's just clear the specific entry if it matches, but keys are different.
        // If the key passed is a directory or file, we might just want to be safe and clear config cache
        // or improve this logic later. For now, simple append to invalidateAll is safe.
        this.configPathCache.delete(key);
    }
}

export const cacheManager = new CacheManager();
