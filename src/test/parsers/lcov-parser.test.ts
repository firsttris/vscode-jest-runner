import { parseLcov } from '../../parsers/lcov-parser';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('LCOV Parser', () => {
  const testTmpDir = join(tmpdir(), 'lcov-parser-test');

  beforeAll(() => {
    if (!existsSync(testTmpDir)) {
      mkdirSync(testTmpDir, { recursive: true });
    }
  });

  describe('parseLcov', () => {
    it('should parse valid LCOV data with lines coverage', async () => {
      const lcovData = `TN:
SF:/path/to/file.js
FNF:0
FNH:0
LF:3
LH:2
DA:1,1
DA:2,0
DA:3,1
BRF:0
BRH:0
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('/path/to/file.js');
      expect(result[0].lines.found).toBe(3);
      expect(result[0].lines.hit).toBe(2);
      expect(result[0].lines.details).toHaveLength(3);
      expect(result[0].lines.details[0]).toEqual({ line: 1, hit: 1 });
      expect(result[0].lines.details[1]).toEqual({ line: 2, hit: 0 });
      expect(result[0].lines.details[2]).toEqual({ line: 3, hit: 1 });
    });

    it('should parse LCOV data with function coverage', async () => {
      const lcovData = `TN:
SF:/path/to/file.js
FN:1,myFunction
FN:5,anotherFunction
FNDA:3,myFunction
FNDA:0,anotherFunction
FNF:2
FNH:1
LF:0
LH:0
BRF:0
BRH:0
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].functions.found).toBe(2);
      expect(result[0].functions.hit).toBe(1);
      expect(result[0].functions.details).toHaveLength(2);
      expect(result[0].functions.details[0]).toEqual({
        name: 'myFunction',
        line: 1,
        hit: 3
      });
      expect(result[0].functions.details[1]).toEqual({
        name: 'anotherFunction',
        line: 5,
        hit: 0
      });
    });

    it('should parse LCOV data with branch coverage', async () => {
      const lcovData = `TN:
SF:/path/to/file.js
FNF:0
FNH:0
LF:0
LH:0
BRDA:1,0,0,5
BRDA:1,0,1,3
BRDA:5,0,0,-
BRDA:5,0,1,2
BRF:4
BRH:3
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].branches.found).toBe(4);
      expect(result[0].branches.hit).toBe(3);
      expect(result[0].branches.details).toHaveLength(4);
      expect(result[0].branches.details[0]).toEqual({
        line: 1,
        block: 0,
        branch: 0,
        taken: 5
      });
      expect(result[0].branches.details[2]).toEqual({
        line: 5,
        block: 0,
        branch: 0,
        taken: 0 // '-' should be converted to 0
      });
    });

    it('should parse LCOV data with test name', async () => {
      const lcovData = `TN:My Test Suite
SF:/path/to/file.js
FNF:0
FNH:0
LF:0
LH:0
BRF:0
BRH:0
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('My Test Suite');
    });

    it('should parse multiple records', async () => {
      const lcovData = `TN:
SF:/path/to/file1.js
LF:2
LH:2
DA:1,1
DA:2,1
FNF:0
FNH:0
BRF:0
BRH:0
end_of_record
TN:
SF:/path/to/file2.js
LF:3
LH:1
DA:1,1
DA:2,0
DA:3,0
FNF:0
FNH:0
BRF:0
BRH:0
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(2);
      expect(result[0].file).toBe('/path/to/file1.js');
      expect(result[0].lines.found).toBe(2);
      expect(result[0].lines.hit).toBe(2);
      expect(result[1].file).toBe('/path/to/file2.js');
      expect(result[1].lines.found).toBe(3);
      expect(result[1].lines.hit).toBe(1);
    });

    it('should parse LCOV file from file path', async () => {
      const testFile = join(testTmpDir, 'coverage.lcov');
      const lcovData = `TN:
SF:/path/to/file.js
LF:1
LH:1
DA:1,1
FNF:0
FNH:0
BRF:0
BRH:0
end_of_record
`;

      writeFileSync(testFile, lcovData, 'utf8');

      const result = await parseLcov(testFile);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('/path/to/file.js');

      unlinkSync(testFile);
    });

    it('should handle SF values with colons in path', async () => {
      const lcovData = `TN:
SF:C:/Users/test/file.js
LF:1
LH:1
DA:1,1
FNF:0
FNH:0
BRF:0
BRH:0
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('C:/Users/test/file.js');
    });

    it('should throw error for empty data', async () => {
      await expect(parseLcov('')).rejects.toThrow('Failed to parse LCOV data: no records found');
    });

    it('should throw error for data without end_of_record', async () => {
      const lcovData = `TN:
SF:/path/to/file.js
LF:1
LH:1
DA:1,1
`;

      await expect(parseLcov(lcovData)).rejects.toThrow('Failed to parse LCOV data: no records found');
    });

    it('should handle empty lines and whitespace', async () => {
      const lcovData = `
TN:
SF:/path/to/file.js

LF:1
LH:1

DA:1,1

FNF:0
FNH:0
BRF:0
BRH:0

end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('/path/to/file.js');
    });

    it('should handle complex real-world LCOV format', async () => {
      const lcovData = `TN:
SF:src/utils/helper.ts
FN:1,calculateTotal
FN:10,formatCurrency
FNDA:5,calculateTotal
FNDA:3,formatCurrency
FNF:2
FNH:2
DA:1,5
DA:2,5
DA:3,3
DA:4,2
DA:5,5
DA:10,3
DA:11,3
DA:12,3
LF:8
LH:8
BRDA:3,0,0,2
BRDA:3,0,1,1
BRF:2
BRH:2
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('src/utils/helper.ts');
      expect(result[0].lines.found).toBe(8);
      expect(result[0].lines.hit).toBe(8);
      expect(result[0].functions.found).toBe(2);
      expect(result[0].functions.hit).toBe(2);
      expect(result[0].branches.found).toBe(2);
      expect(result[0].branches.hit).toBe(2);
      expect(result[0].functions.details).toContainEqual({
        name: 'calculateTotal',
        line: 1,
        hit: 5
      });
    });
  });

  describe('edge cases', () => {
    it('should handle function without hit count', async () => {
      const lcovData = `TN:
SF:/path/to/file.js
FN:1,myFunction
FNF:1
FNH:0
LF:0
LH:0
BRF:0
BRH:0
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].functions.details[0]).toEqual({
        name: 'myFunction',
        line: 1
        // hit should be undefined
      });
    });

    it('should handle lines without colons gracefully', async () => {
      const lcovData = `TN:
SF:/path/to/file.js
INVALID_LINE_WITHOUT_COLON
LF:1
LH:1
DA:1,1
FNF:0
FNH:0
BRF:0
BRH:0
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('/path/to/file.js');
    });

    it('should initialize empty structures correctly', async () => {
      const lcovData = `TN:
SF:/path/to/file.js
FNF:0
FNH:0
LF:0
LH:0
BRF:0
BRH:0
end_of_record
`;

      const result = await parseLcov(lcovData);

      expect(result).toHaveLength(1);
      expect(result[0].lines.details).toEqual([]);
      expect(result[0].functions.details).toEqual([]);
      expect(result[0].branches.details).toEqual([]);
      expect(result[0].lines.found).toBe(0);
      expect(result[0].lines.hit).toBe(0);
    });
  });
});
