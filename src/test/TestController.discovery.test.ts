import * as vscode from 'vscode';
import * as testDiscovery from '../testDiscovery';
import {
	setupTestController,
	type TestControllerSetup,
} from './testControllerSetup';

jest.mock('child_process');

describe('JestTestController - discovery', () => {
	let setup: TestControllerSetup;
	let finishDiscovery: () => void;
	let failDiscovery: (error: Error) => void;
	let discoverTests: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		setup = setupTestController();
		discoverTests = jest
			.spyOn(testDiscovery, 'discoverTests')
			.mockImplementation(
				() =>
					new Promise<void>((resolve, reject) => {
						finishDiscovery = resolve;
						failDiscovery = reject;
					}),
			);
	});

	afterEach(() => {
		setup.controller?.dispose();
		jest.restoreAllMocks();
	});

	const flush = () => new Promise((resolve) => setImmediate(resolve));

	const resolveHandler = (): (() => Promise<void>) =>
		(vscode.tests.createTestController as jest.Mock).mock.results[0].value
			.resolveHandler;

	it('runs one discovery for concurrent requests', async () => {
		const first = resolveHandler()();
		const second = resolveHandler()();
		await flush();

		finishDiscovery();
		await Promise.all([first, second]);

		expect(discoverTests).toHaveBeenCalledTimes(1);

		await resolveHandler()();
		expect(discoverTests).toHaveBeenCalledTimes(1);
	});

	it('retries discovery after a failure', async () => {
		const first = resolveHandler()();
		await flush();
		failDiscovery(new Error('boom'));
		await expect(first).rejects.toThrow('boom');

		const second = resolveHandler()();
		await flush();
		finishDiscovery();
		await second;

		expect(discoverTests).toHaveBeenCalledTimes(2);
	});
});
