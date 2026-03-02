import { JestResults } from '../testResultTypes';

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
  const len = Buffer.byteLength(json, 'utf8');
  return `${START}${sessionId}::${type}::${len}::${json}${END}${sessionId}::${type}`;
}

export function extractStructuredMessages<T = unknown>(
  buffer: string,
  sessionId?: string,
): { messages: StructuredMessage<T>[]; remaining: string } {
  const messages: StructuredMessage<T>[] = [];
  let cursor = 0;

  while (true) {
    const startIdx = buffer.indexOf(START, cursor);
    if (startIdx === -1) break;

    const headerStart = startIdx + START.length;
    const sessionPart = sessionId ? sessionId : '[^:]+';
    const headerRegex = new RegExp(`^${sessionPart}::([^:]+)::(\\d+)::`);
    const headerSlice = buffer.slice(headerStart);
    const match = headerRegex.exec(headerSlice);
    if (!match) {
      break;
    }

    const [, type, lenStr] = match;
    const length = Number.parseInt(lenStr, 10);
    if (Number.isNaN(length) || length < 0) {
      cursor = startIdx + 1;
      continue;
    }

    const payloadStart = headerStart + match[0].length;
    const payloadEnd = payloadStart + length;
    if (payloadEnd > buffer.length) {
      break;
    }

    const endMarker = `${END}${sessionId ?? match[1]}::${type}`;
    if (!buffer.startsWith(endMarker, payloadEnd)) {
      break;
    }

    const json = buffer.slice(payloadStart, payloadEnd);
    try {
      const payload = JSON.parse(json) as T;
      const end = payloadEnd + endMarker.length;
      messages.push({ type, payload, start: startIdx, end });
      cursor = end;
    } catch {
      cursor = startIdx + 1;
    }
  }

  const remaining = buffer.slice(cursor);
  return { messages, remaining };
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
