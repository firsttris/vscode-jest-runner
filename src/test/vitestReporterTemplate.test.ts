import vitestReporterSource from '../reporters/vitestReporterTemplate.js?raw';
import {
	extractStructuredMessages,
	parseStructuredResults,
} from '../reporting/structuredOutput';

interface Reporter {
	onTestRunEnd(testModules: unknown[]): void;
	onFinished(files: unknown[]): void;
}

// Evaluates the reporter template with stdout writes captured.
const loadReporter = (): { reporter: Reporter; output: () => string } => {
	let written = '';
	const fakeModule = { exports: {} as new () => Reporter };
	const fakeProcess = {
		env: { JSTR_SESSION_ID: 's1' },
		stdout: {
			write: (chunk: string) => {
				written += chunk;
			},
		},
	};
	new Function('module', 'process', vitestReporterSource)(
		fakeModule,
		fakeProcess,
	);
	return { reporter: new fakeModule.exports(), output: () => written };
};

const fileTask = {
	type: 'suite',
	name: 'vitest/sum.vitest.js',
	filepath: '/ws/vitest/sum.vitest.js',
	tasks: [
		{ type: 'test', name: 'adds', result: { state: 'skip' } },
		{
			type: 'suite',
			name: 'sum',
			tasks: [
				{
					type: 'test',
					name: 'adds',
					result: { state: 'fail', errors: [{ message: 'boom' }] },
					location: { line: 23, column: 3 },
				},
			],
		},
	],
};

describe('vitestReporterTemplate', () => {
	it('should report on onTestRunEnd (Vitest >= 4)', () => {
		const { reporter, output } = loadReporter();

		reporter.onTestRunEnd([{ task: fileTask }]);

		const results = parseStructuredResults(output(), 's1');
		expect(results?.testResults[0].name).toBe('/ws/vitest/sum.vitest.js');
		expect(results?.testResults[0].assertionResults).toEqual([
			expect.objectContaining({
				title: 'adds',
				ancestorTitles: [],
				fullName: 'adds',
				status: 'skipped',
			}),
			expect.objectContaining({
				title: 'adds',
				ancestorTitles: ['sum'],
				fullName: 'sum adds',
				status: 'failed',
				failureMessages: ['boom'],
				location: { line: 23, column: 3 },
			}),
		]);
	});

	it('should report only once when both hooks are called (Vitest 3)', () => {
		const { reporter, output } = loadReporter();

		reporter.onTestRunEnd([{ task: fileTask }]);
		reporter.onFinished([fileTask]);

		expect(extractStructuredMessages(output(), 's1').messages).toHaveLength(1);
	});

	it('should report on onFinished (Vitest < 3)', () => {
		const { reporter, output } = loadReporter();

		reporter.onFinished([fileTask]);

		const results = parseStructuredResults(output(), 's1');
		expect(results?.numTotalTests).toBe(2);
		expect(results?.numFailedTests).toBe(1);
	});

	it('should report a file that fails to collect as failed', () => {
		const { reporter, output } = loadReporter();

		reporter.onTestRunEnd([
			{
				task: {
					type: 'suite',
					name: 'broken.test.ts',
					filepath: '/ws/broken.test.ts',
					tasks: [],
					result: {
						state: 'fail',
						errors: [{ message: "Cannot find module './missing'" }],
					},
				},
			},
		]);

		const results = parseStructuredResults(output(), 's1');
		expect(results?.success).toBe(false);
		expect(results?.numFailedTestSuites).toBe(1);
		expect(results?.testResults[0]).toEqual(
			expect.objectContaining({
				status: 'failed',
				message: "Cannot find module './missing'",
				assertionResults: [],
			}),
		);
	});
});
