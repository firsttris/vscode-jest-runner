import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { resolveConfigPath } from '../utils/ResolverUtils';

describe('resolveConfigPath', () => {
    let tmpDir: string;
    let parentDir: string;
    let workspaceDir: string;

    beforeEach(() => {
        // Create tmp structure
        // /tmp/test-runner/parent/jest.config.js
        // /tmp/test-runner/parent/workspace/
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-runner-test-'));
        parentDir = path.join(tmpDir, 'parent');
        workspaceDir = path.join(parentDir, 'workspace');

        fs.mkdirSync(parentDir);
        fs.mkdirSync(workspaceDir);
    });

    afterEach(() => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it('should find config in the current directory', () => {
        fs.writeFileSync(path.join(workspaceDir, 'jest.config.js'), 'module.exports = {};');
        const result = resolveConfigPath(['jest.config.js'], workspaceDir);
        expect(result).toBeDefined();
        expect(result!.toLowerCase()).toContain('jest.config.js');
    });

    it('should find config in parent directory if no stopPath is provided', () => {
        fs.writeFileSync(path.join(parentDir, 'jest.config.js'), 'module.exports = {};');
        const result = resolveConfigPath(['jest.config.js'], workspaceDir);
        expect(result).toBeDefined();
        expect(result!.toLowerCase()).toContain(path.join(parentDir, 'jest.config.js').toLowerCase());
    });

    it('should NOT find config in parent directory if stopPath is set to workspace', () => {
        fs.writeFileSync(path.join(parentDir, 'jest.config.js'), 'module.exports = {};');

        const result = resolveConfigPath(
            ['jest.config.js'],
            workspaceDir,
            workspaceDir // Stop at workspace
        );

        expect(result).toBeUndefined();
    });

    it('should find config in workspace directory even if stopPath is set to workspace', () => {
        fs.writeFileSync(path.join(workspaceDir, 'jest.config.js'), 'module.exports = {};');

        const result = resolveConfigPath(
            ['jest.config.js'],
            workspaceDir,
            workspaceDir
        );

        expect(result).toBeDefined();
        expect(result!.toLowerCase()).toBe(path.join(workspaceDir, 'jest.config.js').toLowerCase());
    });
});
