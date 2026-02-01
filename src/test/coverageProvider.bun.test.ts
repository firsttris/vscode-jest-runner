
import * as path from 'path';
import * as fs from 'fs';
import { CoverageProvider } from '../coverageProvider';
import { TestFrameworkName } from '../testDetection/frameworkDefinitions';
import * as lcovParser from '../parsers/lcov-parser';

jest.mock('fs');
jest.mock('../parsers/lcov-parser');

describe('CoverageProvider Bun Path Resolution', () => {
    let coverageProvider: CoverageProvider;
    const workspaceFolder = '/home/user/project';
    const bunCoveragePath = path.join(workspaceFolder, 'coverage', 'lcov.info');

    beforeEach(() => {
        coverageProvider = new CoverageProvider();
        jest.clearAllMocks();
    });

    it('should find lcov.info in coverage/lcov.info if not in root for Bun', async () => {
        // Mock fs.existsSync
        (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
            if (p === bunCoveragePath) return true;
            return false;
        });

        // Mock parseLcov to return valid data so readCoverageFromFile succeeds
        (lcovParser.parseLcov as jest.Mock).mockResolvedValue([
            {
                file: 'test.ts',
                lines: { details: [] },
                functions: { details: [] },
                branches: { details: [] }
            }
        ]);

        const result = await coverageProvider.readCoverageFromFile(
            workspaceFolder,
            'bun' as TestFrameworkName
        );

        expect(lcovParser.parseLcov).toHaveBeenCalledWith(bunCoveragePath);
        expect(result).toBeDefined();
    });

    it('should prefer root lcov.info if it exists', async () => {
        const rootLcovPath = path.join(workspaceFolder, 'lcov.info');
        // Mock fs.existsSync
        (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
            if (p === rootLcovPath) return true;
            if (p === bunCoveragePath) return true;
            return false;
        });

        (lcovParser.parseLcov as jest.Mock).mockResolvedValue([
            {
                file: 'test.ts',
                lines: { details: [] },
                functions: { details: [] },
                branches: { details: [] }
            }
        ]);

        await coverageProvider.readCoverageFromFile(
            workspaceFolder,
            'bun' as TestFrameworkName
        );

        expect(lcovParser.parseLcov).toHaveBeenCalledWith(rootLcovPath);
    });

    it('should not look in coverage/lcov.info for Jest', async () => {
        // Mock fs.existsSync
        (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
            // CoverageProvider checks config path for Jest, let's assume defaults
            const defaultCoveragePath = path.join(workspaceFolder, 'coverage', 'coverage-final.json');
            if (p === defaultCoveragePath) return true;
            return false;
        });

        // Mock readFileSync
        (fs.readFileSync as jest.Mock).mockReturnValue('{}');

        await coverageProvider.readCoverageFromFile(
            workspaceFolder,
            'jest' as TestFrameworkName
        );

        // Should NOT call parseLcov at all for Jest (it uses JSON)
        expect(lcovParser.parseLcov).not.toHaveBeenCalled();
    });
});
