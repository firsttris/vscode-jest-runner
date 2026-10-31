const START = '@@JTR_START::';
const END = '@@JTR_END::';
const sessionId = process.env.JSTR_SESSION_ID || 'unknown';

function emit(type, payload) {
	try {
		const json = JSON.stringify(payload);
		// String length (UTF-16 code units) — the parser slices decoded strings, not bytes.
		const len = json.length;
		const message =
			START +
			sessionId +
			'::' +
			type +
			'::' +
			len +
			'::' +
			json +
			END +
			sessionId +
			'::' +
			type;
		process.stdout.write(message);
	} catch (_err) {}
}

function extractErrorMessage(details) {
	if (!details) return undefined;

	const error = details.error;
	if (!error) return undefined;

	const parts = [];

	const cause = error.cause;
	if (cause) {
		if (cause.code === 'ERR_ASSERTION') {
			const actual =
				cause.actual !== undefined ? JSON.stringify(cause.actual) : undefined;
			const expected =
				cause.expected !== undefined
					? JSON.stringify(cause.expected)
					: undefined;
			const operator = cause.operator;
			if (actual !== undefined && expected !== undefined) {
				parts.push(`Expected: ${expected}`);
				parts.push(`Received: ${actual}`);
				if (operator) {
					parts.push(`Operator: ${operator}`);
				}
				parts.push('');
			}
		}
		if (cause.stack) {
			parts.push(cause.stack);
		} else if (cause.message) {
			parts.push(cause.message);
		}
	} else if (error.stack) {
		parts.push(error.stack);
	} else if (error.message) {
		parts.push(error.message);
	} else if (error.failureType) {
		parts.push(`Failure type: ${error.failureType}`);
	}

	return parts.length > 0 ? parts.join('\n') : undefined;
}

export default async function* (source) {
	const assertions = [];
	const files = new Map();

	// Node reports a test before its enclosing describe blocks and gives only
	// its nesting level, so finished tests wait here until their suites end.
	let pending = [];

	const isSuite = (test) => test?.details?.type === 'suite';

	// A suite at nesting n is the innermost describe of every pending test of
	// its file nested deeper; those then count as being at level n.
	const closeSuite = (suite) => {
		const file = suite?.file || 'unknown';
		const level = typeof suite?.nesting === 'number' ? suite.nesting : 0;
		let claimed = 0;
		for (const entry of pending) {
			if (entry.file === file && entry.nesting > level) {
				entry.assertion.ancestorTitles.unshift(suite.name);
				entry.nesting = level;
				claimed++;
			}
		}
		pending = pending.filter((entry) => entry.nesting > 0);
		return claimed;
	};

	const record = (test, status, failureMessage, durationMs) => {
		const file = test?.file || 'unknown';
		const ancestors = [];
		const title = test?.name || 'unknown';
		const duration =
			durationMs ??
			(typeof test?.duration === 'number' ? test.duration : undefined);
		const failureMessages = failureMessage ? [failureMessage] : undefined;
		const location =
			test?.line && typeof test.line === 'number'
				? { line: test.line, column: test.column || 0 }
				: undefined;

		const assertion = {
			ancestorTitles: ancestors,
			title,
			fullName: title,
			status,
			duration,
			failureMessages,
			location,
		};

		assertions.push(assertion);
		const nesting = typeof test?.nesting === 'number' ? test.nesting : 0;
		if (nesting > 0) {
			pending.push({ assertion, file, nesting });
		}

		if (!files.has(file)) {
			files.set(file, []);
		}
		files.get(file).push(assertion);
	};

	for await (const event of source) {
		try {
			if (
				['test:pass', 'test:fail', 'test:skip', 'test:todo'].includes(
					event?.type,
				) &&
				isSuite(event.data)
			) {
				const claimed = closeSuite(event.data);
				// A describe block without reported tests (it failed or was
				// skipped before running them) keeps its own result
				if (claimed === 0 && event.type === 'test:fail') {
					record(
						event.data,
						'failed',
						extractErrorMessage(event.data.details),
						event.data.details?.duration_ms,
					);
				} else if (claimed === 0 && event.type !== 'test:pass') {
					record(event.data, 'skipped');
				}
				continue;
			}
			switch (event?.type) {
				case 'test:pass': {
					const data = event.data || {};
					const duration = data.details?.duration_ms;
					record(data, 'passed', undefined, duration);
					break;
				}
				case 'test:fail': {
					const data = event.data || {};
					const errorMsg = extractErrorMessage(data.details);
					const duration = data.details?.duration_ms;
					record(data, 'failed', errorMsg, duration);
					break;
				}
				case 'test:skip':
				case 'test:todo':
					record(event.data, 'skipped');
					break;
				default:
					break;
			}
		} catch (_err) {}
	}

	for (const assertion of assertions) {
		assertion.fullName = [...assertion.ancestorTitles, assertion.title].join(
			' ',
		);
	}

	const testResults = Array.from(files.entries()).map(
		([file, fileAssertions]) => {
			const failed = fileAssertions.filter((a) => a.status === 'failed').length;
			const pending = fileAssertions.filter(
				(a) => a.status === 'skipped',
			).length;
			return {
				assertionResults: fileAssertions,
				name: file,
				status: failed > 0 ? 'failed' : 'passed',
				message: '',
				startTime: 0,
				endTime: 0,
				numFailingTests: failed,
				numPendingTests: pending,
				numPassingTests: fileAssertions.filter((a) => a.status === 'passed')
					.length,
			};
		},
	);

	const flat = assertions;
	const payload = {
		numFailedTestSuites: testResults.filter((t) => t.status === 'failed')
			.length,
		numFailedTests: flat.filter((a) => a.status === 'failed').length,
		numPassedTestSuites: testResults.filter((t) => t.status === 'passed')
			.length,
		numPassedTests: flat.filter((a) => a.status === 'passed').length,
		numPendingTestSuites: testResults.filter(
			(t) => t.status !== 'passed' && t.status !== 'failed',
		).length,
		numPendingTests: flat.filter((a) => a.status === 'skipped').length,
		numTotalTestSuites: testResults.length,
		numTotalTests: flat.length,
		success: flat.every((a) => a.status === 'passed'),
		testResults,
	};

	emit('results', payload);
}
