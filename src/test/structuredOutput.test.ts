import jestReporterSource from '../reporters/jestReporterTemplate.js?raw';
import nodeReporterSource from '../reporters/nodeReporterTemplate.js?raw';
import vitestReporterSource from '../reporters/vitestReporterTemplate.js?raw';
import {
	buildMarker,
	extractStructuredMessages,
} from '../reporting/structuredOutput';

type Emit = (type: string, payload: unknown) => void;

// Evaluates a reporter template and returns its internal `emit` function,
// wired to capture stdout writes.
const loadTemplateEmit = (
	source: string,
	sessionId: string,
): { emit: Emit; output: () => string } => {
	let written = '';
	const fakeProcess = {
		env: { JSTR_SESSION_ID: sessionId },
		stdout: {
			write: (chunk: string) => {
				written += chunk;
			},
		},
	};
	const body = `${source.replace('export default ', 'const __reporter = ')}\nreturn emit;`;
	const emit = new Function('module', 'process', body)(
		{ exports: {} },
		fakeProcess,
	) as Emit;
	return { emit, output: () => written };
};

const nonAsciiPayload = {
	title: 'prüft Größe → ok ✓ 🚀',
	failureMessages: ['● expect(received) › toBe'],
};

describe('structuredOutput', () => {
	it('should round-trip ASCII payloads', () => {
		const marker = buildMarker('s1', 'results', { title: 'adds numbers' });

		const { messages, remaining } = extractStructuredMessages(marker, 's1');

		expect(messages.map((m) => m.payload)).toEqual([{ title: 'adds numbers' }]);
		expect(remaining).toBe('');
	});

	it('should round-trip payloads with non-ASCII characters', () => {
		const marker = buildMarker('s1', 'results', nonAsciiPayload);

		const { messages } = extractStructuredMessages(marker, 's1');

		expect(messages.map((m) => m.payload)).toEqual([nonAsciiPayload]);
	});

	it('should parse consecutive non-ASCII messages surrounded by output', () => {
		const output = `Ölwechsel\n${buildMarker('s1', 'results', nonAsciiPayload)}\nmehr Ausgabe ${buildMarker('s1', 'results', { title: 'zweiter' })}`;

		const { messages } = extractStructuredMessages(output, 's1');

		expect(messages.map((m) => m.payload)).toEqual([
			nonAsciiPayload,
			{ title: 'zweiter' },
		]);
	});

	it.each([
		['jest', jestReporterSource],
		['vitest', vitestReporterSource],
		['node', nodeReporterSource],
	])('should parse non-ASCII output emitted by the %s reporter template', (_name, source) => {
		const { emit, output } = loadTemplateEmit(source, 's1');

		emit('results', nonAsciiPayload);
		const { messages } = extractStructuredMessages(output(), 's1');

		expect(messages.map((m) => m.payload)).toEqual([nonAsciiPayload]);
	});
});
