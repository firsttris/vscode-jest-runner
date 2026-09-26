import type { JestResults } from '../testResultTypes';

const START = '@@JTR_START::';
const END = '@@JTR_END::';

export interface StructuredMessage<T = unknown> {
	type: string;
	payload: T;
	start: number;
	end: number;
}

export function buildMarker(
	sessionId: string,
	type: string,
	payload: unknown,
): string {
	const json = JSON.stringify(payload);
	const len = json.length;
	return `${START}${sessionId}::${type}::${len}::${json}${END}${sessionId}::${type}`;
}

// Upper bound for "<sessionId>::<type>::<length>::". A START marker without a
// complete header within this many characters is treated as noise.
const MAX_HEADER_LENGTH = 256;

const escapeRegExp = (s: string): string =>
	s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isHeaderIncomplete = (buffer: string, headerStart: number): boolean => {
	const rest = buffer.slice(headerStart, headerStart + MAX_HEADER_LENGTH);
	return rest.length < MAX_HEADER_LENGTH && rest.split('::').length < 4;
};

/**
 * Extracts complete structured messages from `buffer`.
 *
 * `remaining` is the unconsumed tail to prepend to the next chunk: it starts
 * at the first incomplete message, or, when there is none, holds only enough
 * characters to complete a START marker split across chunks.
 */
export function extractStructuredMessages<T = unknown>(
	buffer: string,
	sessionId?: string,
): { messages: StructuredMessage<T>[]; remaining: string } {
	const messages: StructuredMessage<T>[] = [];
	const sessionPattern = sessionId ? escapeRegExp(sessionId) : '[^:]+';
	const headerRegex = new RegExp(`(${sessionPattern})::([^:]+)::(\\d+)::`, 'y');
	let searchFrom = 0;
	let keepFrom = Math.max(0, buffer.length - (START.length - 1));

	while (true) {
		const startIdx = buffer.indexOf(START, searchFrom);
		if (startIdx === -1) break;

		const headerStart = startIdx + START.length;
		headerRegex.lastIndex = headerStart;
		const match = headerRegex.exec(buffer);
		if (!match) {
			if (isHeaderIncomplete(buffer, headerStart)) {
				keepFrom = startIdx;
				break;
			}
			searchFrom = startIdx + 1;
			continue;
		}

		const [header, session, type, lenStr] = match;
		const payloadStart = headerStart + header.length;
		const payloadEnd = payloadStart + Number.parseInt(lenStr, 10);
		const endMarker = `${END}${session}::${type}`;
		const end = payloadEnd + endMarker.length;

		if (end > buffer.length) {
			keepFrom = startIdx;
			break;
		}

		if (!buffer.startsWith(endMarker, payloadEnd)) {
			searchFrom = startIdx + 1;
			continue;
		}

		try {
			const payload = JSON.parse(buffer.slice(payloadStart, payloadEnd)) as T;
			messages.push({ type, payload, start: startIdx, end });
			keepFrom = Math.max(end, keepFrom);
		} catch {
			// Malformed payload, skip this marker.
		}
		searchFrom = end;
	}

	return { messages, remaining: buffer.slice(keepFrom) };
}

export function parseStructuredResults(
	output: string,
	sessionId?: string,
): JestResults | undefined {
	const { messages } = extractStructuredMessages<JestResults>(
		output,
		sessionId,
	);
	const resultMsg = messages.find((m) => m.type === 'results');
	return resultMsg?.payload;
}
