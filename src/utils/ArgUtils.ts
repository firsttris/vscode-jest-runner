export const appendUniqueArgs = (
	target: string[],
	args: string[],
): string[] => {
	const nextArgs = [...target];
	const existing = new Set(target);

	args.forEach((arg) => {
		if (!existing.has(arg)) {
			nextArgs.push(arg);
			existing.add(arg);
		}
	});

	return nextArgs;
};

export const prependUniqueArgs = (
	args: string[],
	prefix: string[],
): string[] => {
	const nextArgs = [...args];

	for (let index = prefix.length - 1; index >= 0; index -= 1) {
		const arg = prefix[index];
		if (!nextArgs.includes(arg)) {
			nextArgs.unshift(arg);
		}
	}

	return nextArgs;
};
