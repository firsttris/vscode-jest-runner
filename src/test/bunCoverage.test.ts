import { getFrameworkAdapter } from '../frameworkAdapters';

describe('Bun Coverage Configuration', () => {
  it('should add --coverage and --coverage-reporter=lcov when coverage is requested', () => {
    // We emulate how TestArgumentBuilder passes options.
    // It passes ['--coverage'] in options if we don't filter it out before calling adapter.
    // Wait, frameworkAdapters implementation for Bun checks options.includes('--coverage').

    // Test direct adapter usage
    const adapter = getFrameworkAdapter('bun');
    const args = adapter.buildArgs(
      '/path/to/test.ts',
      'test name',
      true,
      ['--coverage'], // options
      '', // configPath
      null, // runOptions
    );

    expect(args).toContain('--coverage');
    expect(args).toContain('--coverage-reporter=lcov');
    // Ensure it doesn't duplicate --coverage if we removed it from options internal array
    // The implementation splices a copy or the original array?
    // The implementation splices 'options'. In the test above we pass an array literal.
    // If it modifies it in place, it might affect caller if caller reuses it.
    // But `mergeOptions` uses the modified array.
    // Let's check if mergeOptions output includes --coverage again.
    // mergeOptions adds options to runOptions.
    // If we removed it from options, it shouldn't be in mergeOptions result if it wasn't in runOptions.

    // We expect the final args to contain '--coverage' once (added explicitly) and '--coverage-reporter=lcov'.
    const coverageCount = args.filter((a) => a === '--coverage').length;
    expect(coverageCount).toBe(1);
  });

  it('should not add coverage flags if not requested', () => {
    const adapter = getFrameworkAdapter('bun');
    const args = adapter.buildArgs(
      '/path/to/test.ts',
      'test name',
      true,
      [],
      '',
      null,
    );

    expect(args).not.toContain('--coverage');
    expect(args).not.toContain('--coverage-reporter=lcov');
  });
});
