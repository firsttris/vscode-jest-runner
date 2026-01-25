export const testDetectionCache = new Map<string, boolean>();
export const vitestDetectionCache = new Map<string, boolean>();

export function clearTestDetectionCache(): void {
  testDetectionCache.clear();
}

export function clearVitestDetectionCache(): void {
  vitestDetectionCache.clear();
}
