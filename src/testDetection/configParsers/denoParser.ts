
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
            try {
                config = JSON.parse(stripJsonComments(content));
            } catch (e) {
                logError(`Failed to parse Deno config as JSON/JSONC: ${configPath}`, e);
                return undefined;
            }
        }

        if (!config || typeof config !== 'object') return undefined;

        const testSection = config.test;

        const include = testSection?.include;
        const testExclude = testSection?.exclude;

        const patterns = Array.isArray(include) ? include : [];
        const excludePatterns = Array.isArray(testExclude) ? testExclude : [];

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
