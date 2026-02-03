export class CacheManager {
    private directoryFrameworkCache = new Map<string, Map<string, boolean>>();
    private fileFrameworkCache = new Map<string, { framework: string; directory: string } | null>();

    public getFramework(directory: string, framework: string): boolean | undefined {
        return this.directoryFrameworkCache.get(directory)?.get(framework);
    }

    public setFramework(directory: string, framework: string, value: boolean): void {
        if (!this.directoryFrameworkCache.has(directory)) {
            this.directoryFrameworkCache.set(directory, new Map());
        }
        this.directoryFrameworkCache.get(directory)!.set(framework, value);
    }

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

        for (const cacheKey of this.configPathCache.keys()) {
            if (cacheKey.includes(key)) {
                this.configPathCache.delete(cacheKey);
            }
        }
    }
}

export const cacheManager = new CacheManager();
