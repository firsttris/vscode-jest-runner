import { cacheManager } from '../../../cache/CacheManager';
import { parseConfigObject } from '../../../testDetection/configParsers/parseUtils';

describe('parseConfigObject', () => {
	beforeEach(() => {
		cacheManager.invalidateAll();
	});

	it('should parse a config only once while its content is unchanged', () => {
		const content = "export default { testMatch: ['**/*.test.ts'] };";

		const first = parseConfigObject(content, '/project/jest.config.ts');

		expect(first).toEqual({ testMatch: ['**/*.test.ts'] });
		expect(parseConfigObject(content, '/project/jest.config.ts')).toBe(first);
	});

	it('should parse a changed config again', () => {
		parseConfigObject(
			"export default { testMatch: ['a'] };",
			'/project/jest.config.ts',
		);

		expect(
			parseConfigObject(
				"export default { testMatch: ['b'] };",
				'/project/jest.config.ts',
			),
		).toEqual({ testMatch: ['b'] });
	});
});
