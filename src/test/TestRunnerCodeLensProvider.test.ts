import * as fastGlob from 'fast-glob';
import * as vscode from 'vscode';
import * as parser from '../parser';
import { TestRunnerCodeLensProvider } from '../TestRunnerCodeLensProvider';
import { testFileCache } from '../testDetection/testFileCache';
import { Document, Uri, WorkspaceFolder } from './__mocks__/vscode';

jest.mock('fast-glob');

describe('TestRunnerCodeLensProvider', () => {
	let codeLensProvider: TestRunnerCodeLensProvider;
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

		jest
			.spyOn(vscode.workspace, 'getWorkspaceFolder')
			.mockReturnValue(
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

		jest.spyOn(testFileCache, 'isTestFile').mockReturnValue(true);

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
			codeLensProvider = new TestRunnerCodeLensProvider(['run']);
			expect(codeLensProvider).toBeDefined();
		});

		it('should create instance with multiple options', () => {
			codeLensProvider = new TestRunnerCodeLensProvider([
				'run',
				'debug',
				'watch',
			]);
			expect(codeLensProvider).toBeDefined();
		});
	});

	describe('provideCodeLenses', () => {
		beforeEach(() => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run', 'debug']);
		});

		it('should provide code lenses for test file', async () => {
			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
			expect(codeLenses).toBeDefined();
			expect(Array.isArray(codeLenses)).toBe(true);
		});

		it('should provide run and debug lenses for each test', async () => {
			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
			expect(codeLenses.length).toBeGreaterThan(0);

			const commands = codeLenses.map((lens) => lens.command?.command);
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
			const expectLenses = codeLenses.filter((lens) =>
				lens.command?.arguments?.[0]?.includes('expect'),
			);
			expect(expectLenses.length).toBe(0);
		});

		it('should handle parse errors gracefully', async () => {
			mockDocument.getText = jest
				.fn()
				.mockReturnValue('invalid javascript code {{{');

			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
			expect(codeLenses).toBeDefined();
			expect(Array.isArray(codeLenses)).toBe(true);
		});

		it('should cache last successful code lenses on error', async () => {
			mockDocument.getText = jest.fn().mockReturnValue(`
        describe('Suite', () => {
          it('test', () => {});
        });
      `);
			const firstResult =
				await codeLensProvider.provideCodeLenses(mockDocument);

			mockDocument.getText = jest.fn().mockReturnValue('invalid code {{{');
			const secondResult =
				await codeLensProvider.provideCodeLenses(mockDocument);

			expect(secondResult).toEqual(firstResult);
		});
	});

	describe('include/exclude patterns', () => {
		beforeEach(() => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run']);
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
			jest.spyOn(testFileCache, 'isTestFile').mockReturnValue(false);

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
			jest.spyOn(testFileCache, 'isTestFile').mockReturnValue(false);

			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
			expect(codeLenses).toEqual([]);
		});
	});

	describe('code lens commands', () => {
		it('should create run command with correct title and command', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run']);
			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			const runLens = codeLenses.find(
				(lens) => lens.command?.command === 'extension.runJest',
			);
			expect(runLens).toBeDefined();
			expect(runLens.command?.title).toBe('Run');
		});

		it('should create debug command with correct title and command', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['debug']);
			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			const debugLens = codeLenses.find(
				(lens) => lens.command?.command === 'extension.debugJest',
			);
			expect(debugLens).toBeDefined();
			expect(debugLens.command?.title).toBe('Debug');
		});

		it('should create watch command with correct title and command', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['watch']);
			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			const watchLens = codeLenses.find(
				(lens) => lens.command?.command === 'extension.watchJest',
			);
			expect(watchLens).toBeDefined();
			expect(watchLens.command?.title).toBe('Run --watch');
		});

		it('should create coverage command with correct title and command', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['coverage']);
			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			const coverageLens = codeLenses.find(
				(lens) => lens.command?.command === 'extension.runJestCoverage',
			);
			expect(coverageLens).toBeDefined();
			expect(coverageLens.command?.title).toBe('Run --coverage');
		});

		it('should create current-test-coverage command with correct title and command', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider([
				'current-test-coverage',
			]);
			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			const coverageLens = codeLenses.find(
				(lens) =>
					lens.command?.command === 'extension.runJestCurrentTestCoverage',
			);
			expect(coverageLens).toBeDefined();
			expect(coverageLens.command?.title).toBe(
				'Run --collectCoverageFrom (target file/dir)',
			);
		});
	});

	describe('nested test structures', () => {
		it('should provide lenses for nested describe blocks', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run']);
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
			codeLensProvider = new TestRunnerCodeLensProvider(['run']);
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
			expect(codeLenses.length).toBeGreaterThanOrEqual(4);
		});
	});

	describe('test.each and describe.each', () => {
		it('should provide lenses for test.each', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run']);
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
			codeLensProvider = new TestRunnerCodeLensProvider(['run']);
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

		it('should resolve $placeholders for code lens test-name patterns', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run', 'debug']);
			mockDocument.getText = jest.fn().mockReturnValue(`
        const cases = [{ title: 'test 1' }];
        describe.each(cases)('xyz by $title', (testCase) => {
          it('works', () => {
            expect(testCase.title).toBeTruthy();
          });
        });
      `);

			jest.spyOn(parser, 'parse').mockReturnValue({
				root: {
					children: [
						{
							type: 'describe',
							name: 'xyz by $title',
							start: { line: 3, column: 8 },
							end: { line: 7, column: 10 },
							file: '/workspace/test.spec.ts',
							children: [
								{
									type: 'it',
									name: 'works',
									start: { line: 4, column: 10 },
									end: { line: 6, column: 12 },
									file: '/workspace/test.spec.ts',
									children: [],
								},
							],
						},
					],
				},
			} as any);

			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);
			const commandArgs = codeLenses
				.map((lens) => lens.command?.arguments?.[0] as string | undefined)
				.filter((arg): arg is string => Boolean(arg));

			expect(commandArgs.some((arg) => arg.includes('xyz by'))).toBe(true);
			expect(commandArgs.some((arg) => arg.includes('$title'))).toBe(false);
			expect(commandArgs.some((arg) => arg.includes('\\$title'))).toBe(false);
		});

		it('should provide individual lenses and "Run All" for it.each expanded tests', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run', 'debug']);
			mockDocument.getText = jest.fn().mockReturnValue(`
        it.each([1, 2, 3])('test %s', (n) => {
          expect(n).toBeTruthy();
        });
      `);

			// Mock parser to return expanded it.each tests
			jest.spyOn(parser, 'parse').mockReturnValue({
				root: {
					children: [
						{
							type: 'it',
							name: 'test 1',
							start: { line: 2, column: 8 },
							end: { line: 4, column: 10 },
							file: '/workspace/test.spec.ts',
							children: [],
							eachTemplate: 'test %s',
						},
						{
							type: 'it',
							name: 'test 2',
							start: { line: 2, column: 8 }, // Same line as above
							end: { line: 4, column: 10 },
							file: '/workspace/test.spec.ts',
							children: [],
							eachTemplate: 'test %s',
						},
						{
							type: 'it',
							name: 'test 3',
							start: { line: 2, column: 8 }, // Same line as above
							end: { line: 4, column: 10 },
							file: '/workspace/test.spec.ts',
							children: [],
							eachTemplate: 'test %s',
						},
					],
				},
			} as any);

			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			expect(codeLenses).toHaveLength(2);

			const runMenu = codeLenses.find(
				(lens) => lens.command?.title === 'Run...',
			);
			expect(runMenu?.command?.command).toBe('extension.showCodeLensMenu');
			const runItems = runMenu?.command?.arguments?.[0] as any[];
			expect(runItems).toHaveLength(4);
			expect(runItems[0]).toMatchObject({
				label: 'Run All',
				command: 'extension.runJest',
			});
			expect(runItems[0].arguments[0]).toContain('test (.*?)');
			expect(runItems.map((item) => item.label)).toEqual([
				'Run All',
				'Run test 1',
				'Run test 2',
				'Run test 3',
			]);

			const debugMenu = codeLenses.find(
				(lens) => lens.command?.title === 'Debug...',
			);
			expect(debugMenu?.command?.command).toBe('extension.showCodeLensMenu');
			const debugItems = debugMenu?.command?.arguments?.[0] as any[];
			expect(debugItems[0]).toMatchObject({
				label: 'Debug All',
				command: 'extension.debugJest',
			});
			expect(debugItems[0].arguments[0]).toContain('test (.*?)');
		});

		it('should provide individual lenses and "Run All" for describe.each expanded suites', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run', 'debug']);
			mockDocument.getText = jest.fn().mockReturnValue(`
        const cases = [{ title: 'A' }, { title: 'B' }];
        describe.each(cases)('group $title', () => {});
      `);

			jest.spyOn(parser, 'parse').mockReturnValue({
				root: {
					children: [
						{
							type: 'describe',
							name: 'group A',
							start: { line: 3, column: 8 },
							end: { line: 3, column: 40 },
							file: '/workspace/test.spec.ts',
							children: [],
							eachTemplate: 'group $title',
						},
						{
							type: 'describe',
							name: 'group B',
							start: { line: 3, column: 8 },
							end: { line: 3, column: 40 },
							file: '/workspace/test.spec.ts',
							children: [],
							eachTemplate: 'group $title',
						},
					],
				},
			} as any);

			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			expect(codeLenses).toHaveLength(2);

			const runMenu = codeLenses.find(
				(lens) => lens.command?.title === 'Run...',
			);
			const runItems = runMenu?.command?.arguments?.[0] as any[];
			expect(runItems.map((item) => item.label)).toEqual([
				'Run All',
				'Run group A',
				'Run group B',
			]);
			expect(runItems[0].arguments[0]).toContain('group');
			expect(runItems[0].arguments[0]).not.toContain('$title');

			const debugMenu = codeLenses.find(
				(lens) => lens.command?.title === 'Debug...',
			);
			const debugItems = debugMenu?.command?.arguments?.[0] as any[];
			expect(debugItems.map((item) => item.label)).toEqual([
				'Debug All',
				'Debug group A',
				'Debug group B',
			]);
		});

		it('should provide Run All and indexed lenses for nested it inside describe.each', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run', 'debug']);
			mockDocument.getText = jest.fn().mockReturnValue(`
        const cases = [
          { title: 'test 1', id: 42 },
          { title: 'test 2', id: 99 }
        ];

        describe.each(cases)('xyz group by $title', (test_case) => {
          it(\`should run correctly for id \${test_case.id}\`, () => {
            expect(test_case.id).toBeGreaterThan(0);
          });
        });
      `);

			jest.spyOn(parser, 'parse').mockReturnValue({
				root: {
					children: [
						{
							type: 'describe',
							name: 'xyz group by test 1',
							start: { line: 7, column: 8 },
							end: { line: 11, column: 10 },
							file: '/workspace/test.spec.ts',
							eachTemplate: 'xyz group by $title',
							children: [
								{
									type: 'it',
									name: 'should run correctly for id 42',
									start: { line: 8, column: 10 },
									end: { line: 10, column: 12 },
									file: '/workspace/test.spec.ts',
									eachTemplate: 'should run correctly for id ${test_case.id}',
									children: [],
								},
							],
						},
						{
							type: 'describe',
							name: 'xyz group by test 2',
							start: { line: 7, column: 8 },
							end: { line: 11, column: 10 },
							file: '/workspace/test.spec.ts',
							eachTemplate: 'xyz group by $title',
							children: [
								{
									type: 'it',
									name: 'should run correctly for id 99',
									start: { line: 8, column: 10 },
									end: { line: 10, column: 12 },
									file: '/workspace/test.spec.ts',
									eachTemplate: 'should run correctly for id ${test_case.id}',
									children: [],
								},
							],
						},
					],
				},
			} as any);

			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			const runMenus = codeLenses.filter(
				(lens) => lens.command?.title === 'Run...',
			);
			const runItems = runMenus
				.map((lens) => lens.command?.arguments?.[0] as any[])
				.find((items) => items?.some((item) => item.label.includes('id 42')));

			expect(runItems).toBeDefined();
			expect(runItems?.[0].label).toBe('Run All');
			expect(runItems?.[0].arguments[0]).toContain('xyz group by');
			expect(runItems?.[0].arguments[0]).not.toContain('$title');
			expect(runItems?.map((item) => item.label)).toEqual([
				'Run All',
				'Run xyz group by test 1 should run correctly for id 42',
				'Run xyz group by test 2 should run correctly for id 99',
			]);

			const debugMenus = codeLenses.filter(
				(lens) => lens.command?.title === 'Debug...',
			);
			const debugItems = debugMenus
				.map((lens) => lens.command?.arguments?.[0] as any[])
				.find((items) => items?.some((item) => item.label.includes('id 42')));
			expect(debugItems?.[0].label).toBe('Debug All');
		});

		it('should provide indexed Run/Debug lenses for real it.each(cases) parser output', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run', 'debug']);
			mockDocument.getText = jest.fn().mockReturnValue(`
        describe("computeTierFromScore", () => {
          const basicContext = { isPrimary: true } as any
          const secondaryContext = { isPrimary: false } as any

          const cases = [
            { score: 0, primary: 0, secondary: 0 },
            { score: 12.25, primary: 0, secondary: 0 },
            { score: 12.5, primary: 1, secondary: 2 },
          ]

          it.each(cases)(
            "resolves tier for score $score -> primary $primary, secondary $secondary",
            ({ score, primary, secondary }) => {
              const primaryRes = computeTierFromScore({ score }, basicContext)
              const secondaryRes = computeTierFromScore({ score }, secondaryContext)

              expect(primaryRes?.value).toBe(primary)
              expect(secondaryRes?.value).toBe(secondary)
            },
          )
        })
      `);

			const actualParser = jest.requireActual('../parser');
			(parser.parse as jest.Mock).mockImplementation(
				(filePath: string, content?: string) =>
					actualParser.parse(filePath, content),
			);

			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			const runMenu = codeLenses.find(
				(lens) => lens.command?.title === 'Run...',
			);
			const runItems = runMenu?.command?.arguments?.[0] as any[];
			expect(runItems.map((item) => item.label)).toEqual([
				'Run All',
				'Run computeTierFromScore resolves tier for score 0 -> primary 0, secondary 0',
				'Run computeTierFromScore resolves tier for score 12.25 -> primary 0, secondary 0',
				'Run computeTierFromScore resolves tier for score 12.5 -> primary 1, secondary 2',
			]);

			const debugMenu = codeLenses.find(
				(lens) => lens.command?.title === 'Debug...',
			);
			const debugItems = debugMenu?.command?.arguments?.[0] as any[];
			expect(debugItems.map((item) => item.label)).toEqual([
				'Debug All',
				'Debug computeTierFromScore resolves tier for score 0 -> primary 0, secondary 0',
				'Debug computeTierFromScore resolves tier for score 12.25 -> primary 0, secondary 0',
				'Debug computeTierFromScore resolves tier for score 12.5 -> primary 1, secondary 2',
			]);
		});

		it('should include all nested describe ancestors in Run All pattern for it.each', async () => {
			codeLensProvider = new TestRunnerCodeLensProvider(['run', 'debug']);
			mockDocument.getText = jest.fn().mockReturnValue(`
        describe('Level one', () => {
          describe('Level two', () => {
            it.each([[1], [2]])('My test %#', (value) => {
              expect(value).toBeGreaterThan(0);
            });
          });
        });
      `);

			jest.spyOn(parser, 'parse').mockReturnValue({
				root: {
					children: [
						{
							type: 'describe',
							name: 'Level one',
							start: { line: 2, column: 8 },
							end: { line: 8, column: 10 },
							file: '/workspace/test.spec.ts',
							children: [
								{
									type: 'describe',
									name: 'Level two',
									start: { line: 3, column: 10 },
									end: { line: 7, column: 12 },
									file: '/workspace/test.spec.ts',
									children: [
										{
											type: 'it',
											name: 'My test 0',
											start: { line: 4, column: 12 },
											end: { line: 6, column: 14 },
											file: '/workspace/test.spec.ts',
											children: [],
											eachTemplate: 'My test %#',
										},
										{
											type: 'it',
											name: 'My test 1',
											start: { line: 4, column: 18 },
											end: { line: 6, column: 14 },
											file: '/workspace/test.spec.ts',
											children: [],
											eachTemplate: 'My test %#',
										},
									],
								},
							],
						},
					],
				},
			} as any);

			const codeLenses = await codeLensProvider.provideCodeLenses(mockDocument);

			const runMenu = codeLenses.find(
				(lens) => lens.command?.title === 'Run...',
			);
			const runItems = runMenu?.command?.arguments?.[0] as any[];
			expect(runItems[0].label).toBe('Run All');
			expect(runItems[0].arguments[0]).toContain('Level one');
			expect(runItems[0].arguments[0]).toContain('Level two');
			expect(runItems[0].arguments[0]).toContain('My test (.*?)');
		});
	});
});
