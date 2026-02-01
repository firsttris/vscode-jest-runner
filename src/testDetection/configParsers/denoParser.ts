
import { dirname } from 'node:path';
import { TestPatterns } from '../frameworkDefinitions';
import { logDebug, logError } from '../../utils/Logger';
import { readConfigFile } from './parseUtils';

function stripJsonComments(json: string): string {
    return json.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
}

export function getDenoConfig(configPath: string): TestPatterns | undefined {
    try {
        const content = readConfigFile(configPath);
        let config: any;

        try {
            config = JSON.parse(content);
        } catch {
            // Try stripping comments for JSONC
            try {
                config = JSON.parse(stripJsonComments(content));
            } catch (e) {
                logError(`Failed to parse Deno config as JSON/JSONC: ${configPath}`, e);
                return undefined;
            }
        }

        if (!config || typeof config !== 'object') return undefined;

        const testConfig = config.test || config; // Deno test config can be at root or under 'test'?
        // Docs: "test" field in deno.json.
        // Example: { "test": { "include": [...] } }
        // If not in 'test', check root? defineConfig usage? 
        // Deno docs say: Top level options... but `include`/`exclude` for test runner usually in `test` object.
        // Wait, Deno 1.30+ supports `test: { include: [] }`.
        // Also "exclude" at root applies to everything. 
        // Let's look for `test.include` specifically for test patterns.
        // And `test.exclude`.

        // Support top-level exclude if 'test' doesn't exist? 
        // Usually 'test' block is preferred for test runner specific settings.

        const testSection = config.test;
        if (!testSection && !config.exclude) return undefined;

        const include = testSection?.include;
        const testExclude = testSection?.exclude;

        // Check types
        const patterns = Array.isArray(include) ? include : [];
        const excludePatterns = Array.isArray(testExclude) ? testExclude : [];

        if (patterns.length === 0 && excludePatterns.length === 0) return undefined;

        logDebug(`Parsed Deno config: ${configPath}. Include: ${patterns}, Exclude: ${excludePatterns}`);

        return {
            patterns: patterns,
            excludePatterns: excludePatterns,
            isRegex: false,
            rootDir: dirname(configPath),
        };
    } catch (error) {
        logError(`Error reading Deno config file: ${configPath}`, error);
        return undefined;
    }
}
