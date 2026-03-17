import { UniqueArgument } from '../utils/ArgUtils';

const createArgs = (...args: (string[] | string | null | undefined)[]) => {
	const uniqueArgs = new UniqueArgument();

	for (const arg of args) {
		uniqueArgs.append(arg);
	}

	return uniqueArgs.toArray();
};

describe('UniqueArgument.append', () => {
	it('returns an empty array for nullish inputs', () => {
		expect(createArgs(undefined, undefined)).toEqual([]);
		expect(createArgs(null, null)).toEqual([]);
		expect(createArgs(undefined, ['--watch'])).toEqual(['--watch']);
		expect(createArgs(['--watch'], undefined)).toEqual(['--watch']);
	});

	it('ignores empty and nullish argument lists across multiple inputs', () => {
		expect(createArgs([], null, [], undefined, [])).toEqual([]);
		expect(
			createArgs(['--watch'], [], null, [], undefined, ['--coverage'], []),
		).toEqual(['--watch', '--coverage']);
	});

	it('appends values from multiple argument lists in order', () => {
		expect(
			createArgs(['--watch'], ['--coverage'], null, ['--bail'], undefined, [
				'--runInBand',
			]),
		).toEqual(['--watch', '--coverage', '--bail', '--runInBand']);
	});

	it('deduplicates across multiple argument lists after flattening', () => {
		expect(
			createArgs(
				['--watch'],
				['--coverage', '--watch'],
				null,
				['--coverage', '--bail'],
				['--bail', '--runInBand'],
			),
		).toEqual(['--watch', '--coverage', '--bail', '--runInBand']);
	});

	it('preserves known flag-value pairs across multiple argument lists', () => {
		expect(
			createArgs(
				['-t', 'smoke'],
				null,
				['--coverage'],
				['-t', 'smoke'],
				['-t', 'focused'],
				undefined,
				['--config', 'jest.config.ts'],
				['--config', 'jest.config.ts'],
				['--config', 'alt.config.ts'],
			),
		).toEqual([
			'-t',
			'smoke',
			'--coverage',
			'-t',
			'focused',
			'--config',
			'jest.config.ts',
			'--config',
			'alt.config.ts',
		]);
	});

	it('deduplicates standalone flags while preserving order', () => {
		expect(
			createArgs(['--watch', '--coverage'], ['--watch', '--bail']),
		).toEqual(['--watch', '--coverage', '--bail']);
	});

	it('deduplicates exact known flag-value pairs', () => {
		expect(createArgs(['-t', 'smoke'], ['-t', 'smoke', '--coverage'])).toEqual([
			'-t',
			'smoke',
			'--coverage',
		]);
	});

	it('keeps repeated known flags when the value differs', () => {
		expect(createArgs(['-t', 'smoke'], ['-t', 'focused'])).toEqual([
			'-t',
			'smoke',
			'-t',
			'focused',
		]);
	});

	it('handles mixed standalone flags and paired flags', () => {
		expect(
			createArgs(
				['--watch', '-t', 'smoke', '--config', 'jest.config.ts'],
				[
					'--watch',
					'--coverage',
					'-t',
					'smoke',
					'-t',
					'focused',
					'--config',
					'jest.config.ts',
					'--config',
					'alt.config.ts',
				],
			),
		).toEqual([
			'--watch',
			'-t',
			'smoke',
			'--config',
			'jest.config.ts',
			'--coverage',
			'-t',
			'focused',
			'--config',
			'alt.config.ts',
		]);
	});

	it('treats a dangling known pair flag at the end as standalone', () => {
		expect(createArgs(['--watch'], ['--coverage', '-t'])).toEqual([
			'--watch',
			'--coverage',
			'-t',
		]);
	});

	it('treats the next token as a value even when it looks like another flag', () => {
		expect(createArgs(['--watch'], ['-t', '--coverage', '-t'])).toEqual([
			'--watch',
			'-t',
			'--coverage',
			'-t',
		]);
	});

	it('documents current behavior for unknown flags that also take values', () => {
		expect(
			createArgs(['--custom-flag', 'alpha'], ['--custom-flag', 'beta']),
		).toEqual(['--custom-flag', 'alpha', 'beta']);
	});

	it('treats equals syntax as exact standalone tokens', () => {
		expect(
			createArgs(
				['--config=vitest.config.ts'],
				['--config=vitest.config.ts', '--config=alt.config.ts'],
			),
		).toEqual(['--config=vitest.config.ts', '--config=alt.config.ts']);
	});

	it('does not treat split and equals syntax as equivalent', () => {
		expect(
			createArgs(
				['--config=vitest.config.ts'],
				['--config', 'vitest.config.ts'],
			),
		).toEqual(['--config=vitest.config.ts', '--config', 'vitest.config.ts']);
	});

	it('does not mutate the original arrays', () => {
		const target = ['--watch', '-t', 'smoke'];
		const args = ['--coverage', '-t', 'focused'];

		createArgs(target, args);

		expect(target).toEqual(['--watch', '-t', 'smoke']);
		expect(args).toEqual(['--coverage', '-t', 'focused']);
	});
});

describe('UniqueArgument.prepend', () => {
	it('returns sensible defaults for nullish inputs', () => {
		const args = new UniqueArgument();

		args.prepend(undefined);
		args.prepend(null);

		expect(args.toArray()).toEqual([]);
		expect(new UniqueArgument('spec.ts').toArray()).toEqual(['spec.ts']);

		const runArgs = new UniqueArgument();
		runArgs.prepend(['run']);
		expect(runArgs.toArray()).toEqual(['run']);
	});

	it('prepends standalone flags in prefix order', () => {
		const args = new UniqueArgument('spec.ts');

		args.prepend(['run', '--watch']);

		expect(args.toArray()).toEqual(['run', '--watch', 'spec.ts']);
	});

	it('deduplicates exact prefix pairs while preserving order', () => {
		const args = new UniqueArgument('spec.ts', '-t', 'smoke');

		args.prepend(['run', '-t', 'smoke']);

		expect(args.toArray()).toEqual(['run', 'spec.ts', '-t', 'smoke']);
	});

	it('keeps repeated known prefix flags when the value differs', () => {
		const args = new UniqueArgument('spec.ts');

		args.prepend(['-t', 'smoke', '-t', 'focused']);

		expect(args.toArray()).toEqual(['-t', 'smoke', '-t', 'focused', 'spec.ts']);
	});

	it('handles mixed standalone and paired prefixes', () => {
		const args = new UniqueArgument('spec.ts', '--watch');

		args.prepend([
			'run',
			'-t',
			'smoke',
			'--config',
			'vitest.config.ts',
			'--watch',
		]);

		expect(args.toArray()).toEqual([
			'run',
			'-t',
			'smoke',
			'--config',
			'vitest.config.ts',
			'spec.ts',
			'--watch',
		]);
	});

	it('treats a trailing known pair flag in the prefix as standalone', () => {
		const args = new UniqueArgument('spec.ts');

		args.prepend(['run', '--config']);

		expect(args.toArray()).toEqual(['run', '--config', 'spec.ts']);
	});

	it('documents current behavior for unknown prefix flags that also take values', () => {
		const args = new UniqueArgument('spec.ts');

		args.prepend(['--custom-flag', 'alpha']);

		expect(args.toArray()).toEqual(['--custom-flag', 'alpha', 'spec.ts']);
	});

	it('treats equals syntax as exact standalone tokens', () => {
		const args = new UniqueArgument('spec.ts');

		args.prepend(['--config=vitest.config.ts', '--config=alt.config.ts']);

		expect(args.toArray()).toEqual([
			'--config=vitest.config.ts',
			'--config=alt.config.ts',
			'spec.ts',
		]);
	});

	it('does not mutate the original arrays', () => {
		const args = ['spec.ts'];
		const prefix = ['run', '-t', 'smoke'];
		const uniqueArgs = new UniqueArgument(args);

		uniqueArgs.prepend(prefix);

		expect(args).toEqual(['spec.ts']);
		expect(prefix).toEqual(['run', '-t', 'smoke']);
	});
});

describe('UniqueArgument utility methods', () => {
	it('removes matching standalone arguments', () => {
		const args = new UniqueArgument('--watch', '--coverage', '--bail');

		args.remove('--coverage');

		expect(args.toArray()).toEqual(['--watch', '--bail']);
	});

	it('reports whether an argument is present', () => {
		const args = new UniqueArgument('--watch', '-t', 'smoke');

		expect(args.includes('--watch')).toBe(true);
		expect(args.includes('--coverage')).toBe(false);
	});
});
