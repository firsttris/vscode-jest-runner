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

export const appendUniqueArgs = (
	target: string[] | null | undefined,
	args: string[] | null | undefined,
): string[] => {
	const normalizedTarget = target ?? [];
	const normalizedArgs = args ?? [];
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

export const prependUniqueArgs = (
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
