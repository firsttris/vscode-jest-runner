const FLAGS_WITH_VALUES = new Set([
	'-c',
	'-g',
	'-t',
	'--config',
	'--filter',
	'--test-name-pattern',
	'--test-reporter',
	'--test-reporter-destination',
]);

export class UniqueArgument {
	private args: string[];

	public constructor(...inputArgs: string[]) {
		this.args = appendUniqueArgs(inputArgs);
	}

	public append(...args: (string | string[] | null | undefined)[]) {
		const normalizedArgs: string[] = [];
		for (const aArg of args) {
			if (typeof aArg === 'string') {
				normalizedArgs.push(aArg);
			}
			if (Array.isArray(aArg)) {
				normalizedArgs.push(...aArg);
			}
		}

		this.args = appendUniqueArgs(this.args, normalizedArgs);
	}

	public prepend(args: string[] | string | null | undefined) {
		const normalizedArgs = typeof args === 'string' ? [args] : (args ?? []);

		this.args = prependUniqueArgs(this.args, normalizedArgs);
	}

	public remove(arg: string) {
		this.args = this.args.filter((a) => a !== arg);
	}

	public includes(arg: string): boolean {
		// a set has a O(1) lookup time, but its baseline cpu+mem usage is way higher, so for small arrays as here this is faster than a Set
		return this.args.includes(arg);
	}

	public toArray(): string[] {
		return this.args;
	}
}

const getArgSegment = (
	args: string[],
	startIndex: number,
): { nextIndex: number; segment: string[] } => {
	const arg = args[startIndex];

	if (FLAGS_WITH_VALUES.has(arg) && startIndex + 1 < args.length) {
		return {
			nextIndex: startIndex + 2,
			segment: [arg, args[startIndex + 1]],
		};
	}

	return {
		nextIndex: startIndex + 1,
		segment: [arg],
	};
};

const getArgKeys = (args: string[]): Set<string> => {
	const keys = new Set<string>();

	for (let index = 0; index < args.length; ) {
		const { nextIndex, segment } = getArgSegment(args, index);
		keys.add(segment.join('\u0000'));
		index = nextIndex;
	}

	return keys;
};

/**
 * Appends only argument segments that are not already present in the first list.
 *
 * The first array is treated as authoritative and keeps its order. Additional
 * arrays are flattened in order, then known flag-value pairs and standalone
 * flags are deduplicated against what is already in the target.
 */
const appendUniqueArgs = (
	...args: (string[] | null | undefined)[]
): string[] => {
	const normalizedTarget: string[] = args[0] ?? [];
	const normalizedArgs = flatten((args ?? []).slice(1));

	const nextArgs = [...normalizedTarget];
	const existing = getArgKeys(normalizedTarget);

	for (let index = 0; index < normalizedArgs.length; ) {
		const { nextIndex, segment } = getArgSegment(normalizedArgs, index);
		const key = segment.join('\u0000');

		if (!existing.has(key)) {
			nextArgs.push(...segment);
			existing.add(key);
		}

		index = nextIndex;
	}

	return nextArgs;
};

/**
 * Prepends only prefix segments that are not already present in the existing args.
 *
 * The existing args remain authoritative and keep their relative order. Missing
 * standalone flags and known flag-value pairs from the prefix are inserted at
 * the front while preserving the prefix order.
 */
const prependUniqueArgs = (
	args: string[] | null | undefined,
	prefix: string[] | null | undefined,
): string[] => {
	const normalizedArgs = args ?? [];
	const normalizedPrefix = prefix ?? [];

	const nextArgs = [...normalizedArgs];
	const prefixSegments: string[][] = [];
	const existing = getArgKeys(nextArgs);

	for (let index = 0; index < normalizedPrefix.length; ) {
		const { nextIndex, segment } = getArgSegment(normalizedPrefix, index);
		prefixSegments.push(segment);
		index = nextIndex;
	}

	for (let index = prefixSegments.length - 1; index >= 0; index -= 1) {
		const segment = prefixSegments[index];
		const key = segment.join('\u0000');

		if (!existing.has(key)) {
			nextArgs.unshift(...segment);
			existing.add(key);
		}
	}

	return nextArgs;
};

function flatten<T>(arrays: (T[] | null | undefined)[]): T[] {
	const result: T[] = [];
	for (const array of arrays) {
		if (array) {
			result.push(...array);
		}
	}
	return result;
}
