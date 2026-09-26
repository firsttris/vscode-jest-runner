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
	])(
		'should parse non-ASCII output emitted by the %s reporter template',
		(_name, source) => {
			const { emit, output } = loadTemplateEmit(source, 's1');

			emit('results', nonAsciiPayload);
			const { messages } = extractStructuredMessages(output(), 's1');

			expect(messages.map((m) => m.payload)).toEqual([nonAsciiPayload]);
		},
	);

	describe('streaming', () => {
		// Feeds `output` chunk by chunk, carrying `remaining` like
		// executeTestCommand does.
		const parseInChunks = (output: string, chunkSize: number) => {
			const payloads: unknown[] = [];
			let buffer = '';
			let maxRemaining = 0;
			for (let i = 0; i < output.length; i += chunkSize) {
				buffer += output.slice(i, i + chunkSize);
				const { messages, remaining } = extractStructuredMessages(buffer, 's1');
				payloads.push(...messages.map((m) => m.payload));
				buffer = remaining;
				maxRemaining = Math.max(maxRemaining, remaining.length);
			}
			return { payloads, buffer, maxRemaining };
		};

		it.each([1, 3, 7, 50])(
			'should parse each message exactly once with chunk size %i',
			(chunkSize) => {
				const output = `log line\n${buildMarker('s1', 'results', nonAsciiPayload)}more output\n${buildMarker('s1', 'results', { title: 'zweiter' })}done\n`;

				const { payloads } = parseInChunks(output, chunkSize);

				expect(payloads).toEqual([nonAsciiPayload, { title: 'zweiter' }]);
			},
		);

		it('should not accumulate plain output without markers', () => {
			const output = 'PASS src/foo.test.ts\n'.repeat(1000);

			const { payloads, maxRemaining } = parseInChunks(output, 64);

			expect(payloads).toEqual([]);
			expect(maxRemaining).toBeLessThan('@@JTR_START::'.length);
		});

		it('should drop consumed output once a message was parsed', () => {
			const output = `${'x'.repeat(500)}${buildMarker('s1', 'results', { ok: true })}`;

			const { remaining } = extractStructuredMessages(output, 's1');

			expect(remaining).toBe('');
		});
	});

	describe('noise before valid messages', () => {
		const valid = buildMarker('s1', 'results', { title: 'valid' });

		it('should skip markers from another session', () => {
			const output = `${buildMarker('other', 'results', { title: 'foreign' })}${valid}`;

			const { messages } = extractStructuredMessages(output, 's1');

			expect(messages.map((m) => m.payload)).toEqual([{ title: 'valid' }]);
		});

		it('should skip a START marker with a malformed header', () => {
			const output = `@@JTR_START::${'garbage '.repeat(40)}\n${valid}`;

			const { messages } = extractStructuredMessages(output, 's1');

			expect(messages.map((m) => m.payload)).toEqual([{ title: 'valid' }]);
		});

		it('should skip a message whose length does not match its end marker', () => {
			const output = `@@JTR_START::s1::results::2::{"a":1}@@JTR_END::s1::results${valid}`;

			const { messages } = extractStructuredMessages(output, 's1');

			expect(messages.map((m) => m.payload)).toEqual([{ title: 'valid' }]);
		});

		it('should skip a message with invalid JSON', () => {
			const output = `@@JTR_START::s1::results::3::{x}@@JTR_END::s1::results${valid}`;

			const { messages } = extractStructuredMessages(output, 's1');

			expect(messages.map((m) => m.payload)).toEqual([{ title: 'valid' }]);
		});

		it('should wait for an incomplete header instead of discarding it', () => {
			const { messages, remaining } = extractStructuredMessages(
				'output @@JTR_START::s1::res',
				's1',
			);

			expect(messages).toEqual([]);
			expect(remaining).toBe('@@JTR_START::s1::res');
		});
	});
});
