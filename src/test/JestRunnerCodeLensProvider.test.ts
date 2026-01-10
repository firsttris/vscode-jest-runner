import { JestRunnerCodeLensProvider } from '../JestRunnerCodeLensProvider';
import * as vscode from 'vscode';
import { Document, Uri, WorkspaceFolder } from './__mocks__/vscode';
import * as fastGlob from 'fast-glob';
import * as parser from '../parser';
import * as util from '../util';

jest.mock('fast-glob');

describe('JestRunnerCodeLensProvider', () => {
  let codeLensProvider: JestRunnerCodeLensProvider;
  let mockDocument: vscode.TextDocument;

  beforeEach(() => {
    jest.restoreAllMocks();
    
    const mockUri = new Uri('/workspace/test.spec.ts');
    mockDocument = new Document(mockUri) as any;
    (mockDocument as any).fileName = '/workspace/test.spec.ts';
    mockDocument.getText = jest.fn().mockReturnValue(`
      describe('My Test Suite', () => {
        it('should work', () => {
          expect(true).toBe(true);
        });
      });
    `);

    jest.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue(
      new WorkspaceFolder(new Uri('/workspace') as any) as any,
    );

    jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
      document: mockDocument,
    } as any);

    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'include') return defaultValue || [];
        if (key === 'exclude') return defaultValue || [];
        return defaultValue;
      }),
    } as any);

    (fastGlob.sync as jest.Mock).mockReturnValue([]);
    
    // Mock shouldIncludeFile to return true for test files
    jest.spyOn(util, 'shouldIncludeFile').mockReturnValue(true);
    
    // Mock the parser to return test nodes
    jest.spyOn(parser, 'parse').mockReturnValue({
      root: {
        children: [
          {
            type: 'describe',
            name: 'My Test Suite',
            start: { line: 2, column: 6 },
            end: { line: 6, column: 8 },
            file: '/workspace/test.spec.ts',
            children: [
              {
                type: 'it',
                name: 'should work',
                start: { line: 3, column: 8 },
                end: { line: 5, column: 10 },
                file: '/workspace/test.spec.ts',
                children: [],
              },
            ],
          },
        ],
      },
    } as any);
  });

  describe('constructor', () => {
    it('should create instance with run option', () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['run']);
      expect(codeLensProvider).toBeDefined();
    });

    it('should create instance with multiple options', () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['run', 'debug', 'watch']);
      expect(codeLensProvider).toBeDefined();
    });
  });

  describe('provideCodeLenses', () => {
    beforeEach(() => {
      codeLensProvider = new JestRunnerCodeLensProvider(['run', 'debug']);
    });

    it('should provide code lenses for test file', async () => {
      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      expect(codeLenses).toBeDefined();
      expect(Array.isArray(codeLenses)).toBe(true);
    });

    it('should provide run and debug lenses for each test', async () => {
      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      expect(codeLenses.length).toBeGreaterThan(0);
      
      const commands = codeLenses.map(lens => lens.command?.command);
      expect(commands).toContain('extension.runJest');
      expect(commands).toContain('extension.debugJest');
    });

    it('should not provide lenses for expect blocks', async () => {
      mockDocument.getText = jest.fn().mockReturnValue(`
        describe('My Test Suite', () => {
          it('should work', () => {
            expect(true).toBe(true);
          });
        });
      `);

      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      const expectLenses = codeLenses.filter(lens => 
        lens.command?.arguments?.[0]?.includes('expect')
      );
      expect(expectLenses.length).toBe(0);
    });

    it('should handle parse errors gracefully', async () => {
      mockDocument.getText = jest.fn().mockReturnValue('invalid javascript code {{{');
      
      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      expect(codeLenses).toBeDefined();
      expect(Array.isArray(codeLenses)).toBe(true);
    });

    it('should cache last successful code lenses on error', async () => {
      // First call with valid code
      mockDocument.getText = jest.fn().mockReturnValue(`
        describe('Suite', () => {
          it('test', () => {});
        });
      `);
      const firstResult = await codeLensProvider.provideCodeLenses(mockDocument);
      
      // Second call with invalid code
      mockDocument.getText = jest.fn().mockReturnValue('invalid code {{{');
      const secondResult = await codeLensProvider.provideCodeLenses(mockDocument);
      
      // Should return cached result
      expect(secondResult).toEqual(firstResult);
    });
  });

  describe('include/exclude patterns', () => {
    beforeEach(() => {
      codeLensProvider = new JestRunnerCodeLensProvider(['run']);
    });

    it('should not provide lenses when file is not in include pattern', async () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'include') return ['**/*.test.ts'];
          if (key === 'exclude') return [];
          return defaultValue;
        }),
      } as any);

      (fastGlob.sync as jest.Mock).mockReturnValue([]); // File not in include list
      jest.spyOn(util, 'shouldIncludeFile').mockReturnValue(false);

      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      expect(codeLenses).toEqual([]);
    });

    it('should provide lenses when file matches include pattern', async () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'include') return ['**/*.spec.ts'];
          if (key === 'exclude') return [];
          return defaultValue;
        }),
      } as any);

      (fastGlob.sync as jest.Mock).mockReturnValue(['/workspace/test.spec.ts']);

      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      expect(codeLenses.length).toBeGreaterThan(0);
    });

    it('should not provide lenses when file matches exclude pattern', async () => {
      jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'include') return [];
          if (key === 'exclude') return ['**/*.spec.ts'];
          return defaultValue;
        }),
      } as any);

      (fastGlob.sync as jest.Mock).mockReturnValue(['/workspace/test.spec.ts']);
      jest.spyOn(util, 'shouldIncludeFile').mockReturnValue(false);

      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      expect(codeLenses).toEqual([]);
    });
  });

  describe('code lens commands', () => {
    it('should create run command with correct title and command', async () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['run']);
      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      
      const runLens = codeLenses.find(lens => lens.command?.command === 'extension.runJest');
      expect(runLens).toBeDefined();
      expect(runLens.command?.title).toBe('Run');
    });

    it('should create debug command with correct title and command', async () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['debug']);
      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      
      const debugLens = codeLenses.find(lens => lens.command?.command === 'extension.debugJest');
      expect(debugLens).toBeDefined();
      expect(debugLens.command?.title).toBe('Debug');
    });

    it('should create watch command with correct title and command', async () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['watch']);
      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      
      const watchLens = codeLenses.find(lens => lens.command?.command === 'extension.watchJest');
      expect(watchLens).toBeDefined();
      expect(watchLens.command?.title).toBe('Run --watch');
    });

    it('should create coverage command with correct title and command', async () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['coverage']);
      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      
      const coverageLens = codeLenses.find(lens => lens.command?.command === 'extension.runJestCoverage');
      expect(coverageLens).toBeDefined();
      expect(coverageLens.command?.title).toBe('Run --coverage');
    });

    it('should create current-test-coverage command with correct title and command', async () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['current-test-coverage']);
      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      
      const coverageLens = codeLenses.find(
        lens => lens.command?.command === 'extension.runJestCurrentTestCoverage'
      );
      expect(coverageLens).toBeDefined();
      expect(coverageLens.command?.title).toBe('Run --collectCoverageFrom (target file/dir)');
    });
  });

  describe('nested test structures', () => {
    it('should provide lenses for nested describe blocks', async () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['run']);
      mockDocument.getText = jest.fn().mockReturnValue(`
        describe('Outer Suite', () => {
          describe('Inner Suite', () => {
            it('nested test', () => {});
          });
        });
      `);
      
      jest.spyOn(parser, 'parse').mockReturnValue({
        root: {
          children: [
            {
              type: 'describe',
              name: 'Outer Suite',
              start: { line: 2, column: 8 },
              end: { line: 6, column: 10 },
              file: '/workspace/test.spec.ts',
              children: [
                {
                  type: 'describe',
                  name: 'Inner Suite',
                  start: { line: 3, column: 10 },
                  end: { line: 5, column: 12 },
                  file: '/workspace/test.spec.ts',
                  children: [
                    {
                      type: 'it',
                      name: 'nested test',
                      start: { line: 4, column: 12 },
                      end: { line: 4, column: 40 },
                      file: '/workspace/test.spec.ts',
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      } as any);

      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      expect(codeLenses.length).toBeGreaterThan(0);
    });

    it('should provide lenses for multiple tests in same suite', async () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['run']);
      mockDocument.getText = jest.fn().mockReturnValue(`
        describe('Suite', () => {
          it('test 1', () => {});
          it('test 2', () => {});
          it('test 3', () => {});
        });
      `);
      
      jest.spyOn(parser, 'parse').mockReturnValue({
        root: {
          children: [
            {
              type: 'describe',
              name: 'Suite',
              start: { line: 2, column: 8 },
              end: { line: 6, column: 10 },
              file: '/workspace/test.spec.ts',
              children: [
                {
                  type: 'it',
                  name: 'test 1',
                  start: { line: 3, column: 10 },
                  end: { line: 3, column: 32 },
                  file: '/workspace/test.spec.ts',
                  children: [],
                },
                {
                  type: 'it',
                  name: 'test 2',
                  start: { line: 4, column: 10 },
                  end: { line: 4, column: 32 },
                  file: '/workspace/test.spec.ts',
                  children: [],
                },
                {
                  type: 'it',
                  name: 'test 3',
                  start: { line: 5, column: 10 },
                  end: { line: 5, column: 32 },
                  file: '/workspace/test.spec.ts',
                  children: [],
                },
              ],
            },
          ],
        },
      } as any);

      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      // Should have lenses for describe + 3 its = 4 * 1 (run) = 4
      expect(codeLenses.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('test.each and describe.each', () => {
    it('should provide lenses for test.each', async () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['run']);
      mockDocument.getText = jest.fn().mockReturnValue(`
        test.each([
          [1, 2, 3],
          [2, 3, 5],
        ])('should add %i + %i = %i', (a, b, expected) => {
          expect(a + b).toBe(expected);
        });
      `);
      
      jest.spyOn(parser, 'parse').mockReturnValue({
        root: {
          children: [
            {
              type: 'it',
              name: 'should add %i + %i = %i',
              start: { line: 2, column: 8 },
              end: { line: 6, column: 11 },
              file: '/workspace/test.spec.ts',
              children: [],
            },
          ],
        },
      } as any);

      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      expect(codeLenses.length).toBeGreaterThan(0);
    });

    it('should provide lenses for describe.each', async () => {
      codeLensProvider = new JestRunnerCodeLensProvider(['run']);
      mockDocument.getText = jest.fn().mockReturnValue(`
        describe.each([
          ['Apple', 'red'],
          ['Banana', 'yellow'],
        ])('%s is %s', (fruit, color) => {
          it('should match', () => {
            expect(true).toBe(true);
          });
        });
      `);
      
      jest.spyOn(parser, 'parse').mockReturnValue({
        root: {
          children: [
            {
              type: 'describe',
              name: '%s is %s',
              start: { line: 2, column: 8 },
              end: { line: 8, column: 10 },
              file: '/workspace/test.spec.ts',
              children: [
                {
                  type: 'it',
                  name: 'should match',
                  start: { line: 5, column: 10 },
                  end: { line: 7, column: 12 },
                  file: '/workspace/test.spec.ts',
                  children: [],
                },
              ],
            },
          ],
        },
      } as any);

      const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
      expect(codeLenses.length).toBeGreaterThan(0);
    });
  });
});
