import { appendUniqueArgs, prependUniqueArgs } from '../utils/ArgUtils';

describe('appendUniqueArgs', () => {
	it('returns an empty array for nullish inputs', () => {
		expect(appendUniqueArgs(undefined, undefined)).toEqual([]);
		expect(appendUniqueArgs(null, null)).toEqual([]);
		expect(appendUniqueArgs(undefined, ['--watch'])).toEqual(['--watch']);
		expect(appendUniqueArgs(['--watch'], undefined)).toEqual(['--watch']);
	});

	it('ignores empty and nullish argument lists across multiple inputs', () => {
		expect(appendUniqueArgs([], null, [], undefined, [])).toEqual([]);
		expect(
			appendUniqueArgs(
				['--watch'],
				[],
				null,
				[],
				undefined,
				['--coverage'],
				[],
			),
		).toEqual(['--watch', '--coverage']);
	});

	it('deduplicates standalone flags while preserving order', () => {
		expect(
			appendUniqueArgs(['--watch', '--coverage'], ['--watch', '--bail']),
		).toEqual(['--watch', '--coverage', '--bail']);
	});

	it('deduplicates exact known flag-value pairs', () => {
		expect(
			appendUniqueArgs(['-t', 'smoke'], ['-t', 'smoke', '--coverage']),
		).toEqual(['-t', 'smoke', '--coverage']);
	});

	it('keeps repeated known flags when the value differs', () => {
		expect(appendUniqueArgs(['-t', 'smoke'], ['-t', 'focused'])).toEqual([
			'-t',
			'smoke',
			'-t',
			'focused',
		]);
	});

	it('handles mixed standalone flags and paired flags', () => {
		expect(
			appendUniqueArgs(
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
		expect(appendUniqueArgs(['--watch'], ['--coverage', '-t'])).toEqual([
			'--watch',
			'--coverage',
			'-t',
		]);
	});

	it('treats the next token as a value even when it looks like another flag', () => {
		expect(appendUniqueArgs(['--watch'], ['-t', '--coverage', '-t'])).toEqual([
			'--watch',
			'-t',
			'--coverage',
			'-t',
		]);
	});

	it('documents current behavior for unknown flags that also take values', () => {
		expect(
			appendUniqueArgs(['--custom-flag', 'alpha'], ['--custom-flag', 'beta']),
		).toEqual(['--custom-flag', 'alpha', 'beta']);
	});

	it('treats equals syntax as exact standalone tokens', () => {
		expect(
			appendUniqueArgs(
				['--config=vitest.config.ts'],
				['--config=vitest.config.ts', '--config=alt.config.ts'],
			),
		).toEqual(['--config=vitest.config.ts', '--config=alt.config.ts']);
	});

	it('does not treat split and equals syntax as equivalent', () => {
		expect(
			appendUniqueArgs(
				['--config=vitest.config.ts'],
				['--config', 'vitest.config.ts'],
			),
		).toEqual(['--config=vitest.config.ts', '--config', 'vitest.config.ts']);
	});

	it('does not mutate the original arrays', () => {
		const target = ['--watch', '-t', 'smoke'];
		const args = ['--coverage', '-t', 'focused'];

		appendUniqueArgs(target, args);

		expect(target).toEqual(['--watch', '-t', 'smoke']);
		expect(args).toEqual(['--coverage', '-t', 'focused']);
	});
});

describe('prependUniqueArgs', () => {
	it('returns sensible defaults for nullish inputs', () => {
		expect(prependUniqueArgs(undefined, undefined)).toEqual([]);
		expect(prependUniqueArgs(['spec.ts'], undefined)).toEqual(['spec.ts']);
		expect(prependUniqueArgs(undefined, ['run'])).toEqual(['run']);
	});

	it('prepends standalone flags in prefix order', () => {
		expect(prependUniqueArgs(['spec.ts'], ['run', '--watch'])).toEqual([
			'run',
			'--watch',
			'spec.ts',
		]);
	});

	it('deduplicates exact prefix pairs while preserving order', () => {
		expect(
			prependUniqueArgs(['spec.ts', '-t', 'smoke'], ['run', '-t', 'smoke']),
		).toEqual(['run', 'spec.ts', '-t', 'smoke']);
	});

	it('keeps repeated known prefix flags when the value differs', () => {
		expect(
			prependUniqueArgs(['spec.ts'], ['-t', 'smoke', '-t', 'focused']),
		).toEqual(['-t', 'smoke', '-t', 'focused', 'spec.ts']);
	});

	it('handles mixed standalone and paired prefixes', () => {
		expect(
			prependUniqueArgs(
				['spec.ts', '--watch'],
				['run', '-t', 'smoke', '--config', 'vitest.config.ts', '--watch'],
			),
		).toEqual([
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
		expect(prependUniqueArgs(['spec.ts'], ['run', '--config'])).toEqual([
			'run',
			'--config',
			'spec.ts',
		]);
	});

	it('documents current behavior for unknown prefix flags that also take values', () => {
		expect(prependUniqueArgs(['spec.ts'], ['--custom-flag', 'alpha'])).toEqual([
			'--custom-flag',
			'alpha',
			'spec.ts',
		]);
	});

	it('treats equals syntax as exact standalone tokens', () => {
		expect(
			prependUniqueArgs(
				['spec.ts'],
				['--config=vitest.config.ts', '--config=alt.config.ts'],
			),
		).toEqual([
			'--config=vitest.config.ts',
			'--config=alt.config.ts',
			'spec.ts',
		]);
	});

	it('does not mutate the original arrays', () => {
		const args = ['spec.ts'];
		const prefix = ['run', '-t', 'smoke'];

		prependUniqueArgs(args, prefix);

		expect(args).toEqual(['spec.ts']);
		expect(prefix).toEqual(['run', '-t', 'smoke']);
	});
});
