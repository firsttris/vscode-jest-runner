import { parseTestFile } from './parser';
import {
  CodeLens,
  CodeLensProvider,
  Range,
  TextDocument,
  workspace,
} from 'vscode';
import { testFileCache } from './testDetection/testFileCache';
import { CodeLensOption } from './util';
import {
  findFullTestName,
  toTestNamePattern,
  TestNode,
} from './utils/TestNameUtils';
import { logError } from './utils/Logger';

type LensNode = TestNode & { eachTemplate?: string; children?: LensNode[] };

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

const getEachTemplate = (node?: TestNode): string | undefined => {
  const lensNode = node as LensNode | undefined;
  return lensNode?.eachTemplate;
};

const hasEachTemplate = (node?: TestNode): boolean =>
  Boolean(getEachTemplate(node));

const sortByStartColumn = (nodes: TestNode[]): TestNode[] =>
  [...nodes].sort((a, b) => (a.start?.column || 0) - (b.start?.column || 0));

const getNodeRange = (node: TestNode): Range =>
  new Range(
    node.start.line - 1,
    node.start.column,
    node.end.line - 1,
    node.end.column,
  );

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

function buildFullTestName(node: TestNode, parseResults: TestNode[]): string {
  for (const root of parseResults) {
    const parentPath = findParentPath(root, node);
    if (parentPath) {
      return [...parentPath, node.name || ''].filter(Boolean).join(' ');
    }
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

const buildAllPatternName = (
  node: TestNode,
  parent: TestNode | undefined,
  parseResults: TestNode[],
  nestedInDescribeEach: boolean,
): string | undefined => {
  const template = getEachTemplate(node);
  if (template) {
    const parentTemplateOrName = nestedInDescribeEach
      ? getEachTemplate(parent) || parent?.name
      : parent?.name;

    const fullTemplateName = [parentTemplateOrName, template]
      .filter(Boolean)
      .join(' ');
    return toTestNamePattern(fullTemplateName);
  }

  const line = node.start?.line;
  if (!line) {
    return undefined;
  }

  return toTestNamePattern(findFullTestName(line, parseResults));
};

const getIndexedTitle = (option: CodeLensOption, index?: number): string => {
  const baseTitle = CODE_LENS_CONFIG[option].title;
  return index !== undefined ? `[${index}] ${baseTitle}` : baseTitle;
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

  const fullTestName =
    toTestNamePattern(buildFullTestName(parsedNode, parseResults)) || '';

  let testIndex: number | undefined;
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

      const sortedTests = sortByStartColumn(sameLineTests);
      testIndex = sortedTests.indexOf(parsedNode) + 1;

      if (!groupsSet.has(groupKey)) {
        groupsSet.add(groupKey);

        const patternName = buildAllPatternName(
          parsedNode,
          parent,
          parseResults,
          nestedInDescribeEach,
        );

        if (patternName) {
          codeLens.push(
            getCodeLensForOption(range, 'run', patternName, 'Run All'),
            getCodeLensForOption(range, 'debug', patternName, 'Debug All'),
          );
        }
      }
    }
  }

  codeLens.push(
    ...codeLensOptions.map((option) => {
      const title = getIndexedTitle(option, testIndex);
      return getCodeLensForOption(range, option, fullTestName, title);
    }),
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
