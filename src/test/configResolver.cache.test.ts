import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findConfigPath } from '../ConfigResolver';
import { cacheManager } from '../cache/CacheManager';

describe('findConfigPath caching', () => {
	let root: string;
	let context: { currentWorkspaceFolderPath: string };

	const writeFile = (relativePath: string) => {
		const file = path.join(root, relativePath);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, '');
		return file;
	};

	beforeEach(() => {
		cacheManager.invalidateAll();
		root = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'jest-runner-config-cache-')),
		);
		context = { currentWorkspaceFolderPath: root };
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
		cacheManager.invalidateAll();
	});

	it('shares one lookup between the files of a directory', () => {
		const config = writeFile('jest.config.js');
		const fileA = writeFile('src/a.test.ts');
		const fileB = writeFile('src/b.test.ts');

		expect(findConfigPath(fileA, context, undefined, 'jest')).toBe(config);

		// Served from the directory's cache entry, not by walking the tree.
		fs.rmSync(config);
		expect(findConfigPath(fileB, context, undefined, 'jest')).toBe(config);
	});

	it('caches lookups that found no config', () => {
		const file = writeFile('src/a.test.ts');

		expect(findConfigPath(file, context, undefined, 'jest')).toBeUndefined();

		writeFile('jest.config.js');
		expect(findConfigPath(file, context, undefined, 'jest')).toBeUndefined();

		cacheManager.invalidateAll();
		expect(findConfigPath(file, context, undefined, 'jest')).toBe(
			path.join(root, 'jest.config.js'),
		);
	});

	it('still searches from a directory target itself', () => {
		const config = writeFile('packages/a/jest.config.js');

		expect(
			findConfigPath(path.join(root, 'packages/a'), context, undefined, 'jest'),
		).toBe(config);
	});
});
