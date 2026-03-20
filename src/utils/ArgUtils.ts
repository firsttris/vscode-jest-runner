type Position = 'append' | 'prepend';

const FLAGS_WITH_VALUES = new Set([
	'-c',
	'-g',
	'-t',
	'--config',
	'--coverage.reporter',
	'--filter',
	'--project',
	'--reporter',
	'--reporters',
	'--test-name-pattern',
	'--test-reporter',
	'--test-reporter-destination',
]);

const keyOf = (segment: readonly string[]): string => segment.join('\u0000');

const toSegments = (args: readonly string[], index = 0): string[][] =>
	index >= args.length
		? []
		: FLAGS_WITH_VALUES.has(args[index]) && index + 1 < args.length
			? [[args[index], args[index + 1]], ...toSegments(args, index + 2)]
			: [[args[index]], ...toSegments(args, index + 1)];

const mergeUniqueArgs = (
	base: string[] | null | undefined,
	extra: string[] | null | undefined,
	position: Position = 'append',
): string[] => {
	const baseSegments = toSegments(base ?? []);
	const extraSegments = toSegments(extra ?? []);
	const seen = new Set(baseSegments.map(keyOf));

	const uniqueExtra = extraSegments.filter((segment) => {
		const key = keyOf(segment);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	const merged =
		position === 'prepend'
			? [...uniqueExtra, ...baseSegments]
			: [...baseSegments, ...uniqueExtra];

	return merged.flat();
};

export const appendUniqueArgs = (
	base: string[] | null | undefined,
	...extras: (string[] | null | undefined)[]
): string[] =>
	extras.reduce(
		(merged, extra) => mergeUniqueArgs(merged, extra, 'append'),
		base ?? [],
	);

export const prependUniqueArgs = (
	base: string[] | null | undefined,
	...prefixes: (string[] | null | undefined)[]
): string[] =>
	prefixes.reduce(
		(merged, prefix) => mergeUniqueArgs(merged, prefix, 'prepend'),
		base ?? [],
	);
