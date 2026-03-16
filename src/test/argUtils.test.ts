import { mergeUniqueArgs } from '../utils/ArgUtils';

describe('mergeUniqueArgs', () => {
	it('returns sensible defaults for nullish inputs', () => {
		expect(mergeUniqueArgs(undefined, undefined)).toEqual([]);
		expect(mergeUniqueArgs(['--watch'], undefined)).toEqual(['--watch']);
		expect(mergeUniqueArgs(undefined, ['--watch'])).toEqual(['--watch']);
	});

	it('appends unique standalone flags while preserving order', () => {
		expect(
			mergeUniqueArgs(['--watch', '--coverage'], ['--watch', '--bail']),
		).toEqual(['--watch', '--coverage', '--bail']);
	});

	it('prepends unique standalone flags while preserving order', () => {
		expect(mergeUniqueArgs(['spec.ts'], ['run', '--watch'], 'prepend')).toEqual([
			'run',
			'--watch',
			'spec.ts',
		]);
	});

	it('deduplicates exact known flag-value pairs', () => {
		expect(
			mergeUniqueArgs(['-t', 'smoke'], ['-t', 'smoke', '--coverage']),
		).toEqual(['-t', 'smoke', '--coverage']);
	});

	it('keeps repeated known flags when the value differs', () => {
		expect(mergeUniqueArgs(['-t', 'smoke'], ['-t', 'focused'])).toEqual([
			'-t',
			'smoke',
			'-t',
			'focused',
		]);
	});

	it('treats dangling known pair flags as standalone tokens', () => {
		expect(mergeUniqueArgs(['--watch'], ['--coverage', '-t'])).toEqual([
			'--watch',
			'--coverage',
			'-t',
		]);
	});

	it('documents behavior for unknown flags with values', () => {
		expect(
			mergeUniqueArgs(['--custom-flag', 'alpha'], ['--custom-flag', 'beta']),
		).toEqual(['--custom-flag', 'alpha', 'beta']);
	});

	it('does not mutate input arrays', () => {
		const base = ['--watch', '-t', 'smoke'];
		const extra = ['--coverage', '-t', 'focused'];

		mergeUniqueArgs(base, extra);

		expect(base).toEqual(['--watch', '-t', 'smoke']);
		expect(extra).toEqual(['--coverage', '-t', 'focused']);
	});
});
