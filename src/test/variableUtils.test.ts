import { homedir } from 'node:os';
import { resolveVariables } from '../utils/VariableUtils';

describe('resolveVariables', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv, MY_FLAG: '--verbose' };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('should replace ${workspaceFolder} and ${workspaceRoot}', () => {
		expect(
			resolveVariables(
				'node ${workspaceFolder}/node_modules/jest/bin/jest.js --rootDir ${workspaceRoot}',
				'/home/user/project',
			),
		).toBe(
			'node /home/user/project/node_modules/jest/bin/jest.js --rootDir /home/user/project',
		);
	});

	it('should replace ${workspaceFolderBasename}', () => {
		expect(
			resolveVariables('${workspaceFolderBasename}', '/home/user/project'),
		).toBe('project');
	});

	it('should replace ${userHome} and ${env:NAME}', () => {
		expect(resolveVariables('${userHome} ${env:MY_FLAG}', '')).toBe(
			`${homedir()} --verbose`,
		);
	});

	it('should replace an unset environment variable with an empty string', () => {
		expect(resolveVariables('jest ${env:NOT_SET_ANYWHERE}', '')).toBe('jest ');
	});

	it('should keep unknown variables and ${workspaceFolder} without a workspace', () => {
		expect(resolveVariables('${file} ${workspaceFolder}', '')).toBe(
			'${file} ${workspaceFolder}',
		);
	});
});
