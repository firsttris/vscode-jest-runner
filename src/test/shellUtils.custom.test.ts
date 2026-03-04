import {
	normalizeArgsForNonShellSpawn,
	parseCommandAndEnv,
} from '../utils/ShellUtils';

describe('ShellUtils', () => {
	describe('parseCommandAndEnv', () => {
		it('should separate env vars from executable for simple command', () => {
			const cmd = 'VAR=value echo test';
			const result = parseCommandAndEnv(cmd);
			expect(result).toEqual({
				env: { VAR: 'value' },
				executable: 'echo',
				args: ['test'],
			});
		});

		it('should handle complex command from user issue', () => {
			const cmd =
				'NODE_OPTIONS="--experimental-vm-modules" ./node_modules/.bin/jest --verbose';
			const result = parseCommandAndEnv(cmd);
			expect(result).toEqual({
				env: { NODE_OPTIONS: '--experimental-vm-modules' },
				executable: './node_modules/.bin/jest',
				args: ['--verbose'],
			});
		});

		it('should handle multiple env vars', () => {
			const cmd = 'A=1 B=2 node index.js';
			const result = parseCommandAndEnv(cmd);
			expect(result).toEqual({
				env: { A: '1', B: '2' },
				executable: 'node',
				args: ['index.js'],
			});
		});

		it('should handle command without env vars', () => {
			const cmd = 'npm test';
			const result = parseCommandAndEnv(cmd);
			expect(result).toEqual({
				env: {},
				executable: 'npm',
				args: ['test'],
			});
		});
	});

	describe('normalizeArgsForNonShellSpawn', () => {
		it('should unquote shell-quoted args', () => {
			const result = normalizeArgsForNonShellSpawn([
				"'/tmp/my test.vitest.js'",
				'"name with spaces"',
			]);

			expect(result).toEqual(['/tmp/my test.vitest.js', 'name with spaces']);
		});

		it('should normalize Windows-style escaped inner double quotes', () => {
			const result = normalizeArgsForNonShellSpawn([
				'"xyz by ""(.*?)"""',
			]);

			expect(result).toEqual(['xyz by "(.*?)"']);
		});

		it('should keep non-quoted args unchanged', () => {
			const result = normalizeArgsForNonShellSpawn(['run', '--config', 'vitest.config.ts']);
			expect(result).toEqual(['run', '--config', 'vitest.config.ts']);
		});
	});
});
