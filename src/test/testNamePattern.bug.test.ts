import * as vscode from 'vscode';
import { processTestNodes } from '../testDiscovery';
import type { TestNode } from '../utils/TestNameUtils';

describe('Issue #500 - test.each name handling', () => {
	it('keeps original test names in test item ids without regex escaping', () => {
		const createTestItem = jest
			.fn()
			.mockImplementation((id: string, label: string, uri: vscode.Uri) => ({
				id,
				label,
				uri,
				children: { add: jest.fn() },
			}));

		const testController = {
			createTestItem,
		} as unknown as vscode.TestController;

		const parentItem = {
			uri: vscode.Uri.file('/workspace/example.test.ts'),
			children: { add: jest.fn() },
		} as unknown as vscode.TestItem;

		const filePath = '/workspace/example.test.ts';
		const fullName =
			"Requesting base page Happy path Device 1: amazon firetv_stick (default) v1.0.0.0 { avStatic: '2.0.0.0' } Restarting v2a";

		const nodes: TestNode[] = [
			{
				type: 'it',
				name: fullName,
			},
		];

		processTestNodes(nodes, parentItem, filePath, testController);

		expect(createTestItem).toHaveBeenCalledWith(
			`${filePath}:it:0:${fullName}`,
			fullName,
			parentItem.uri,
		);
	});
});
