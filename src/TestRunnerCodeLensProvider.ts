import {
	CodeLens,
	type CodeLensProvider,
	Range,
	type TextDocument,
	workspace,
} from 'vscode';
import { parseTestFile } from './parser';
import { testFileCache } from './testDetection/testFileCache';
import type { CodeLensOption } from './util';
import { logError } from './utils/Logger';
import {
	findFullTestName,
	type TestNode,
	toTestNamePattern,
} from './utils/TestNameUtils';

type LensNode = TestNode & { eachTemplate?: string; children?: LensNode[] };

interface CodeLensMenuItem {
	label: string;
	command: string;
	arguments: unknown[];
}

const CODE_LENS_CONFIG: Record<
	CodeLensOption,
	{ title: string; command: string }
> = {
	run: { title: 'Run', command: 'extension.runJest' },
	debug: { title: 'Debug', command: 'extension.debugJest' },
	watch: { title: 'Run --watch', command: 'extension.watchJest' },
	coverage: { title: 'Run --coverage', command: 'extension.runJestCoverage' },
	'current-test-coverage': {
		title: 'Run --collectCoverageFrom (target file/dir)',
		command: 'extension.runJestCurrentTestCoverage',
	},
};

function getCodeLensForOption(
	range: Range,
	codeLensOption: CodeLensOption,
	fullTestName: string,
	customTitle?: string,
): CodeLens {
	const config = CODE_LENS_CONFIG[codeLensOption];
	return new CodeLens(range, {
		arguments: [fullTestName],
		title: customTitle || config.title,
		command: config.command,
	});
}

function getCodeLensMenuForOption(
	range: Range,
	codeLensOption: CodeLensOption,
	menuItems: CodeLensMenuItem[],
): CodeLens {
	const config = CODE_LENS_CONFIG[codeLensOption];
	return new CodeLens(range, {
		arguments: [menuItems],
		title: `${config.title}...`,
		command: 'extension.showCodeLensMenu',
	});
}

const getEachTemplate = (node?: TestNode): string | undefined => {
	const lensNode = node as LensNode | undefined;
	return lensNode?.eachTemplate;
};

const hasEachTemplate = (node?: TestNode): boolean =>
	Boolean(getEachTemplate(node));

const sortByStartColumn = (nodes: TestNode[]): TestNode[] =>
	[...nodes].sort((a, b) => (a.start?.column || 0) - (b.start?.column || 0));

const getNodeRange = (node: TestNode): Range => {
	const start = node.start ?? { line: 1, column: 0 };
	const end = node.end ?? start;
	return new Range(start.line - 1, start.column, end.line - 1, end.column);
};

const isSameLineEachNode =
	(baseNode: TestNode) =>
	(candidate: TestNode): boolean =>
		candidate.type === baseNode.type &&
		hasEachTemplate(candidate) &&
		candidate.start?.line === baseNode.start?.line;

const isNestedItInsideDescribeEach = (
	node: TestNode,
	parent?: TestNode,
): boolean =>
	node.type === 'it' && parent?.type === 'describe' && hasEachTemplate(parent);

const findParentPath = (
	searchNode: TestNode,
	target: TestNode,
	currentPath: string[] = [],
): string[] | null => {
	if (searchNode === target) {
		return currentPath;
	}

	if (!searchNode.children) {
		return null;
	}

	for (const child of searchNode.children) {
		const nextPath = searchNode.name
			? [...currentPath, searchNode.name]
			: currentPath;
		const result = findParentPath(child, target, nextPath);
		if (result) {
			return result;
		}
	}

	return null;
};

function findAncestorPath(node: TestNode, parseResults: TestNode[]): string[] {
	for (const root of parseResults) {
		const parentPath = findParentPath(root, node);
		if (parentPath) {
			return parentPath;
		}
	}

	return [];
}

function buildFullTestName(node: TestNode, parseResults: TestNode[]): string {
	const parentPath = findAncestorPath(node, parseResults);
	if (parentPath.length > 0) {
		return [...parentPath, node.name || ''].filter(Boolean).join(' ');
	}

	return node.name || '';
}

const getSiblingEachNodes = (
	node: TestNode,
	parent: TestNode | undefined,
	parseResults: TestNode[],
): TestNode[] => {
	const siblings = parent?.children || parseResults;
	return siblings.filter(isSameLineEachNode(node));
};

const getNestedItEachNodes = (
	node: TestNode,
	parent: TestNode,
	parseResults: TestNode[],
): TestNode[] => {
	const parentTemplate = getEachTemplate(parent);
	const childTemplate = getEachTemplate(node);

	if (!parentTemplate || !childTemplate) {
		return [];
	}

	const describeRows = parseResults.filter(
		(candidate) =>
			candidate.type === 'describe' &&
			candidate.start?.line === parent.start?.line &&
			getEachTemplate(candidate) === parentTemplate,
	);

	return describeRows
		.map((describeNode) =>
			describeNode.children?.find(
				(child) =>
					child.type === 'it' &&
					child.start?.line === node.start?.line &&
					getEachTemplate(child) === childTemplate,
			),
		)
		.filter((candidate): candidate is TestNode => Boolean(candidate));
};

const getGroupedEachNodes = (
	node: TestNode,
	parent: TestNode | undefined,
	parseResults: TestNode[],
): TestNode[] => {
	if (parent && isNestedItInsideDescribeEach(node, parent)) {
		return getNestedItEachNodes(node, parent, parseResults);
	}

	return getSiblingEachNodes(node, parent, parseResults);
};

const buildGroupKey = (
	node: TestNode,
	parent: TestNode | undefined,
	nestedInDescribeEach: boolean,
): string => {
	if (nestedInDescribeEach) {
		return `it-in-describe-each-${parent?.start?.line}-${node.start?.line}-${getEachTemplate(parent)}`;
	}

	return `${node.start?.line}-${parent?.name || 'root'}`;
};

const withDescribeChildrenSuffix = (
	node: TestNode,
	pattern: string | undefined,
): string | undefined =>
	node.type === 'describe' && (node.children?.length ?? 0) > 0 && pattern
		? `${pattern}(\\s.*)?`
		: pattern;

const buildPatternForNode = (
	node: TestNode,
	parseResults: TestNode[],
): string => {
	const testNamePattern =
		toTestNamePattern(buildFullTestName(node, parseResults)) || '';
	return withDescribeChildrenSuffix(node, testNamePattern) || '';
};

const buildAllPatternName = (
	node: TestNode,
	parent: TestNode | undefined,
	parseResults: TestNode[],
	nestedInDescribeEach: boolean,
): string | undefined => {
	const template = getEachTemplate(node);
	if (template) {
		const parentPath = findAncestorPath(node, parseResults);
		if (nestedInDescribeEach && parentPath.length > 0) {
			const parentTemplate = getEachTemplate(parent);
			if (parentTemplate) {
				parentPath[parentPath.length - 1] = parentTemplate;
			}
		}

		const fullTemplateName = [...parentPath, template]
			.filter(Boolean)
			.join(' ');
		const pattern = toTestNamePattern(fullTemplateName);
		return withDescribeChildrenSuffix(node, pattern);
	}

	const line = node.start?.line;
	if (!line) {
		return undefined;
	}

	const pattern = toTestNamePattern(findFullTestName(line, parseResults));
	return withDescribeChildrenSuffix(node, pattern);
};

const getMenuItemsForEachGroup = (
	option: CodeLensOption,
	nodes: TestNode[],
	allPatternName: string,
	parseResults: TestNode[],
): CodeLensMenuItem[] => {
	const config = CODE_LENS_CONFIG[option];
	const items: CodeLensMenuItem[] = [
		{
			label: `${config.title} All`,
			command: config.command,
			arguments: [allPatternName],
		},
	];

	nodes.forEach((node) => {
		const fullTestName = buildFullTestName(node, parseResults);
		items.push({
			label: `${config.title} ${fullTestName}`,
			command: config.command,
			arguments: [buildPatternForNode(node, parseResults)],
		});
	});

	return items;
};

function getTestsBlocks(
	parsedNode: TestNode,
	parseResults: TestNode[],
	codeLensOptions: CodeLensOption[],
	parent?: TestNode,
	processedGroups?: Set<string>,
): CodeLens[] {
	if (parsedNode.type === 'expect') {
		return [];
	}

	const codeLens: CodeLens[] = [];
	const groupsSet = processedGroups || new Set<string>();

	parsedNode.children?.forEach((subNode) => {
		codeLens.push(
			...getTestsBlocks(
				subNode,
				parseResults,
				codeLensOptions,
				parsedNode,
				groupsSet,
			),
		);
	});

	if (!parsedNode.start || !parsedNode.end) {
		return codeLens;
	}

	const range = getNodeRange(parsedNode);

	const fullTestName = buildPatternForNode(parsedNode, parseResults);
	const isExpandedEachNode = hasEachTemplate(parsedNode);
	const supportsEachGrouping =
		parsedNode.start &&
		isExpandedEachNode &&
		(parsedNode.type === 'it' || parsedNode.type === 'describe');

	if (supportsEachGrouping) {
		const nestedInDescribeEach = isNestedItInsideDescribeEach(
			parsedNode,
			parent,
		);
		const sameLineTests = getGroupedEachNodes(parsedNode, parent, parseResults);

		if (sameLineTests.length > 1) {
			const groupKey = buildGroupKey(parsedNode, parent, nestedInDescribeEach);

			if (!groupsSet.has(groupKey)) {
				groupsSet.add(groupKey);

				const patternName = buildAllPatternName(
					parsedNode,
					parent,
					parseResults,
					nestedInDescribeEach,
				);

				if (patternName) {
					const sortedTests = sortByStartColumn(sameLineTests);
					codeLens.push(
						...codeLensOptions.map((option) =>
							getCodeLensMenuForOption(
								range,
								option,
								getMenuItemsForEachGroup(
									option,
									sortedTests,
									patternName,
									parseResults,
								),
							),
						),
					);
				}
			}

			return codeLens;
		}
	}

	codeLens.push(
		...codeLensOptions.map((option) =>
			getCodeLensForOption(range, option, fullTestName),
		),
	);

	return codeLens;
}

export class TestRunnerCodeLensProvider implements CodeLensProvider {
	private lastSuccessfulCodeLens: Map<string, CodeLens[]> = new Map();

	constructor(private readonly codeLensOptions: CodeLensOption[]) {}

	public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
		try {
			const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
			const workspaceFolderPath = workspaceFolder?.uri.fsPath;
			if (
				!workspaceFolderPath ||
				!testFileCache.isTestFile(document.fileName)
			) {
				return [];
			}

			const parseResults =
				parseTestFile(document.fileName, document.getText()).root.children ??
				[];

			const processedGroups = new Set<string>();

			const codeLenses = parseResults.flatMap((parseResult) =>
				getTestsBlocks(
					parseResult,
					parseResults,
					this.codeLensOptions,
					undefined,
					processedGroups,
				),
			);
			this.lastSuccessfulCodeLens.set(document.fileName, codeLenses);
			return codeLenses;
		} catch (e) {
			logError('parser returned error', e);
		}
		return this.lastSuccessfulCodeLens.get(document.fileName) ?? [];
	}
}
